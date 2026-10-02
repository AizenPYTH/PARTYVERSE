import { GameActionError, handleGameRequest, type GameDatabase, type GameRequest } from '../../supabase/functions/game-action/handler';
import { pool, readyRoom, rpc, type MatchState, type TestUser } from './helpers';

/**
 * GameDatabase backed by PostgreSQL as the real `service_role`, exactly as the
 * Edge Function calls the engine_* RPCs through PostgREST.
 */
async function asService<T>(sql: string, params: unknown[]): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('set local role service_role');
    const result = await client.query(sql, params);
    await client.query('commit');
    return result.rows[0]?.value as T;
  } catch (error) {
    await client.query('rollback');
    const code = String((error as Error).message).match(/PV_[A-Z_]+/)?.[0];
    if (code) throw new GameActionError(code, code === 'PV_STALE_STATE' ? 409 : 400);
    throw error;
  } finally {
    client.release();
  }
}

export const engineDb: GameDatabase = {
  prepareStart: (lobbyId, userId) => asService('select public.engine_prepare_start($1, $2) as value', [lobbyId, userId]),
  createMatch: (lobbyId, userId, seats, transition) =>
    asService('select public.engine_create_match($1, $2, $3::uuid[], $4::jsonb) as value', [
      lobbyId,
      userId,
      seats,
      JSON.stringify(transition),
    ]),
  load: (matchId, userId) => asService('select public.engine_load($1, $2) as value', [matchId, userId]),
  commit: (matchId, userId, expectedVersion, kind, action, transition) =>
    asService('select public.engine_commit($1, $2, $3, $4, $5::jsonb, $6::jsonb) as value', [
      matchId,
      userId,
      expectedVersion,
      kind,
      JSON.stringify(action),
      JSON.stringify(transition),
    ]),
};

/** Calls the game-action handler as `user` (what the Edge Function does after JWT verification). */
export function gameAction(user: TestUser, request: GameRequest) {
  return handleGameRequest(engineDb, user.id, request) as Promise<{ matchId?: string; version?: number }>;
}

export interface EngineMatchState<S = Record<string, unknown>> extends MatchState {
  match: MatchState['match'] & { state: S; active_seats: number[]; result_detail: { reason?: string } };
  private_state: unknown;
}

/** Starts a ready room of `gameId` through the handler; returns players indexed by seat. */
export async function startEngineMatch(gameId: string, count = 2, settings: object = {}) {
  const { lobby, players } = await readyRoom(gameId, count, settings);
  const { matchId } = await gameAction(players[0]!, { op: 'start', lobbyId: lobby.id });
  const state = await rpc<EngineMatchState>(players[0]!, 'get_match_state', [matchId]);
  const seats = state.players
    .slice()
    .sort((a, b) => a.seat - b.seat)
    .map((entry) => players.find((p) => p.id === entry.user_id)!);
  return { lobby, players, matchId: matchId!, seats };
}

/** Sends an action at the current version. */
export async function act(matchId: string, user: TestUser, action: unknown) {
  const state = await rpc<EngineMatchState>(user, 'get_match_state', [matchId]);
  return gameAction(user, { op: 'action', matchId, version: state.match.version, action });
}

export const matchState = <S>(user: TestUser, matchId: string) => rpc<EngineMatchState<S>>(user, 'get_match_state', [matchId]);
