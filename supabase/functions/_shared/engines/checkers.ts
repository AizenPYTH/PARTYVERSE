import { duelResults, numberSetting, type EngineContext, type GameEngine, type Seat, type Transition } from './types.ts';

/**
 * Checkers — English draughts on 8×8 dark squares.
 *  - Seat 0 starts at the bottom (rows 5–7) and moves up; seat 1 moves down.
 *  - Men move and capture diagonally forward; kings in all four directions, one square.
 *  - Capturing is mandatory; a capture sequence must be completed; a piece can
 *    be jumped only once; a man reaching the far row is crowned and the move ends.
 *  - A player without legal move loses. 80 plies without capture or man move is a draw.
 */
export interface Piece {
  s: Seat;
  k: boolean;
}

export interface CheckersMove {
  path: number[];
  captures: number[];
}

export interface CheckersState {
  board: (Piece | null)[];
  turn: Seat;
  quietPlies: number;
  history: { seat: Seat; path: number[]; captures: number[]; crowned: boolean }[];
  turnSeconds: number;
}

export type CheckersAction = { type: 'move'; path: number[] };

export const QUIET_PLY_LIMIT = 80;

const rowOf = (square: number) => Math.floor(square / 8);
const colOf = (square: number) => square % 8;
const at = (row: number, col: number) => (row < 0 || row > 7 || col < 0 || col > 7 ? null : row * 8 + col);
export const isDark = (square: number) => (rowOf(square) + colOf(square)) % 2 === 1;

function directions(piece: Piece): [number, number][] {
  if (piece.k) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  return piece.s === 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
}

const crownRow = (seat: Seat) => (seat === 0 ? 0 : 7);

function jumpsFrom(board: readonly (Piece | null)[], piece: Piece, from: number, captured: number[]): CheckersMove[] {
  const sequences: CheckersMove[] = [];
  for (const [dr, dc] of directions(piece)) {
    const over = at(rowOf(from) + dr, colOf(from) + dc);
    const land = at(rowOf(from) + 2 * dr, colOf(from) + 2 * dc);
    if (over === null || land === null) continue;
    const target = board[over];
    if (!target || target.s === piece.s || captured.includes(over) || board[land] !== null) continue;
    const nextCaptured = [...captured, over];
    // Crowning ends the move.
    if (!piece.k && rowOf(land) === crownRow(piece.s)) {
      sequences.push({ path: [from, land], captures: [over] });
      continue;
    }
    const continuations = jumpsFrom(board, piece, land, nextCaptured);
    if (continuations.length === 0) sequences.push({ path: [from, land], captures: [over] });
    for (const next of continuations) sequences.push({ path: [from, ...next.path], captures: [over, ...next.captures] });
  }
  return sequences;
}

export function legalMoves(board: readonly (Piece | null)[], seat: Seat): CheckersMove[] {
  const captures: CheckersMove[] = [];
  const steps: CheckersMove[] = [];
  board.forEach((piece, from) => {
    if (!piece || piece.s !== seat) return;
    // The moving piece's own square is empty during its sequence.
    const lifted = board.map((value, index) => (index === from ? null : value));
    captures.push(...jumpsFrom(lifted, piece, from, []));
    for (const [dr, dc] of directions(piece)) {
      const to = at(rowOf(from) + dr, colOf(from) + dc);
      if (to !== null && board[to] === null) steps.push({ path: [from, to], captures: [] });
    }
  });
  return captures.length > 0 ? captures : steps;
}

export function initialBoard(): (Piece | null)[] {
  return Array.from({ length: 64 }, (_, square) => {
    if (!isDark(square)) return null;
    const row = rowOf(square);
    if (row <= 2) return { s: 1, k: false };
    if (row >= 5) return { s: 0, k: false };
    return null;
  });
}

function turnOf(state: CheckersState): Transition<CheckersState> {
  return { state, activeSeats: [state.turn], turnSeat: state.turn, deadlineMs: state.turnSeconds * 1000 };
}

const samePath = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((value, i) => value === b[i]);

export const checkers: GameEngine<CheckersState, CheckersAction> = {
  id: 'checkers',
  minPlayers: 2,
  maxPlayers: 2,

  init(ctx: EngineContext) {
    return turnOf({ board: initialBoard(), turn: 0, quietPlies: 0, history: [], turnSeconds: numberSetting(ctx.settings, 'turn_seconds', 45) });
  },

  parseAction(raw) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { type, path } = raw as { type?: unknown; path?: unknown };
    if (type !== 'move' || !Array.isArray(path) || path.length < 2 || path.length > 13) return null;
    if (!path.every((square) => Number.isInteger(square) && square >= 0 && square < 64)) return null;
    return { type: 'move', path: path as number[] };
  },

  apply(state, seat, action) {
    if (seat !== state.turn) return { error: 'PV_NOT_YOUR_TURN' };
    const move = legalMoves(state.board, seat).find((candidate) => samePath(candidate.path, action.path));
    if (!move) return { error: 'PV_INVALID_MOVE' };

    const board = [...state.board];
    const from = move.path[0]!;
    const to = move.path[move.path.length - 1]!;
    const piece = board[from]!;
    board[from] = null;
    for (const square of move.captures) board[square] = null;
    const crowned = !piece.k && rowOf(to) === crownRow(seat);
    board[to] = { s: seat, k: piece.k || crowned };

    const quietPlies = move.captures.length > 0 || !piece.k ? 0 : state.quietPlies + 1;
    const next: CheckersState = {
      ...state,
      board,
      turn: 1 - seat,
      quietPlies,
      history: [...state.history, { seat, path: move.path, captures: move.captures, crowned }],
    };
    const log = { path: move.path, captures: move.captures.length, crowned };

    if (legalMoves(board, 1 - seat).length === 0) {
      return { state: next, activeSeats: [], turnSeat: null, deadlineMs: null, log, outcome: { outcome: 'win', reason: 'no_moves', results: duelResults(seat) } };
    }
    if (quietPlies >= QUIET_PLY_LIMIT) {
      return { state: next, activeSeats: [], turnSeat: null, deadlineMs: null, log, outcome: { outcome: 'draw', reason: 'forty_moves', results: duelResults(null) } };
    }
    return { ...turnOf(next), log };
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
