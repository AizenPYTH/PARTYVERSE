import { act, gameAction, matchState, startEngineMatch } from './engineDb';
import { admin, expectError, rpc } from './helpers';

const sq = (row: number, col: number) => row * 8 + col;

describe('reversi through the game-action handler', () => {
  it('validates placements server-side and reports disc counts', async () => {
    const { matchId, seats } = await startEngineMatch('reversi', 2, { turn_seconds: 20 });
    const [black, white] = seats as [typeof seats[0], typeof seats[0]];
    const initial = await matchState<{ counts: number[] }>(black!, matchId);
    expect(initial.match).toMatchObject({ status: 'active', current_turn_seat: 0, active_seats: [0] });
    expect(initial.match.state.counts).toEqual([2, 2]);

    await expectError(act(matchId, white!, { type: 'place', square: 19 }), 'PV_NOT_YOUR_TURN');
    await expectError(act(matchId, black!, { type: 'place', square: 0 }), 'PV_INVALID_MOVE');
    await act(matchId, black!, { type: 'place', square: 19 });
    const after = await matchState<{ counts: number[]; board: (number | null)[] }>(white!, matchId);
    expect(after.match.state.counts).toEqual([4, 1]);
    expect(after.match.current_turn_seat).toBe(1);

    const [moves] = await admin<{ count: string }>('select count(*) from public.match_moves where match_id = $1', [matchId]);
    expect(Number(moves!.count)).toBeGreaterThanOrEqual(1);
  });

  it('awards the game to the opponent when the turn clock expires', async () => {
    const { matchId, seats } = await startEngineMatch('reversi');
    await admin(`update public.matches set turn_deadline = now() - interval '1 second' where id = $1`, [matchId]);
    await gameAction(seats[1]!, { op: 'timeout', matchId });
    const final = await matchState(seats[0]!, matchId);
    expect(final.match).toMatchObject({ status: 'finished', outcome: 'timeout', winner_seat: 1 });
  });
});

describe('checkers through the game-action handler', () => {
  it('enforces mandatory captures on the server', async () => {
    const { matchId, seats } = await startEngineMatch('checkers');
    const [bottom, top] = seats;
    // 1. 5,2→4,3   2. 2,5→3,4 (now bottom must capture 4,3×3,4→2,5)
    await act(matchId, bottom!, { type: 'move', path: [sq(5, 2), sq(4, 3)] });
    await act(matchId, top!, { type: 'move', path: [sq(2, 5), sq(3, 4)] });
    await expectError(act(matchId, bottom!, { type: 'move', path: [sq(5, 0), sq(4, 1)] }), 'PV_INVALID_MOVE');
    await act(matchId, bottom!, { type: 'move', path: [sq(4, 3), sq(2, 5)] });

    const state = await matchState<{ board: ({ s: number } | null)[] }>(top!, matchId);
    expect(state.match.state.board[sq(3, 4)]).toBeNull();
    expect(state.match.state.board.filter((p) => p?.s === 1)).toHaveLength(11);
    // Top must recapture now (1,4×2,5→3,6 or 1,6×2,5→3,4).
    expect(state.match.current_turn_seat).toBe(1);
    await expectError(act(matchId, top!, { type: 'move', path: [sq(2, 1), sq(3, 0)] }), 'PV_INVALID_MOVE');
  });

  it('lets a player resign and finalizes the match', async () => {
    const { matchId, seats } = await startEngineMatch('checkers');
    await rpc(seats[0]!, 'resign_match', [matchId]);
    const final = await matchState(seats[1]!, matchId);
    expect(final.match).toMatchObject({ status: 'finished', winner_seat: 1 });
  });
});
