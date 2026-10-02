import { isEngineError, type EngineContext, type GameEngine, type Transition } from './types.ts';

/** Test helpers: drive an engine like the game-action function does. */
export function ctx(overrides: Partial<EngineContext> = {}): EngineContext {
  return { now: 1_000_000, seats: 2, settings: {}, seed: 'seed', absentSeats: [], ...overrides };
}

// deno-lint-ignore no-explicit-any
export function play<S>(engine: GameEngine<S, any>, transition: Transition<S>, seat: number, raw: unknown, context = ctx()): Transition<S> {
  const action = engine.parseAction(raw);
  if (action === null) throw new Error(`unparseable action ${JSON.stringify(raw)}`);
  const result = engine.apply(transition.state, seat, action, context);
  if (isEngineError(result)) throw new Error(result.error);
  // Round-trip through JSON like the database does.
  return JSON.parse(JSON.stringify(result)) as Transition<S>;
}

// deno-lint-ignore no-explicit-any
export function attempt<S>(engine: GameEngine<S, any>, transition: Transition<S>, seat: number, raw: unknown, context = ctx()): string | null {
  const action = engine.parseAction(raw);
  if (action === null) return 'PV_INVALID_MOVE';
  const result = engine.apply(transition.state, seat, action, context);
  return isEngineError(result) ? result.error : null;
}
