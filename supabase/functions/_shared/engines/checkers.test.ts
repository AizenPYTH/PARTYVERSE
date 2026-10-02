import { checkers, initialBoard, isDark, legalMoves, QUIET_PLY_LIMIT, type CheckersState, type Piece } from './checkers';
import { attempt, ctx, play } from './testing';
import type { Transition } from './types';

const sq = (row: number, col: number) => row * 8 + col;
const man = (s: number): Piece => ({ s, k: false });
const king = (s: number): Piece => ({ s, k: true });

const boardWith = (pieces: [number, Piece][]) => {
  const board = Array<Piece | null>(64).fill(null);
  for (const [square, piece] of pieces) board[square] = piece;
  return board;
};

const position = (board: (Piece | null)[], turn = 0): Transition<CheckersState> => ({
  state: { ...checkers.init(ctx()).state, board, turn },
  activeSeats: [turn],
  turnSeat: turn,
  deadlineMs: 45_000,
});

describe('checkers engine', () => {
  it('starts with 12 men each on dark squares and 7 opening moves', () => {
    const board = initialBoard();
    expect(board.filter((p) => p?.s === 0)).toHaveLength(12);
    expect(board.filter((p) => p?.s === 1)).toHaveLength(12);
    board.forEach((piece, square) => piece && expect(isDark(square)).toBe(true));
    expect(legalMoves(board, 0)).toHaveLength(7);
    expect(legalMoves(board, 0).every((m) => m.captures.length === 0)).toBe(true);
  });

  it('moves men forward only', () => {
    const t = checkers.init(ctx());
    expect(attempt(checkers, t, 0, { type: 'move', path: [sq(5, 0), sq(4, 1)] })).toBeNull();
    expect(attempt(checkers, t, 0, { type: 'move', path: [sq(5, 0), sq(6, 1)] })).toBe('PV_INVALID_MOVE');
    expect(attempt(checkers, t, 1, { type: 'move', path: [sq(2, 1), sq(3, 0)] })).toBe('PV_NOT_YOUR_TURN');
  });

  it('forces captures and the full multi-jump sequence', () => {
    const board = boardWith([
      [sq(6, 1), man(0)],
      [sq(6, 7), man(0)],
      [sq(5, 2), man(1)],
      [sq(3, 2), man(1)],
      [sq(0, 7), man(1)],
    ]);
    const moves = legalMoves(board, 0);
    expect(moves).toEqual([{ path: [sq(6, 1), sq(4, 3), sq(2, 1)], captures: [sq(5, 2), sq(3, 2)] }]);
    const t = position(board);
    expect(attempt(checkers, t, 0, { type: 'move', path: [sq(6, 7), sq(5, 6)] })).toBe('PV_INVALID_MOVE');
    expect(attempt(checkers, t, 0, { type: 'move', path: [sq(6, 1), sq(4, 3)] })).toBe('PV_INVALID_MOVE');
    const next = play(checkers, t, 0, { type: 'move', path: [sq(6, 1), sq(4, 3), sq(2, 1)] });
    expect(next.state.board[sq(5, 2)]).toBeNull();
    expect(next.state.board[sq(3, 2)]).toBeNull();
    expect(next.state.board[sq(2, 1)]).toEqual(man(0));
    expect(next.log).toMatchObject({ captures: 2, crowned: false });
  });

  it('crowns a man reaching the far row and ends its move there', () => {
    const board = boardWith([
      [sq(2, 1), man(0)],
      [sq(1, 2), man(1)],
      [sq(1, 4), man(1)],
    ]);
    expect(legalMoves(board, 0)).toEqual([{ path: [sq(2, 1), sq(0, 3)], captures: [sq(1, 2)] }]);
    const t = play(checkers, position(board), 0, { type: 'move', path: [sq(2, 1), sq(0, 3)] });
    expect(t.state.board[sq(0, 3)]).toEqual(king(0));
    expect(t.log).toMatchObject({ crowned: true });
    expect(t.turnSeat).toBe(1);
  });

  it('never jumps the same piece twice', () => {
    const board = boardWith([
      [sq(3, 2), king(0)],
      [sq(2, 1), man(1)],
      [sq(2, 3), man(1)],
      [sq(4, 1), man(1)],
      [sq(4, 3), man(1)],
    ]);
    const moves = legalMoves(board, 0);
    expect(moves).toHaveLength(4);
    for (const move of moves) expect(new Set(move.captures).size).toBe(move.captures.length);
  });

  it('lets kings move backwards and draws after the quiet-move limit', () => {
    let t = position(boardWith([[sq(7, 0), king(0)], [sq(0, 7), king(1)]]));
    const shuttles: [number, number][] = [[sq(7, 0), sq(6, 1)], [sq(0, 7), sq(1, 6)], [sq(6, 1), sq(7, 0)], [sq(1, 6), sq(0, 7)]];
    for (let ply = 0; ply < QUIET_PLY_LIMIT; ply += 1) {
      expect(t.outcome).toBeUndefined();
      t = play(checkers, t, ply % 2, { type: 'move', path: shuttles[ply % 4] });
    }
    expect(t.outcome).toMatchObject({ outcome: 'draw', reason: 'forty_moves' });
  });

  it('wins when the opponent has no legal move left', () => {
    const t = play(checkers, position(boardWith([[sq(5, 2), man(0)], [sq(4, 3), man(1)]])), 0, { type: 'move', path: [sq(5, 2), sq(3, 4)] });
    expect(t.outcome).toMatchObject({ outcome: 'win', reason: 'no_moves' });
    expect(t.outcome?.results.find((r) => r.result === 'win')?.seat).toBe(0);
  });

  it('rejects malformed paths', () => {
    const t = checkers.init(ctx());
    expect(attempt(checkers, t, 0, { type: 'move', path: [sq(5, 0)] })).toBe('PV_INVALID_MOVE');
    expect(attempt(checkers, t, 0, { type: 'move', path: [sq(5, 0), 99] })).toBe('PV_INVALID_MOVE');
    expect(attempt(checkers, t, 0, { type: 'move', path: 'a' })).toBe('PV_INVALID_MOVE');
  });

  it('gives the win to the opponent on timeout', () => {
    const t = checkers.onTimeout(checkers.init(ctx()).state, ctx());
    expect(t.outcome?.results.find((r) => r.result === 'win')?.seat).toBe(1);
  });
});
