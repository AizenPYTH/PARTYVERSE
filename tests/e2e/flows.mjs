// PARTYVERSE end-to-end scenario, driven through the real web build with two
// independent browser users. See tests/e2e/run.sh for the stack.
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright-core';
import pg from 'pg';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:8081';
const ARTIFACTS = process.env.ARTIFACTS ?? 'tests/e2e/artifacts';
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const suffix = randomUUID().slice(0, 6);
const results = [];
const players = [];

const step = async (name, run) => {
  const started = Date.now();
  try {
    await run();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`  ✓ ${name} (${Date.now() - started} ms)`);
  } catch (error) {
    results.push({ name, ok: false });
    await Promise.all(players.map((p) => shot(p.page, `failure-${p.displayName}`).catch(() => undefined)));
    console.log(`  ✕ ${name}\n    ${String(error?.message ?? error).split('\n').slice(0, 6).join('\n    ')}`);
    throw error;
  }
};

// Stack screens stay mounted on web: only the visible element counts.
const testId = (page, id) => page.getByTestId(id).filter({ visible: true }).first();
const button = (page, name) => page.getByRole('button', { name, exact: typeof name === 'string' }).filter({ visible: true }).first();
// The in-game status line carries the authoritative countdown ("À toi de jouer · 0:58").
const MY_TURN = /^À toi de jouer · \d+:\d{2}$/;
const shot = (page, name) => page.screenshot({ path: `${ARTIFACTS}/${name}.png` });

async function newPlayer(browser, handle, displayName) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'fr-FR' });
  const page = await context.newPage();
  page.on('dialog', (dialog) => dialog.accept());
  page.on('pageerror', (error) => console.log(`    [${handle}] page error: ${error.message}`));
  return { context, page, handle: `${handle}_${suffix}`, displayName, email: `${handle}.${suffix}@e2e.test` };
}

