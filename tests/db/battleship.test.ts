import { FLEET } from '../../supabase/functions/_shared/engines/battleship';
import { act, gameAction, matchState, startEngineMatch } from './engineDb';
import { admin, asUser, expectError } from './helpers';

const ROWS = FLEET.map((ship, row) => ({ id: ship.id, row, col: 0, vertical: false }));
const COLUMNS = FLEET.map((ship, col) => ({ id: ship.id, row: 0, col, vertical: true }));

describe('battleship hidden information', () => {
  it('keeps each fleet visible only to its owner until the end', async () => {
    const { matchId, seats } = await startEngineMatch('battleship');
    const [a, b] = seats as [NonNullable<typeof seats[0]>, NonNullable<typeof seats[0]>];
    await act(matchId, a, { type: 'place', ships: ROWS });

    // b sees that a placed, but not where.
    const seenByB = await matchState<{ placed: boolean[] }>(b, matchId);
    expect(seenByB.match.state.placed).toEqual([true, false]);
    expect(seenByB.private_state).toBeNull();
    expect(JSON.stringify(seenByB)).not.toContain('"cells"');
    const visible = await asUser<{ seat: number; state: unknown }>(b, 'select seat, state from public.match_private_state where match_id = $1', [matchId]);
    expect(visible).toEqual([{ seat: 1, state: null }]);
    await expect(asUser(b, 'select * from public.match_server_state where match_id = $1', [matchId])).rejects.toThrow(/permission denied/);
    const moves = await asUser<{ action: unknown }>(b, 'select action from public.match_moves where match_id = $1', [matchId]);
    expect(JSON.stringify(moves)).not.toContain('carrier');

    const seenByA = await matchState<unknown>(a, matchId);
    expect((seenByA.private_state as { fleet: unknown[] }).fleet).toHaveLength(5);

    await act(matchId, b, { type: 'place', ships: COLUMNS });
    const battle = await matchState<{ phase: string }>(a, matchId);
    expect(battle.match).toMatchObject({ current_turn_seat: 0, active_seats: [0] });
    expect(battle.match.state.phase).toBe('battle');

    await act(matchId, a, { type: 'fire', square: 4 });
    const afterShot = await matchState<{ shots: { square: number; hit: boolean }[][] }>(b, matchId);
    expect(afterShot.match.state.shots[0]).toEqual([{ square: 4, hit: true }]);
    await expectError(act(matchId, a, { type: 'fire', square: 5 }), 'PV_NOT_YOUR_TURN');
  });

  it('auto-places a missing fleet when the placement clock runs out', async () => {
    const { matchId, seats } = await startEngineMatch('battleship');
    await act(matchId, seats[0]!, { type: 'place', ships: ROWS });
    await admin(`update public.matches set turn_deadline = now() - interval '1 second' where id = $1`, [matchId]);
    await gameAction(seats[0]!, { op: 'timeout', matchId });
    const state = await matchState<{ phase: string; autoPlaced: number[] }>(seats[1]!, matchId);
    expect(state.match.state).toMatchObject({ phase: 'battle', autoPlaced: [1] });
    expect((state.private_state as { fleet: unknown[] }).fleet).toHaveLength(5);
  });
});
