import { chess } from './chess.ts';
import { ticTacToe } from './tic-tac-toe.ts';
import type { GameEngine } from './types.ts';

/** Engines that are implemented and served by the game-action function. */
// deno-lint-ignore no-explicit-any
export const ENGINES: Record<string, GameEngine<any, any>> = {
  [ticTacToe.id]: ticTacToe,
  [chess.id]: chess,
};

// deno-lint-ignore no-explicit-any
export function getEngine(gameId: string): GameEngine<any, any> | null {
  return ENGINES[gameId] ?? null;
}
