import { act, gameAction, matchState, startEngineMatch } from './engineDb';
import { admin, asUser, createUser, expectError } from './helpers';

interface ImpostorView {
  phase: string;
  order: number[];
  clues: { seat: number; text: string | null }[];
  voted: boolean[];
  reveal?: { impostor: number; civilianWord: string; votes: number[] };
}

const expire = (matchId: string) =>
  admin(`update public.matches set turn_deadline = now() - interval '1 second' where id = $1`, [matchId]);

describe('impostor through the game-action handler', () => {
  it('keeps roles, words and votes secret until the reveal', async () => {
    const { matchId, seats } = await startEngineMatch('impostor', 4, { rounds: 1 });
    const players = seats.map((p) => p!);
    const [server] = await admin<{ impostor: number; civilian: string }>(
      `select (state ->> 'impostor')::int as impostor, state ->> 'civilianWord' as civilian from public.match_server_state where match_id = $1`,
      [matchId],
    );
    const imp = server!.impostor;

    const views = await Promise.all(players.map((p) => matchState<ImpostorView>(p, matchId)));
    for (const view of views) {
      expect(JSON.stringify(view.match.state)).not.toContain(server!.civilian);
      expect(view.match.state).not.toHaveProperty('reveal');
    }
    const words = views.map((v) => (v.private_state as { word: string }).word);
    expect(words.filter((w) => w === server!.civilian)).toHaveLength(3);
    expect(words[imp]).not.toBe(server!.civilian);
    // Nobody reads someone else's word.
    const rows = await asUser(players[0]!, 'select seat from public.match_private_state where match_id = $1', [matchId]);
    expect(rows).toEqual([{ seat: 0 }]);

    // Clues in order.
    for (const seat of views[0]!.match.state.order) {
      await expectError(act(matchId, players[(seat + 1) % 4]!, { type: 'clue', text: 'mauvais tour' }), 'PV_NOT_YOUR_TURN');
      await act(matchId, players[seat]!, { type: 'clue', text: `indice ${seat}` });
    }
    expect((await matchState<ImpostorView>(players[0]!, matchId)).match.state.phase).toBe('discussion');
    await expire(matchId);
    await gameAction(players[1]!, { op: 'timeout', matchId });

    // Everybody votes for the impostor; the impostor votes for seat (imp + 1).
    for (const [seat, player] of players.entries()) {
      await act(matchId, player, { type: 'vote', target: seat === imp ? (imp + 1) % 4 : imp });
    }
    const moves = await asUser(players[1]!, 'select action from public.match_moves where match_id = $1', [matchId]);
    expect(JSON.stringify(moves)).not.toContain('target');
    expect((await matchState<ImpostorView>(players[0]!, matchId)).match.state.phase).toBe('guess');

    await act(matchId, players[imp]!, { type: 'guess', text: 'mauvaise réponse' });
    const final = await matchState<ImpostorView>(players[0]!, matchId);
    expect(final.match).toMatchObject({ status: 'finished', outcome: 'completed', result_detail: { reason: 'impostor_caught' } });
    expect(final.match.state.reveal).toMatchObject({ impostor: imp, civilianWord: server!.civilian });
    expect(final.players.find((p) => p.seat === imp)).toMatchObject({ result: 'loss' });
    expect(final.players.filter((p) => p.result === 'win')).toHaveLength(3);
  });

  it('keeps the word bank out of reach and requires three players', async () => {
    const user = await createUser();
    await expect(asUser(user, 'select * from app_private.impostor_words')).rejects.toThrow(/permission denied/);
    const [count] = await admin<{ n: string }>('select count(*) as n from app_private.impostor_words');
    expect(Number(count!.n)).toBeGreaterThanOrEqual(50);
    await expect(startEngineMatch('impostor', 2)).rejects.toThrow(/PV_/);
  });
});
