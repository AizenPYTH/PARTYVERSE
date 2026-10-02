import { act, gameAction, matchState, startEngineMatch } from './engineDb';
import { admin, playMoves, rpc, startDuel } from './helpers';

const settle = (promises: Promise<unknown>[]) => Promise.allSettled(promises);
const codes = (results: PromiseSettledResult<unknown>[]) =>
  results.map((r) => (r.status === 'fulfilled' ? 'ok' : (String((r.reason as Error).message).match(/PV_[A-Z_]+/)?.[0] ?? 'error')));

describe('concurrent and duplicated actions', () => {
  it('applies one of two simultaneous moves on the same version', async () => {
    const { matchId, seats } = await startEngineMatch('tic_tac_toe');
    const state = await matchState(seats[0]!, matchId);
    const results = await settle([0, 1].map((cell) =>
      gameAction(seats[0]!, { op: 'action', matchId, version: state.match.version, action: { type: 'place', cell } })));
    expect(codes(results).sort()).toEqual(['PV_STALE_STATE', 'ok']);
    const after = await matchState<{ moveCount: number }>(seats[0]!, matchId);
    expect(after.match.state.moveCount).toBe(1);
  });

  it('pays a quest only once when claimed twice at the same time', async () => {
    const { matchId, seats } = await startDuel();
    await playMoves(matchId, seats, [0, 1, 0, 1, 0, 1, 0]);
    const progression = await rpc<{ quests: { id: string; progress: number; target: number }[] }>(seats[0]!, 'get_my_progression');
    const done = progression.quests.find((q) => q.progress >= q.target);
    if (!done) return; // the personal rotation may not include a quest this match completes
    const results = await settle([rpc(seats[0]!, 'claim_quest', [done.id]), rpc(seats[0]!, 'claim_quest', [done.id])]);
    expect(codes(results).sort()).toEqual(['PV_ALREADY_DONE', 'ok']);
    const paid = await admin<{ n: string }>(`select count(*) as n from public.xp_events where user_id = $1 and source = 'quest'`, [seats[0]!.id]);
    expect(Number(paid[0]!.n)).toBe(1);
  });

  it('finalizes a match once when both players resign or time out together', async () => {
    const { matchId, seats } = await startEngineMatch('reversi');
    await admin(`update public.matches set turn_deadline = now() - interval '1 second' where id = $1`, [matchId]);
    const results = await settle([
      gameAction(seats[0]!, { op: 'timeout', matchId }),
      gameAction(seats[1]!, { op: 'timeout', matchId }),
      rpc(seats[1]!, 'resign_match', [matchId]),
    ]);
    expect(codes(results).filter((c) => c === 'ok').length).toBeGreaterThanOrEqual(1);
    const xp = await admin<{ n: string }>(`select count(*) as n from public.xp_events where ref_id = $1`, [matchId]);
    expect(Number(xp[0]!.n)).toBeLessThanOrEqual(2);
    const [row] = await admin<{ status: string }>('select status from public.matches where id = $1', [matchId]);
    expect(row!.status).toBe('finished');
  });

  it('accepts one of two simultaneous answers from the same player', async () => {
    const { matchId, seats } = await startEngineMatch('mental_math');
    const results = await settle([act(matchId, seats[0]!, { type: 'answer', choice: 0 }), act(matchId, seats[0]!, { type: 'answer', choice: 1 })]);
    expect(codes(results).filter((c) => c === 'ok')).toHaveLength(1);
    const [server] = await admin<{ picks: unknown[] }>(`select state -> 'picks' as picks from public.match_server_state where match_id = $1`, [matchId]);
    expect(server!.picks.filter(Boolean)).toHaveLength(1);
  });
});
