import { duelResults, numberSetting, type EngineContext, type GameEngine, type Seat, type Transition } from './types.ts';

/**
 * Tic-Tac-Toe. Seat 0 plays X and moves first (the SQL seat order makes the
 * previous loser seat 0 in a rematch).
 */
export type Mark = 0 | 1;

export interface TicTacToeState {
  board: (Mark | null)[];
  turn: Seat;
  moveCount: number;
  winLine: number[] | null;
  turnSeconds: number;
}

export type TicTacToeAction = { type: 'place'; cell: number };

export const LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function winningLine(board: readonly (Mark | null)[], mark: Mark): number[] | null {
  const line = LINES.find((cells) => cells.every((cell) => board[cell] === mark));
  return line ? [...line] : null;
}

const step = (state: TicTacToeState): Transition<TicTacToeState> => ({
  state,
  activeSeats: [state.turn],
  turnSeat: state.turn,
  deadlineMs: state.turnSeconds * 1000,
});

export const ticTacToe: GameEngine<TicTacToeState, TicTacToeAction> = {
  id: 'tic_tac_toe',
  minPlayers: 2,
  maxPlayers: 2,

  init(ctx: EngineContext) {
    return step({
      board: Array<Mark | null>(9).fill(null),
      turn: 0,
      moveCount: 0,
      winLine: null,
      turnSeconds: numberSetting(ctx.settings, 'turn_seconds', 20),
    });
  },

  parseAction(raw) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { type, cell } = raw as { type?: unknown; cell?: unknown };
    if (type !== 'place' || typeof cell !== 'number' || !Number.isInteger(cell)) return null;
    return { type: 'place', cell };
  },

  apply(state, seat, action) {
    if (seat !== state.turn) return { error: 'PV_NOT_YOUR_TURN' };
    if (action.cell < 0 || action.cell > 8 || state.board[action.cell] !== null) return { error: 'PV_INVALID_MOVE' };

    const board = [...state.board];
    board[action.cell] = seat as Mark;
    const winLine = winningLine(board, seat as Mark);
    const next: TicTacToeState = { ...state, board, moveCount: state.moveCount + 1, winLine, turn: 1 - seat };
    const log = { cell: action.cell, mark: seat };

    if (winLine) {
      return { state: next, activeSeats: [], turnSeat: null, deadlineMs: null, log, outcome: { outcome: 'win', reason: 'line', results: duelResults(seat) } };
    }
    if (next.moveCount === 9) {
      return { state: next, activeSeats: [], turnSeat: null, deadlineMs: null, log, outcome: { outcome: 'draw', reason: 'full_board', results: duelResults(null) } };
    }
    return { ...step(next), log };
  },

  onTimeout(state) {
    return {
      state,
      activeSeats: [],
      turnSeat: null,
      deadlineMs: null,
      outcome: { outcome: 'timeout', reason: 'timeout', results: duelResults(1 - state.turn) },
    };
  },

  publicView: (state) => state,
  privateView: () => null,
};
