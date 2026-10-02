import type { CheckersMove } from '@engines/checkers';

/**
 * Tap-to-move selection for checkers: the player taps the piece, then each
 * landing square. Returns the squares that may be tapped next and, when the
 * path is a complete legal move, that move (a complete move is never the
 * prefix of a longer one, since capture sequences must be finished).
 */
export interface SelectionStep {
  next: number[];
  complete: CheckersMove | null;
}

const startsWith = (path: readonly number[], prefix: readonly number[]) => prefix.every((square, index) => path[index] === square);

export function selectionStep(moves: readonly CheckersMove[], selected: readonly number[]): SelectionStep {
  if (selected.length === 0) return { next: [...new Set(moves.map((move) => move.path[0]!))], complete: null };
  const matching = moves.filter((move) => startsWith(move.path, selected));
  const complete = matching.find((move) => move.path.length === selected.length) ?? null;
  const next = [...new Set(matching.filter((move) => move.path.length > selected.length).map((move) => move.path[selected.length]!))];
  return { next, complete };
}

/** Applies a tap: extends the path, restarts from another own piece, or clears. */
export function tapSquare(moves: readonly CheckersMove[], selected: readonly number[], square: number): number[] {
  if (selected.length > 0 && selectionStep(moves, selected).next.includes(square)) return [...selected, square];
  if (moves.some((move) => move.path[0] === square)) return selected[0] === square && selected.length === 1 ? [] : [square];
  return [];
}

/** Squares jumped by a partial path (shown as "will be captured"). */
export function pendingCaptures(moves: readonly CheckersMove[], selected: readonly number[]): number[] {
  if (selected.length < 2) return [];
  const move = moves.find((candidate) => startsWith(candidate.path, selected));
  return move ? move.captures.slice(0, selected.length - 1) : [];
}
