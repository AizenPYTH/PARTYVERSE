import { admin, asAnon, asUser, createLobby, createUser, expectError, rpc, startDuel } from './helpers';

describe('privileges', () => {
  it('exposes no RPC to anonymous clients', async () => {
    const rows = await admin<{ proname: string }>(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`);
    expect(rows).toEqual([]);
  });

  it('enables RLS on every public table', async () => {
    const rows = await admin(`select tablename from pg_tables where schemaname = 'public' and not rowsecurity`);
    expect(rows).toEqual([]);
  });

  it('only lets anonymous clients read the catalog', async () => {
    const games = await asAnon<{ id: string }>('select id from public.game_catalog');
    expect(games.length).toBeGreaterThanOrEqual(10);
    await expect(asAnon('select * from public.profiles')).rejects.toThrow(/permission denied/);
  });

  it('blocks direct writes to server-managed columns and tables', async () => {
    const user = await createUser();
    await expect(asUser(user, 'update public.profiles set xp = 999999 where id = $1', [user.id])).rejects.toThrow(/permission denied/);
    await expect(asUser(user, 'update public.profiles set level = 99 where id = $1', [user.id])).rejects.toThrow(/permission denied/);
    await expect(asUser(user, `insert into public.player_inventory (user_id, item_id, source) values ($1, 'supernova', 'grant')`, [user.id]))
      .rejects.toThrow(/permission denied/);
    await expect(asUser(user, `insert into public.notifications (user_id, type) values ($1, 'system')`, [user.id]))
      .rejects.toThrow(/permission denied/);
    await expect(asUser(user, `update public.player_ratings set rating = 3000`)).rejects.toThrow(/permission denied/);
  });

  it('cannot call internal helpers directly', async () => {
    const user = await createUser();
    await expect(asUser(user, `select app_private.award_xp($1, 'grant', gen_random_uuid(), 1000, 'cheat')`, [user.id]))
      .rejects.toThrow(/permission denied/);
    await expect(asUser(user, `select app_private.finalize_match(gen_random_uuid(), 0::smallint, 'win', null)`))
      .rejects.toThrow(/permission denied/);
  });

  it('cannot tamper with an active match', async () => {
    const { matchId, seats } = await startDuel();
    await expect(asUser(seats[1], `update public.matches set winner_seat = 1, status = 'finished' where id = $1`, [matchId]))
      .rejects.toThrow(/permission denied/);
  });

  it('only allows owned cosmetics on the profile', async () => {
    const user = await createUser();
    await expect(asUser(user, `update public.profiles set avatar_id = 'supernova' where id = $1`, [user.id]))
      .rejects.toThrow(/PV_ITEM_NOT_OWNED/);
    await asUser(user, `update public.profiles set avatar_id = 'pulse-pink', bio = '  hello  ' where id = $1`, [user.id]);
    const [row] = await admin<{ avatar_id: string; bio: string }>('select avatar_id, bio from public.profiles where id = $1', [user.id]);
    expect(row).toEqual({ avatar_id: 'pulse-pink', bio: 'hello' });
  });

  it('cannot edit someone else profile or settings', async () => {
    const a = await createUser();
    const b = await createUser();
    const updated = await asUser(a, `update public.profiles set bio = 'pwned' where id = $1 returning id`, [b.id]);
    expect(updated).toEqual([]);
    const settings = await asUser(a, `select * from public.user_settings where user_id = $1`, [b.id]);
    expect(settings).toEqual([]);
  });

  it('keeps private lobbies, their chat and matches invisible to strangers', async () => {
    const host = await createUser();
    const stranger = await createUser();
    const lobby = await createLobby(host);
    expect(await asUser(stranger, 'select id from public.lobbies where id = $1', [lobby.id])).toEqual([]);
    expect(await asUser(stranger, 'select * from public.lobby_messages where lobby_id = $1', [lobby.id])).toEqual([]);
    await expectError(rpc(stranger, 'get_lobby_state', [lobby.id]), 'PV_LOBBY_NOT_FOUND');
    await expectError(rpc(stranger, 'join_lobby', [lobby.id, false]), 'PV_LOBBY_FORBIDDEN');

    const duel = await startDuel();
    expect(await asUser(stranger, 'select id from public.matches where id = $1', [duel.matchId])).toEqual([]);
    await expectError(rpc(stranger, 'get_match_state', [duel.matchId]), 'PV_MATCH_NOT_FOUND');
  });

  it('rejects suspended accounts', async () => {
    const user = await createUser();
    await admin(`insert into app_private.moderation_actions (user_id, action, reason) values ($1, 'suspend', 'test')`, [user.id]);
    await expectError(rpc(user, 'presence_heartbeat', [null]), 'PV_ACCOUNT_SUSPENDED');
  });

  it('validates and protects usernames', async () => {
    const user = await createUser({ onboard: false });
    await expectError(rpc(user, 'complete_onboarding', ['Ab', null, null, null]), 'PV_USERNAME_INVALID');
    await expectError(rpc(user, 'complete_onboarding', ['the_admin_1', null, null, null]), 'PV_USERNAME_RESERVED');
    const other = await createUser();
    await expectError(rpc(user, 'complete_onboarding', [other.username, null, null, null]), 'PV_USERNAME_TAKEN');
    expect(await rpc(user, 'is_username_available', [other.username])).toBe(false);
    await expectError(rpc(user, 'create_lobby', ['connect_four']), 'PV_ONBOARDING_REQUIRED');
  });
});