async function signUpAndOnboard(player, avatarName) {
  const { page } = player;
  await page.goto(BASE_URL);
  await button(page, 'Créer un compte').click();
  await page.getByLabel('E-mail').fill(player.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill('partyverse42');
  await page.getByLabel('Confirmer le mot de passe').fill('partyverse42');
  await button(page, 'Créer mon compte').click();
  await page.getByText('Choisis ton pseudo').waitFor({ timeout: 15_000 });
  await page.getByLabel('Pseudo').fill(player.handle);
  await page.getByText('Disponible').waitFor();
  await page.getByLabel('Nom affiché (facultatif)').fill(player.displayName);
  await shot(page, `01-onboarding-${player.displayName}`);
  await button(page, 'Continuer').click();
  await page.getByText('Ton avatar').waitFor();
  await page.getByRole('radio', { name: avatarName }).click();
  await button(page, 'Continuer').click();
  await page.getByText('Tes jeux préférés').waitFor();
  await button(page, 'Connect Four').click();
  await button(page, 'Créer mon profil').click();
  await page.getByText('Retrouve tes amis').waitFor();
  await button(page, 'C’est parti !').click();
  await page.getByText(new RegExp(`, ${player.displayName}$`)).waitFor({ timeout: 15_000 });
}

async function playerOnTurn(a, b) {
  for (let i = 0; i < 60; i++) {
    if (await a.page.getByText(MY_TURN).isVisible().catch(() => false)) return [a, b];
    if (await b.page.getByText(MY_TURN).isVisible().catch(() => false)) return [b, a];
    await a.page.waitForTimeout(250);
  }
  throw new Error('nobody has the turn');
}

async function play(first, second, columns) {
  for (const [index, column] of columns.entries()) {
    const player = index % 2 === 0 ? first : second;
    await player.page.getByText(MY_TURN).waitFor({ timeout: 15_000 });
    await player.page.getByTestId(`c4-column-${column}`).click();
    if (index === 2) await shot(player.page, '06-connect-four-in-progress');
  }
}

async function main() {
  await db.connect();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const nova = await newPlayer(browser, 'nova', 'Nova');
  const leo = await newPlayer(browser, 'leo', 'Léo');
  players.push(nova, leo);

  await step('sign-up, e-mail session and onboarding (Nova)', () => signUpAndOnboard(nova, 'Comète ambre'));
  await step('sign-up, e-mail session and onboarding (Léo)', () => signUpAndOnboard(leo, 'Quasar bleu'));
  await shot(nova.page, '02-home-new-user');

  await step('Léo finds Nova and sends a friend request', async () => {
    await leo.page.getByRole('tab', { name: /^Amis/ }).click();
    await button(leo.page, '+ Ajouter').click();
    await leo.page.getByLabel('Rechercher un joueur').fill(nova.handle);
    await button(leo.page, 'Ajouter').click();
    await leo.page.getByText('Envoyée').waitFor();
  });

  await step('Nova accepts the request', async () => {
    await nova.page.reload();
    await nova.page.getByRole('tab', { name: /^Amis/ }).click();
    await nova.page.getByRole('tab', { name: /^Demandes/ }).click();
    await shot(nova.page, '03-friend-request');
    await button(nova.page, 'Accepter').click();
    await nova.page.getByRole('tab', { name: /^Tous · 1/ }).waitFor();
  });

  await step('Nova creates a Connect Four room and invites Léo', async () => {
    await nova.page.getByRole('tab', { name: /^Accueil/ }).click();
    await nova.page.getByTestId('home-hero').click();
    await nova.page.getByTestId('lobby-ready').waitFor();
    await button(nova.page, 'Inviter un ami').click();
    await button(nova.page, 'Inviter').click();
    await nova.page.getByText('Invité', { exact: true }).waitFor();
    await nova.page.keyboard.press('Escape');
  });

  await step('Léo receives the invitation and joins', async () => {
    await button(leo.page, 'Retour').click();
    await leo.page.getByRole('tab', { name: /^Accueil/ }).click();
    await leo.page.getByText(/t’invite$/).waitFor({ timeout: 30_000 });
    await shot(leo.page, '04-home-invitation');
    await button(leo.page, 'Rejoindre').click();
    await leo.page.getByTestId('lobby-ready').waitFor();
  });

  await step('both players get ready, host starts the match', async () => {
    await leo.page.getByTestId('lobby-ready').click();
    await nova.page.getByTestId('lobby-ready').click();
    await nova.page.getByTestId('lobby-start').waitFor({ timeout: 15_000 });
    await shot(nova.page, '05-lobby-all-ready');
    await nova.page.getByTestId('lobby-start').click();
    await Promise.all([
      nova.page.getByText('CONNECT FOUR · MANCHE 1').waitFor({ timeout: 15_000 }),
      leo.page.getByText('CONNECT FOUR · MANCHE 1').waitFor({ timeout: 15_000 }),
    ]);
  });

  let first;
  let second;
  await step('round 1 is played move by move and validated by the server', async () => {
    [first, second] = await playerOnTurn(nova, leo);
    // A rejected out-of-turn tap must not change anything.
    await second.page.getByTestId('c4-column-6').click({ force: true, trial: false }).catch(() => undefined);
    await play(first, second, [0, 0, 1, 1, 2, 2, 3]);
    await first.page.getByText('Victoire', { exact: true }).waitFor({ timeout: 15_000 });
    await first.page.getByText('+40 XP').waitFor();
    await second.page.getByText('Défaite', { exact: true }).waitFor({ timeout: 15_000 });
    await second.page.getByText('+10 XP · la revanche est à un tap').waitFor();
    await shot(first.page, '07-result-victory');
    await shot(second.page, '08-result-defeat');
  });

  await step('server persisted results, XP and moves', async () => {
    const { rows } = await db.query(
      // Match XP only: the first win also unlocks achievements, paid separately.
      `select p.username, s.wins, s.losses,
              (select coalesce(sum(e.amount), 0) from public.xp_events e where e.user_id = p.id and e.source = 'match') as xp
         from public.profiles p
         join public.player_game_stats s on s.user_id = p.id and s.game_id = 'connect_four'
        where p.username = any($1) order by xp desc`,
      [[nova.handle, leo.handle]],
    );
    const winner = rows[0];
    const loser = rows[1];
    if (winner?.username !== first.handle || Number(winner.xp) !== 40 || winner.wins !== 1) throw new Error(JSON.stringify(rows));
    if (Number(loser.xp) !== 10 || loser.losses !== 1) throw new Error(JSON.stringify(rows));
    const moves = await db.query(`select count(*)::int as n from public.match_moves`);
    if (moves.rows[0].n !== 7) throw new Error(`expected 7 moves, got ${moves.rows[0].n}`);
  });

  await step('rematch: the previous loser starts round 2', async () => {
    await button(second.page, 'Revanche').click();
    await button(first.page, 'Revanche').click();
    const host = nova;
    await host.page.getByTestId('lobby-start').waitFor({ timeout: 15_000 });
    await host.page.getByTestId('lobby-start').click();
    await second.page.getByText('CONNECT FOUR · MANCHE 2').waitFor({ timeout: 15_000 });
    await second.page.getByText(MY_TURN).waitFor({ timeout: 15_000 });
    await first.page.getByText(/^Tour de .+ · \d+:\d{2}$/).waitFor({ timeout: 15_000 });
    await shot(second.page, '09-round-2-loser-starts');
  });

  await step('resigning ends round 2 and both return to the room', async () => {
    await button(second.page, 'Menu de la partie').click();
    await button(second.page, 'Abandonner la manche').click();
    await second.page.getByText('Défaite', { exact: true }).waitFor({ timeout: 15_000 });
    await first.page.getByText('Victoire', { exact: true }).waitFor({ timeout: 15_000 });
    await button(first.page, 'Revanche').click();
    await button(second.page, 'Revanche').click();
  });

  await step('host switches the same room to Tic-Tac-Toe (engine game via Edge Function)', async () => {
    await button(nova.page, 'Options du salon').click();
    await button(nova.page, 'Changer de jeu').click();
    await nova.page.getByRole('radio', { name: 'Morpion' }).click();
    await nova.page.getByText(/Nouveau jeu : Morpion/).waitFor({ timeout: 15_000 });
    for (const player of [nova, leo]) {
      await player.page.getByTestId('lobby-ready').waitFor({ timeout: 15_000 });
      await player.page.getByTestId('lobby-ready').click();
    }
    await nova.page.getByTestId('lobby-start').waitFor({ timeout: 15_000 });
    await nova.page.getByTestId('lobby-start').click();
    await Promise.all([
      nova.page.getByText('MORPION · MANCHE 3').waitFor({ timeout: 15_000 }),
      leo.page.getByText('MORPION · MANCHE 3').waitFor({ timeout: 15_000 }),
    ]);
  });

  await step('a full Tic-Tac-Toe game is validated by the engine and finalized by SQL', async () => {
    const [x, o] = await playerOnTurn(nova, leo);
    for (const [index, cell] of [0, 4, 1, 8, 2].entries()) {
      const player = index % 2 === 0 ? x : o;
      await player.page.getByText(MY_TURN).waitFor({ timeout: 15_000 });
      await player.page.getByTestId(`ttt-cell-${cell}`).click();
    }
    await x.page.getByText('Victoire', { exact: true }).waitFor({ timeout: 15_000 });
    await o.page.getByText('Défaite', { exact: true }).waitFor({ timeout: 15_000 });
    await shot(x.page, '11-tic-tac-toe-victory');
    const { rows } = await db.query(
      `select m.outcome, m.result_detail ->> 'reason' as reason from public.matches m where m.game_id = 'tic_tac_toe' order by m.started_at desc limit 1`,
    );
    if (rows[0]?.outcome !== 'win' || rows[0]?.reason !== 'line') throw new Error(JSON.stringify(rows));
  });

  await step('Battleship: secret simultaneous placement, then shots validated by the engine', async () => {
    await button(nova.page, 'Revanche').click();
    await button(leo.page, 'Revanche').click();
    await button(nova.page, 'Options du salon').click();
    await button(nova.page, 'Changer de jeu').click();
    await nova.page.getByRole('radio', { name: 'Bataille navale' }).click();
    await nova.page.getByText(/Nouveau jeu : Bataille navale/).waitFor({ timeout: 15_000 });
    for (const player of [nova, leo]) {
      await player.page.getByTestId('lobby-ready').waitFor({ timeout: 15_000 });
      await player.page.getByTestId('lobby-ready').click();
    }
    await nova.page.getByTestId('lobby-start').waitFor({ timeout: 15_000 });
    await nova.page.getByTestId('lobby-start').click();
    for (const player of [nova, leo]) {
      await player.page.getByText('Place ta flotte').waitFor({ timeout: 15_000 });
    }
    await shot(nova.page, '12-battleship-placement');
    await nova.page.getByTestId('bs-confirm').click();
    await leo.page.getByText(/place sa flotte|Place ta flotte/).waitFor({ timeout: 15_000 });
    await leo.page.getByTestId('bs-confirm').click();

    const [shooter, target] = await playerOnTurn(nova, leo);
    await shooter.page.getByText(MY_TURN).waitFor({ timeout: 15_000 });
    await shooter.page.getByTestId('bs-fire-0').click();
    await target.page.getByText(MY_TURN).waitFor({ timeout: 15_000 });
    await shot(target.page, '13-battleship-battle');

    const { rows } = await db.query(
      `select m.state::text as public_state,
              (select string_agg(mv.action::text, ' ') from public.match_moves mv where mv.match_id = m.id) as moves
         from public.matches m where m.game_id = 'battleship' order by m.started_at desc limit 1`,
    );
    const row = rows[0];
    if (!row || row.public_state.includes('"cells"') || row.moves.includes('carrier')) {
      throw new Error(`fleet leaked: ${JSON.stringify(row)}`);
    }
    await button(target.page, 'Menu de la partie').click();
    await button(target.page, 'Abandonner la manche').click();
    await shooter.page.getByText('Victoire', { exact: true }).waitFor({ timeout: 15_000 });
  });

  await step('Calcul Express: simultaneous answers, server reveal and scoring', async () => {
    await button(nova.page, 'Revanche').click();
    await button(leo.page, 'Revanche').click();
    await button(nova.page, 'Options du salon').click();
    await button(nova.page, 'Changer de jeu').click();
    await nova.page.getByRole('radio', { name: 'Calcul Express' }).click();
    await nova.page.getByText(/Nouveau jeu : Calcul Express/).waitFor({ timeout: 15_000 });
    for (const player of [nova, leo]) {
      await player.page.getByTestId('lobby-ready').waitFor({ timeout: 15_000 });
      await player.page.getByTestId('lobby-ready').click();
    }
    await nova.page.getByTestId('lobby-start').waitFor({ timeout: 15_000 });
    await nova.page.getByTestId('lobby-start').click();
    for (const player of [nova, leo]) await player.page.getByText(/^Choisis ta réponse/).waitFor({ timeout: 15_000 });
    await nova.page.getByTestId('quiz-choice-0').click();
    await nova.page.getByText(/^Réponse envoyée/).waitFor({ timeout: 15_000 });
    await leo.page.getByText('1/2 ont répondu').waitFor({ timeout: 15_000 });
    await leo.page.getByTestId('quiz-choice-1').click();
    for (const player of [nova, leo]) {
      await player.page.getByText(/^(Bonne réponse · \+\d+|Mauvaise réponse)/).waitFor({ timeout: 15_000 });
    }
    await shot(leo.page, '14-mental-math-reveal');
    // The reveal step times out and the next question opens for both.
    for (const player of [nova, leo]) await player.page.getByText('Question 2/10').waitFor({ timeout: 20_000 });
    await button(leo.page, 'Menu de la partie').click();
    await button(leo.page, 'Abandonner la manche').click();
    await nova.page.getByText('Victoire', { exact: true }).waitFor({ timeout: 15_000 });
  });

  await step('private messages: Léo writes to Nova from her profile, Nova reads it', async () => {
    const { rows } = await db.query('select id from public.profiles where username = $1', [nova.handle]);
    await leo.page.goto(`${BASE_URL}/player/${rows[0].id}`);
    await testId(leo.page, 'player-message').click();
    await testId(leo.page, 'dm-input').fill('Salut Nova, revanche ce soir ?');
    await testId(leo.page, 'dm-send').click();
    await leo.page.getByText('Salut Nova, revanche ce soir ?').filter({ visible: true }).first().waitFor({ timeout: 15_000 });

    await nova.page.goto(`${BASE_URL}/friends`);
    await nova.page.getByTestId('open-messages').filter({ hasText: 'Messages · 1', visible: true }).first().waitFor({ timeout: 20_000 });
    await testId(nova.page, 'open-messages').click();
    await button(nova.page, new RegExp(`^${leo.displayName}`)).click();
    await nova.page.getByText('Salut Nova, revanche ce soir ?').filter({ visible: true }).first().waitFor({ timeout: 15_000 });
    await shot(nova.page, '15-direct-messages');
    const unread = await db.query(
      `select count(*)::int as n from public.direct_messages m join public.conversation_members cm
          on cm.conversation_id = m.conversation_id and cm.user_id = $1
        where m.sender_id <> $1 and m.created_at > cm.last_read_at`,
      [rows[0].id],
    );
    if (unread.rows[0].n !== 0) throw new Error('message not marked as read');
  });

  await step('groups: Nova creates a group, invites Léo, they chat', async () => {
    await nova.page.goto(`${BASE_URL}/groups`);
    await testId(nova.page, 'group-create').click();
    await testId(nova.page, 'group-name').fill(`Comètes ${suffix}`);
    await testId(nova.page, 'group-create-confirm').click();
    await nova.page.getByText('Défi de la semaine').filter({ visible: true }).first().waitFor({ timeout: 15_000 });
    await button(nova.page, 'Inviter').click();
    const leoId = (await db.query('select id from public.profiles where username = $1', [leo.handle])).rows[0].id;
    await testId(nova.page, `group-invite-${leoId}`).click();
    await nova.page.getByText('INVITÉ', { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 15_000 });

    await leo.page.goto(`${BASE_URL}/groups`);
    const { rows } = await db.query('select id from public.groups where name = $1', [`Comètes ${suffix}`]);
    await testId(leo.page, `group-accept-${rows[0].id}`).click();
    await leo.page.getByText('Défi de la semaine').filter({ visible: true }).first().waitFor({ timeout: 15_000 });
    await testId(leo.page, 'group-chat').click();
    await testId(leo.page, 'group-chat-input').fill('Présent !');
    await testId(leo.page, 'group-chat-send').click();

    await nova.page.goto(`${BASE_URL}/groups/${rows[0].id}`);
    await testId(nova.page, 'group-chat').click();
    await nova.page.getByText('Présent !').filter({ visible: true }).first().waitFor({ timeout: 20_000 });
    await shot(nova.page, '16-group-chat');
  });

  await step('progression: quests and achievements come from real matches, claims pay once', async () => {
    await nova.page.goto(`${BASE_URL}/quests`);
    await nova.page.getByText('Quêtes du jour').filter({ visible: true }).first().waitFor({ timeout: 15_000 });
    await nova.page.getByText('Première partie').or(nova.page.getByText('Premiers pas')).filter({ visible: true }).first().waitFor({ timeout: 15_000 });
    const { rows: me } = await db.query('select id from public.profiles where username = $1', [nova.handle]);
    const unlocked = await db.query(`select count(*)::int as n from public.player_achievements where user_id = $1`, [me[0].id]);
    if (unlocked.rows[0].n < 1) throw new Error('no achievement unlocked after several real matches');
    const claim = nova.page.locator('[data-testid^="quest-claim-"]').filter({ visible: true }).first();
    if (await claim.count()) {
      await claim.click();
      await nova.page.getByText('Récupérée ✓').filter({ visible: true }).first().waitFor({ timeout: 15_000 });
      const paid = await db.query(`select count(*)::int as n from public.xp_events where user_id = $1 and source = 'quest'`, [me[0].id]);
      if (paid.rows[0].n !== 1) throw new Error(`quest paid ${paid.rows[0].n} times`);
    }
    await shot(nova.page, '17-quests');
  });

  await step('profile shows server-side stats', async () => {
    await first.page.goto(`${BASE_URL}/profile`);
    await first.page.getByText('Parties', { exact: true }).waitFor({ timeout: 15_000 });
    await shot(first.page, '10-profile');
  });

  await browser.close();
  await db.end();
}

main()
  .then(() => {
    console.log(`\n${results.length} scenario steps passed`);
    process.exit(0);
  })
  .catch(async () => {
    console.log(`\nE2E failed after ${results.filter((r) => r.ok).length} passing steps`);
    await db.end().catch(() => undefined);
    process.exit(1);
  });
