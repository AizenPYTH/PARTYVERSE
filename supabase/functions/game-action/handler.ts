/**
 * game-action — runtime-independent core of the Edge Function.
 *
 * Every request is authenticated before reaching this module (index.ts). The
 * engine computes the next state; the database (engine_* RPCs) re-checks seat,
 * turn, version and deadline under the match lock before committing.
 */
import { getEngine } from '../_shared/engines/registry.ts';
import {
  isEngineError,
  type EngineContext,
  type GameEngine,
  type Transition,
} from '../_shared/engines/types.ts';

export class GameActionError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
  }
}

export interface PreparedStart {
  lobby_id: string;
  game_id: string;
  settings: Record<string, unknown>;
  seats: string[];
  seed: string;
  server_time: number;
  data: unknown;
}

export interface LoadedMatch {
  match_id: string;
  game_id: string;
  status: string;
  version: number;
  settings: Record<string, unknown>;
  seat: number | null;
  seats: number;
  absent_seats: number[];
  active_seats: number[];
  server_state: unknown;
  turn_deadline_ms: number | null;
  server_time: number;
}

export interface SerializedTransition {
  public_state: unknown;
  server_state: unknown;
  private_states: { seat: number; state: unknown }[];
  active_seats: number[];
  turn_seat: number | null;
  deadline_ms: number | null;
  outcome?: unknown;
  log?: unknown;
}

export interface GameDatabase {
  prepareStart(lobbyId: string, userId: string): Promise<PreparedStart>;
  createMatch(lobbyId: string, userId: string, seats: string[], transition: SerializedTransition): Promise<string>;
  load(matchId: string, userId: string): Promise<LoadedMatch>;
  commit(
    matchId: string,
    userId: string,
    expectedVersion: number,
    kind: 'action' | 'timeout',
    action: unknown,
    transition: SerializedTransition,
  ): Promise<number>;
}

export type GameRequest =
  | { op: 'start'; lobbyId: string }
  | { op: 'action'; matchId: string; version: number; action: unknown }
  | { op: 'timeout'; matchId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseRequest(body: unknown): GameRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const value = body as Record<string, unknown>;
  if (value.op === 'start' && typeof value.lobbyId === 'string' && UUID.test(value.lobbyId)) {
    return { op: 'start', lobbyId: value.lobbyId };
  }
  if (typeof value.matchId !== 'string' || !UUID.test(value.matchId)) return null;
  if (value.op === 'timeout') return { op: 'timeout', matchId: value.matchId };
  if (value.op === 'action' && Number.isInteger(value.version) && 'action' in value) {
    return { op: 'action', matchId: value.matchId, version: value.version as number, action: value.action };
  }
  return null;
}

// deno-lint-ignore no-explicit-any
type AnyEngine = GameEngine<any, any>;

export function serializeTransition(engine: AnyEngine, transition: Transition<unknown>, seats: number): SerializedTransition {
  const privateStates: { seat: number; state: unknown }[] = [];
  for (let seat = 0; seat < seats; seat++) {
    const state = engine.privateView(transition.state, seat);
    if (state !== null && state !== undefined) privateStates.push({ seat, state });
  }
  return {
    public_state: engine.publicView(transition.state),
    server_state: transition.state,
    private_states: privateStates,
    active_seats: transition.activeSeats,
    turn_seat: transition.turnSeat,
    deadline_ms: transition.deadlineMs === null ? null : Math.max(0, Math.round(transition.deadlineMs)),
    ...(transition.outcome ? { outcome: transition.outcome } : {}),
    ...(transition.log ? { log: transition.log } : {}),
  };
}

function engineFor(gameId: string): AnyEngine {
  const engine = getEngine(gameId);
  if (!engine) throw new GameActionError('PV_GAME_NOT_PLAYABLE');
  return engine;
}

function contextOf(loaded: LoadedMatch, state: unknown): EngineContext {
  const seed = (state as { seed?: unknown } | null)?.seed;
  return {
    now: loaded.server_time,
    seats: loaded.seats,
    settings: loaded.settings ?? {},
    seed: typeof seed === 'string' ? seed : loaded.match_id,
    absentSeats: loaded.absent_seats ?? [],
  };
}

async function start(db: GameDatabase, userId: string, lobbyId: string) {
  const prepared = await db.prepareStart(lobbyId, userId);
  const engine = engineFor(prepared.game_id);
  const transition = engine.init({
    now: prepared.server_time,
    seats: prepared.seats.length,
    settings: prepared.settings ?? {},
    seed: prepared.seed,
    absentSeats: [],
    data: prepared.data,
  });
  const matchId = await db.createMatch(lobbyId, userId, prepared.seats, serializeTransition(engine, transition, prepared.seats.length));
  return { matchId };
}

async function act(db: GameDatabase, userId: string, request: Extract<GameRequest, { op: 'action' }>) {
  const loaded = await db.load(request.matchId, userId);
  if (loaded.status !== 'active') throw new GameActionError('PV_MATCH_NOT_ACTIVE');
  if (loaded.seat === null) throw new GameActionError('PV_NOT_A_PLAYER');
  if (loaded.version !== request.version) throw new GameActionError('PV_STALE_STATE', 409);
  if (loaded.turn_deadline_ms !== null && loaded.turn_deadline_ms <= loaded.server_time) {
    throw new GameActionError('PV_TURN_EXPIRED');
  }

  const engine = engineFor(loaded.game_id);
  const action = engine.parseAction(request.action);
  if (action === null) throw new GameActionError('PV_INVALID_MOVE');
  const result = engine.apply(loaded.server_state, loaded.seat, action, contextOf(loaded, loaded.server_state));
  if (isEngineError(result)) throw new GameActionError(result.error);

  const version = await db.commit(
    request.matchId, userId, loaded.version, 'action', action, serializeTransition(engine, result, loaded.seats));
  return { version };
}

async function timeout(db: GameDatabase, userId: string, matchId: string) {
  // One retry: a concurrent move may have moved the deadline meanwhile.
  for (let attempt = 0; attempt < 2; attempt++) {
    const loaded = await db.load(matchId, userId);
    if (loaded.status !== 'active') throw new GameActionError('PV_MATCH_NOT_ACTIVE');
    if (loaded.turn_deadline_ms === null || loaded.turn_deadline_ms > loaded.server_time) {
      throw new GameActionError('PV_TURN_NOT_EXPIRED');
    }
    const engine = engineFor(loaded.game_id);
    const result = engine.onTimeout(loaded.server_state, contextOf(loaded, loaded.server_state));
    try {
      const version = await db.commit(
        matchId, userId, loaded.version, 'timeout', null, serializeTransition(engine, result, loaded.seats));
      return { version };
    } catch (error) {
      if (!(error instanceof GameActionError && error.code === 'PV_STALE_STATE') || attempt === 1) throw error;
    }
  }
  throw new GameActionError('PV_STALE_STATE', 409);
}

export function handleGameRequest(db: GameDatabase, userId: string, request: GameRequest) {
  switch (request.op) {
    case 'start':
      return start(db, userId, request.lobbyId);
    case 'action':
      return act(db, userId, request);
    case 'timeout':
      return timeout(db, userId, request.matchId);
  }
}
