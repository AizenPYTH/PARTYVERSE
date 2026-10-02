import { battleship } from './battleship.ts';
import { checkers } from './checkers.ts';
import { chess } from './chess.ts';
import { mentalMath } from './mental-math.ts';
import { quizRush } from './quiz-rush.ts';
import { reversi } from './reversi.ts';
import { ticTacToe } from './tic-tac-toe.ts';
import type { GameEngine } from './types.ts';

/** Engines that are implemented and served by the game-action function. */
// deno-lint-ignore no-explicit-any
export const ENGINES: Record<string, GameEngine<any, any>> = {
  [ticTacToe.id]: ticTacToe,
  [chess.id]: chess,
  [reversi.id]: reversi,
  [checkers.id]: checkers,
  [battleship.id]: battleship,
  [quizRush.id]: quizRush,
  [mentalMath.id]: mentalMath,
};

// deno-lint-ignore no-explicit-any
export function getEngine(gameId: string): GameEngine<any, any> | null {
  return ENGINES[gameId] ?? null;
}
