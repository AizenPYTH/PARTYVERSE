import { legalMoves, type Piece } from '@engines/checkers';

import { pendingCaptures, selectionStep, tapSquare } from './selection';

const sq = (row: number, col: number) => row * 8 + col;
const board = Array<Piece | null>(64).fill(null);
board[sq(6, 1)] = { s: 0, k: false };
board[sq(5, 2)] = { s: 1, k: false };
board[sq(3, 2)] = { s: 1, k: false };
board[sq(3, 4)] = { s: 1, k: false };
const moves = legalMoves(board, 0);

describe('checkers selection', () => {
  it('offers only pieces that can move, then each landing square', () => {
    expect(selectionStep(moves, [])).toEqual({ next: [sq(6, 1)], complete: null });
    expect(selectionStep(moves, [sq(6, 1)]).next).toEqual([sq(4, 3)]);
    const branch = selectionStep(moves, [sq(6, 1), sq(4, 3)]);
    expect(branch.complete).toBeNull();
    expect(branch.next.sort((a, b) => a - b)).toEqual([sq(2, 1), sq(2, 5)]);
    expect(selectionStep(moves, [sq(6, 1), sq(4, 3), sq(2, 5)]).complete?.captures).toEqual([sq(5, 2), sq(3, 4)]);
  });

  it('builds, restarts and clears the path on taps', () => {
    let path = tapSquare(moves, [], sq(6, 1));
    expect(path).toEqual([sq(6, 1)]);
    path = tapSquare(moves, path, sq(4, 3));
    expect(path).toEqual([sq(6, 1), sq(4, 3)]);
    expect(pendingCaptures(moves, path)).toEqual([sq(5, 2)]);
    expect(tapSquare(moves, path, sq(0, 0))).toEqual([]);
    expect(tapSquare(moves, [sq(6, 1)], sq(6, 1))).toEqual([]);
  });
});
