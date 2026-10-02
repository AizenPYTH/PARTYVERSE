import { createRng } from './rng.ts';
import { numberSetting, presentSeats, rankByScore, type EngineContext, type GameEngine, type Seat, type Transition } from './types.ts';

/**
 * Memory for 2 to 4 players. The deck order lives only in the server state;
 * the public view shows matched cards, the cards flipped this turn and the
 * last mismatched pair (until the next flip). A pair keeps the turn.
 * A player whose clock runs out passes their turn.
 */
export interface MemoryState {
  deck: number[];
  matchedBy: (Seat | null)[];
  flipped: number[];
  lastMismatch: number[] | null;
  turn: Seat;
  scores: number[];
  turnMs: number;
  moves: number;
}

export type MemoryAction = { type: 'flip'; card: number };

export const PAIR_OPTIONS = [8, 12, 18] as const;

function nextSeat(state: MemoryState, ctx: EngineContext, from: Seat): Seat {
  const present = presentSeats(ctx);
  for (let offset = 1; offset <= ctx.seats; offset++) {
    const seat = (from + offset) % ctx.seats;
    if (present.includes(seat)) return seat;
  }
  return from;
}

const turnOf = (state: MemoryState): Transition<MemoryState> => ({
  state,
  activeSeats: [state.turn],
  turnSeat: state.turn,
  deadlineMs: state.turnMs,
});

function finish(state: MemoryState, ctx: EngineContext, log?: Record<string, unknown>): Transition<MemoryState> {
  const present = presentSeats(ctx);
  const results = rankByScore(Object.fromEntries(state.scores.map((s, seat) => [seat, s])), present.length ? present : [0]);
  const winners = results.filter((r) => r.rank === 1).length;
  return {
    state,
    activeSeats: [],
    turnSeat: null,
    deadlineMs: null,
    log,
    outcome: { outcome: ctx.seats === 2 ? (winners === 1 ? 'win' : 'draw') : 'completed', reason: 'all_pairs', results },
  };
}

export const memory: GameEngine<MemoryState, MemoryAction> = {
  id: 'memory_match',
  minPlayers: 2,
  maxPlayers: 4,

  init(ctx) {
    const requested = numberSetting(ctx.settings, 'pairs', 8);
    const pairs = (PAIR_OPTIONS as readonly number[]).includes(requested) ? requested : 8;
    const deck = createRng(`${ctx.seed}:memory`).shuffle(Array.from({ length: pairs * 2 }, (_, i) => Math.floor(i / 2)));
    return turnOf({
      deck,
      matchedBy: deck.map(() => null),
      flipped: [],
      lastMismatch: null,
      turn: presentSeats(ctx)[0] ?? 0,
      scores: Array.from({ length: ctx.seats }, () => 0),
      turnMs: numberSetting(ctx.settings, 'turn_seconds', 15) * 1000,
      moves: 0,
    });
  },

  parseAction(raw) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { type, card } = raw as { type?: unknown; card?: unknown };
    return type === 'flip' && typeof card === 'number' && Number.isInteger(card) ? { type: 'flip', card } : null;
  },

  apply(state, seat, action, ctx) {
    if (seat !== state.turn) return { error: 'PV_NOT_YOUR_TURN' };
    const { card } = action;
    if (card < 0 || card >= state.deck.length || state.matchedBy[card] !== null || state.flipped.includes(card)) {
      return { error: 'PV_INVALID_MOVE' };
    }
    if (state.flipped.length === 0) {
      return { ...turnOf({ ...state, flipped: [card], lastMismatch: null }), log: { flip: card, symbol: state.deck[card] } };
    }
    const first = state.flipped[0]!;
    const symbol = state.deck[card]!;
    const log = { flip: card, symbol, pair: state.deck[first] === symbol };
    const moves = state.moves + 1;
    if (state.deck[first] === symbol) {
      const matchedBy = [...state.matchedBy];
      matchedBy[first] = seat;
      matchedBy[card] = seat;
      const scores = [...state.scores];
      scores[seat] = (scores[seat] ?? 0) + 1;
      const next = { ...state, matchedBy, scores, flipped: [], lastMismatch: null, moves };
      if (matchedBy.every((owner) => owner !== null)) return finish(next, ctx, log);
      return { ...turnOf(next), log };
    }
    return { ...turnOf({ ...state, flipped: [], lastMismatch: [first, card], moves, turn: nextSeat(state, ctx, seat) }), log };
  },

  onTimeout(state, ctx) {
    // The flipped card (if any) turns back and the turn passes.
    return { ...turnOf({ ...state, flipped: [], lastMismatch: null, turn: nextSeat(state, ctx, state.turn) }), log: { skipped: state.turn } };
  },

  publicView(state) {
    const visible = new Set([...state.flipped, ...(state.lastMismatch ?? [])]);
    return {
      cards: state.deck.map((symbol, index) => (state.matchedBy[index] !== null || visible.has(index) ? symbol : null)),
      matchedBy: state.matchedBy,
      flipped: state.flipped,
      lastMismatch: state.lastMismatch,
      turn: state.turn,
      scores: state.scores,
      pairs: state.deck.length / 2,
      moves: state.moves,
    };
  },

  privateView: () => null,
};
