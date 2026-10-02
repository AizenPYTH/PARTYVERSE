import { duelResults, numberSetting, type EngineContext, type GameEngine, type Seat, type Transition } from './types.ts';

/** Reversi (Othello) on 8×8. Seat 0 plays Black and moves first. */
export type Disc = 0 | 1;

export interface ReversiState {
  board: (Disc | null)[];
  turn: Seat;
  history: { seat: Seat; square: number | null }[];
  lastFlips: number[];
  turnSeconds: number;
}

export type ReversiAction = { type: 'place'; square: number };

const DIRECTIONS: readonly (readonly [number, number])[] = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

function walk(square: number, [dr, dc]: readonly [number, number]): number | null {
  const r = Math.floor(square / 8) + dr;
  const c = (square % 8) + dc;
  return r < 0 || r > 7 || c < 0 || c > 7 ? null : r * 8 + c;
}

/** Discs flipped by `seat` playing `square` (empty array = illegal). */
export function flipsFor(board: readonly (Disc | null)[], seat: Seat, square: number): number[] {
  if (board[square] !== null) return [];
  const flips: number[] = [];
  for (const direction of DIRECTIONS) {
    const line: number[] = [];
    let current = walk(square, direction);
    while (current !== null && board[current] === 1 - seat) {
      line.push(current);
      current = walk(current, direction);
    }
    if (current !== null && board[current] === seat && line.length > 0) flips.push(...line);
  }
  return flips;
}

export function legalSquares(board: readonly (Disc | null)[], seat: Seat): number[] {
  return board.flatMap((_, square) => (flipsFor(board, seat, square).length > 0 ? [square] : []));
}

export function countDiscs(board: readonly (Disc | null)[]): [number, number] {
  return [board.filter((d) => d === 0).length, board.filter((d) => d === 1).length];
}

function turnOf(state: ReversiState): Transition<ReversiState> {
  return { state, activeSeats: [state.turn], turnSeat: state.turn, deadlineMs: state.turnSeconds * 1000 };
}

function finish(state: ReversiState, log?: Record<string, unknown>): Transition<ReversiState> {
  const [black, white] = countDiscs(state.board);
  const winner = black === white ? null : black > white ? 0 : 1;
  return {
    state,
    activeSeats: [],
    turnSeat: null,
    deadlineMs: null,
    log,
    outcome: {
      outcome: winner === null ? 'draw' : 'win',
      reason: 'board_complete',
      results: duelResults(winner, [black, white]),
    },
  };
}

export function initialBoard(): (Disc | null)[] {
  const board = Array<Disc | null>(64).fill(null);
  board[27] = 1;
  board[36] = 1;
  board[28] = 0;
  board[35] = 0;
  return board;
}

export const reversi: GameEngine<ReversiState, ReversiAction> = {
  id: 'reversi',
  minPlayers: 2,
  maxPlayers: 2,

  init(ctx: EngineContext) {
    return turnOf({ board: initialBoard(), turn: 0, history: [], lastFlips: [], turnSeconds: numberSetting(ctx.settings, 'turn_seconds', 30) });
  },

  parseAction(raw) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { type, square } = raw as { type?: unknown; square?: unknown };
    if (type !== 'place' || typeof square !== 'number' || !Number.isInteger(square)) return null;
    return { type: 'place', square };
  },

  apply(state, seat, action) {
    if (seat !== state.turn) return { error: 'PV_NOT_YOUR_TURN' };
    if (action.square < 0 || action.square > 63) return { error: 'PV_INVALID_MOVE' };
    const flips = flipsFor(state.board, seat, action.square);
    if (flips.length === 0) return { error: 'PV_INVALID_MOVE' };

    const board = [...state.board];
    board[action.square] = seat as Disc;
    for (const square of flips) board[square] = seat as Disc;
    const history = [...state.history, { seat, square: action.square }];
    const log = { square: action.square, flips: flips.length };
    const opponent = 1 - seat;

    if (legalSquares(board, opponent).length > 0) {
      return { ...turnOf({ ...state, board, turn: opponent, history, lastFlips: flips }), log };
    }
    if (legalSquares(board, seat).length > 0) {
      // The opponent has no legal move: they pass and the mover plays again.
      return {
        ...turnOf({ ...state, board, turn: seat, history: [...history, { seat: opponent, square: null }], lastFlips: flips }),
        log: { ...log, pass: opponent },
      };
    }
    return finish({ ...state, board, history, lastFlips: flips }, log);
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

  publicView: (state) => ({ ...state, counts: countDiscs(state.board) }),
  privateView: () => null,
};
