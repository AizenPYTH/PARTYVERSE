import { attempt, ctx, play } from './testing';
import { ticTacToe } from './tic-tac-toe';

describe('tic-tac-toe engine', () => {
  it('alternates turns and detects a line', () => {
    let t = ticTacToe.init(ctx({ settings: { turn_seconds: 10 } }));
    expect(t).toMatchObject({ activeSeats: [0], turnSeat: 0, deadlineMs: 10_000 });
    for (const [seat, cell] of [[0, 0], [1, 4], [0, 1], [1, 8]] as const) t = play(ticTacToe, t, seat, { type: 'place', cell });
    t = play(ticTacToe, t, 0, { type: 'place', cell: 2 });
    expect(t.outcome).toMatchObject({ outcome: 'win', reason: 'line' });
    expect(t.outcome?.results.find((r) => r.seat === 0)?.result).toBe('win');
    expect(t.state.winLine).toEqual([0, 1, 2]);
  });

  it('detects a draw on a full board', () => {
    let t = ticTacToe.init(ctx());
    const cells = [0, 1, 2, 4, 3, 5, 7, 6, 8];
    cells.forEach((cell, index) => (t = play(ticTacToe, t, index % 2, { type: 'place', cell })));
    expect(t.outcome).toMatchObject({ outcome: 'draw', reason: 'full_board' });
  });

  it('rejects wrong turns, occupied and invalid cells', () => {
    const t = play(ticTacToe, ticTacToe.init(ctx()), 0, { type: 'place', cell: 4 });
    expect(attempt(ticTacToe, t, 0, { type: 'place', cell: 0 })).toBe('PV_NOT_YOUR_TURN');
    expect(attempt(ticTacToe, t, 1, { type: 'place', cell: 4 })).toBe('PV_INVALID_MOVE');
    expect(attempt(ticTacToe, t, 1, { type: 'place', cell: 9 })).toBe('PV_INVALID_MOVE');
    expect(attempt(ticTacToe, t, 1, { type: 'place', cell: 1.5 })).toBe('PV_INVALID_MOVE');
  });

  it('gives the win to the opponent on timeout', () => {
    const t = ticTacToe.onTimeout(ticTacToe.init(ctx()).state, ctx());
    expect(t.outcome?.results.find((r) => r.result === 'win')?.seat).toBe(1);
  });
});
