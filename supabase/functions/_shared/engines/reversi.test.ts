import { countDiscs, flipsFor, initialBoard, legalSquares, reversi, type Disc, type ReversiState } from './reversi';
import { attempt, ctx, play } from './testing';
import type { Transition } from './types';

const boardWith = (discs: Record<number, Disc>) => {
  const board = Array<Disc | null>(64).fill(null);
  for (const [square, disc] of Object.entries(discs)) board[Number(square)] = disc;
  return board;
};

const position = (board: (Disc | null)[], turn = 0): Transition<ReversiState> => ({
  state: { ...reversi.init(ctx()).state, board, turn },
  activeSeats: [turn],
  turnSeat: turn,
  deadlineMs: 30_000,
});

describe('reversi engine', () => {
  it('starts with the four central discs and four legal moves for Black', () => {
    const t = reversi.init(ctx({ settings: { turn_seconds: 20 } }));
    expect(t).toMatchObject({ activeSeats: [0], turnSeat: 0, deadlineMs: 20_000 });
    expect(countDiscs(initialBoard())).toEqual([2, 2]);
    expect(legalSquares(initialBoard(), 0).sort((a, b) => a - b)).toEqual([19, 26, 37, 44]);
  });

  it('flips sandwiched discs in every direction and passes the turn', () => {
    const t = play(reversi, reversi.init(ctx()), 0, { type: 'place', square: 19 });
    expect(t.state.board[27]).toBe(0);
    expect(t.state.lastFlips).toEqual([27]);
    expect(countDiscs(t.state.board)).toEqual([4, 1]);
    expect(t.turnSeat).toBe(1);
    // Row (2, 1 up to Black on 0) and anti-diagonal (10, 17 up to Black on 24); 11 is not closed.
    const board = boardWith({ 0: 0, 1: 1, 2: 1, 10: 1, 17: 1, 24: 0, 11: 1 });
    expect(flipsFor(board, 0, 3).sort((a, b) => a - b)).toEqual([1, 2, 10, 17]);
  });

  it('does not wrap around the board edges', () => {
    // 7 is the end of row 0 and 8 the start of row 1: they are not neighbours.
    expect(flipsFor(boardWith({ 8: 1, 9: 0 }), 0, 7)).toEqual([]);
  });

  it('rejects illegal placements and wrong turns', () => {
    const t = reversi.init(ctx());
    expect(attempt(reversi, t, 1, { type: 'place', square: 19 })).toBe('PV_NOT_YOUR_TURN');
    expect(attempt(reversi, t, 0, { type: 'place', square: 0 })).toBe('PV_INVALID_MOVE');
    expect(attempt(reversi, t, 0, { type: 'place', square: 27 })).toBe('PV_INVALID_MOVE');
    expect(attempt(reversi, t, 0, { type: 'place', square: 64 })).toBe('PV_INVALID_MOVE');
    expect(attempt(reversi, t, 0, { type: 'place', square: '19' })).toBe('PV_INVALID_MOVE');
  });

  it('makes a player without legal move pass', () => {
    // After Black takes 2, White (48 only) cannot sandwich anything but Black can still play 40.
    const t = play(reversi, position(boardWith({ 0: 0, 1: 1, 56: 0, 48: 1 })), 0, { type: 'place', square: 2 });
    expect(t.outcome).toBeUndefined();
    expect(t.turnSeat).toBe(0);
    expect(t.log).toMatchObject({ pass: 1 });
    expect(t.state.history.at(-1)).toEqual({ seat: 1, square: null });
  });

  it('ends when nobody can move and ranks by disc count', () => {
    const t = play(reversi, position(boardWith({ 0: 0, 1: 1 })), 0, { type: 'place', square: 2 });
    expect(t.outcome).toMatchObject({ outcome: 'win', reason: 'board_complete' });
    expect(t.outcome?.results).toEqual([
      { seat: 0, result: 'win', rank: 1, score: 3 },
      { seat: 1, result: 'loss', rank: 2, score: 0 },
    ]);
  });

  it('gives the win to the opponent on timeout', () => {
    const t = reversi.onTimeout(reversi.init(ctx()).state, ctx());
    expect(t.outcome).toMatchObject({ outcome: 'timeout' });
    expect(t.outcome?.results.find((r) => r.result === 'win')?.seat).toBe(1);
  });

  it('exposes the disc counts publicly', () => {
    expect(reversi.publicView(reversi.init(ctx()).state)).toMatchObject({ counts: [2, 2] });
  });
});
