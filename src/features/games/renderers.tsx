import type { ComponentType } from 'react';

import type { MatchState } from '../matches/api';
import type { MatchController } from '../matches/useMatch';
import { BattleshipMatch } from './battleship/BattleshipMatch';
import { CheckersMatch } from './checkers/CheckersMatch';
import { ChessMatch } from './chess/ChessMatch';
import { ConnectFourMatch } from './connect-four/ConnectFourMatch';
import { QuizMatch } from './quiz/QuizMatch';
import { ReversiMatch } from './reversi/ReversiMatch';
import { TicTacToeMatch } from './tic-tac-toe/TicTacToeMatch';

export type MatchRenderer = ComponentType<{ state: MatchState; match: MatchController }>;

const QuizRushMatch: MatchRenderer = (props) => <QuizMatch {...props} title="QUIZ RUSH" />;
const MentalMathMatch: MatchRenderer = (props) => <QuizMatch {...props} title="CALCUL EXPRESS" />;

/** One renderer per playable game. A game without renderer is never shown as playable. */
export const MATCH_RENDERERS: Record<string, MatchRenderer> = {
  connect_four: ConnectFourMatch,
  tic_tac_toe: TicTacToeMatch,
  chess_arena: ChessMatch,
  reversi: ReversiMatch,
  checkers: CheckersMatch,
  battleship: BattleshipMatch,
  quiz_rush: QuizRushMatch,
  mental_math: MentalMathMatch,
};
