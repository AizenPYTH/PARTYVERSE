import type { ComponentType } from 'react';

import type { MatchState } from '../matches/api';
import type { MatchController } from '../matches/useMatch';
import { ConnectFourMatch } from './connect-four/ConnectFourMatch';
import { TicTacToeMatch } from './tic-tac-toe/TicTacToeMatch';

export type MatchRenderer = ComponentType<{ state: MatchState; match: MatchController }>;

/** One renderer per playable game. A game without renderer is never shown as playable. */
export const MATCH_RENDERERS: Record<string, MatchRenderer> = {
  connect_four: ConnectFourMatch,
  tic_tac_toe: TicTacToeMatch,
};
