import { isEngineGame, type Game } from '../games/catalog';
import { engineApi } from '../matches/api';
import { lobbiesApi } from './api';

/** Starts the room's match: SQL games through RPC, engine games through game-action. */
export async function startLobbyMatch(lobbyId: string, game: Pick<Game, 'network_model'>): Promise<string> {
  if (isEngineGame(game)) return (await engineApi.start(lobbyId)).matchId;
  return lobbiesApi.start(lobbyId);
}
