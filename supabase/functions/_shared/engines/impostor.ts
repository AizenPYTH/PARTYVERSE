import { createRng } from './rng.ts';
import { numberSetting, presentSeats, stringSetting, type EngineContext, type GameEngine, type Seat, type SeatResult, type Transition } from './types.ts';

/**
 * Impostor — social deduction for 3 to 12 players.
 *
 *  - Every player secretly receives the same word, except the impostor:
 *    in "word" mode the impostor gets a close word (and does not know it);
 *    in "blank" mode the impostor knows they have no word.
 *  - Clue rounds: in turn, each player gives a short public clue.
 *  - Discussion (lobby chat), then a secret simultaneous vote.
 *  - If the impostor is voted out, they get one guess at the shared word:
 *    a right guess still wins the game for them.
 *
 * The impostor's seat, the words and the votes stay server-side until the
 * end; votes and guesses are redacted from the move log.
 */
export type ImpostorMode = 'word' | 'blank';
export type ImpostorPhase = 'clues' | 'discussion' | 'vote' | 'guess' | 'finished';

export interface Clue {
  seat: Seat;
  round: number;
  /** null = the player let the clock run out. */
  text: string | null;
}

export interface ImpostorState {
  seed: string;
  mode: ImpostorMode;
  civilianWord: string;
  impostorWord: string | null;
  impostor: Seat;
  phase: ImpostorPhase;
  order: Seat[];
  rounds: number;
  /** Position in the clue sequence (order × rounds). */
  step: number;
  clues: Clue[];
  turnMs: number;
  discussionMs: number;
  voteMs: number;
  guessMs: number;
  phaseEndsAt: number;
  ready: boolean[];
  votes: (Seat | null)[];
  eliminated: Seat | null;
  guess: string | null;
  winner: 'civilians' | 'impostor' | null;
  reason: string | null;
}

export type ImpostorAction =
  | { type: 'clue'; text: string }
  | { type: 'ready' }
  | { type: 'vote'; target: Seat }
  | { type: 'guess'; text: string };

export const MAX_CLUE_LENGTH = 30;

/** Lowercase, no accents, no leading article, single spaces. */
export function normalizeWord(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(le|la|les|un|une|des|du|l') ?/, '')
    .trim();
}

/** Strips control characters and extra spaces from a clue. */
export function cleanClue(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
}

interface WordPair {
  a: string;
  b: string;
}

function readPair(data: unknown): WordPair {
  const value = data as { a?: unknown; b?: unknown } | null;
  if (value && typeof value.a === 'string' && typeof value.b === 'string') return { a: value.a, b: value.b };
  throw new Error('impostor start data missing');
}

const cluesTotal = (state: ImpostorState) => state.order.length * state.rounds;

function results(state: ImpostorState, winner: 'civilians' | 'impostor', seats: number): SeatResult[] {
  return Array.from({ length: seats }, (_, seat) => {
    const won = (seat === state.impostor) === (winner === 'impostor');
    return { seat, result: won ? 'win' : 'loss', rank: won ? 1 : 2, score: won ? (seat === state.impostor ? 3 : 1) : 0 };
  });
}

function finish(state: ImpostorState, ctx: EngineContext, winner: 'civilians' | 'impostor', reason: string): Transition<ImpostorState> {
  const next: ImpostorState = { ...state, phase: 'finished', winner, reason };
  return {
    state: next,
    activeSeats: [],
    turnSeat: null,
    deadlineMs: null,
    outcome: { outcome: 'completed', reason, results: results(next, winner, ctx.seats) },
  };
}

/** Next clue giver from `state.step`, skipping players who left. */
function cluesOrNext(state: ImpostorState, ctx: EngineContext): Transition<ImpostorState> {
  const present = presentSeats(ctx);
  let step = state.step;
  while (step < cluesTotal(state) && !present.includes(state.order[step % state.order.length]!)) step++;
  if (step < cluesTotal(state)) {
    const seat = state.order[step % state.order.length]!;
    return { state: { ...state, phase: 'clues', step }, activeSeats: [seat], turnSeat: seat, deadlineMs: state.turnMs };
  }
  const next: ImpostorState = { ...state, step, phase: 'discussion', phaseEndsAt: ctx.now + state.discussionMs, ready: state.ready.map(() => false) };
  return { state: next, activeSeats: present, turnSeat: null, deadlineMs: state.discussionMs };
}

function startVote(state: ImpostorState, ctx: EngineContext): Transition<ImpostorState> {
  const next: ImpostorState = { ...state, phase: 'vote', phaseEndsAt: ctx.now + state.voteMs, votes: state.votes.map(() => null) };
  return { state: next, activeSeats: presentSeats(ctx), turnSeat: null, deadlineMs: state.voteMs };
}

/** Counts the votes of present players. */
export function tally(votes: readonly (Seat | null)[], present: readonly Seat[]): { counts: number[]; top: Seat | null } {
  const counts = votes.map(() => 0);
  for (const voter of present) {
    const target = votes[voter];
    if (target !== null && target !== undefined) counts[target] = (counts[target] ?? 0) + 1;
  }
  const max = Math.max(0, ...counts);
  const leaders = counts.flatMap((count, seat) => (count === max && max > 0 ? [seat] : []));
  return { counts, top: leaders.length === 1 ? leaders[0]! : null };
}

function closeVote(state: ImpostorState, ctx: EngineContext): Transition<ImpostorState> {
  const { top } = tally(state.votes, presentSeats(ctx));
  if (top === null) return finish({ ...state, eliminated: null }, ctx, 'impostor', 'tie_vote');
  if (top !== state.impostor) return finish({ ...state, eliminated: top }, ctx, 'impostor', 'wrong_vote');
  const next: ImpostorState = { ...state, eliminated: top, phase: 'guess', phaseEndsAt: ctx.now + state.guessMs };
  return { state: next, activeSeats: [state.impostor], turnSeat: state.impostor, deadlineMs: state.guessMs };
}

function waiting(state: ImpostorState, ctx: EngineContext, done: (seat: Seat) => boolean): Transition<ImpostorState> {
  return {
    state,
    activeSeats: presentSeats(ctx).filter((seat) => !done(seat)),
    turnSeat: null,
    deadlineMs: Math.max(0, state.phaseEndsAt - ctx.now),
  };
}

export const impostor: GameEngine<ImpostorState, ImpostorAction> = {
  id: 'impostor',
  minPlayers: 3,
  maxPlayers: 12,

  init(ctx) {
    const rng = createRng(`${ctx.seed}:impostor`);
    const pair = readPair(ctx.data);
    const [civilianWord, impostorWord] = rng.next() < 0.5 ? [pair.a, pair.b] : [pair.b, pair.a];
    const mode: ImpostorMode = stringSetting(ctx.settings, 'mode', 'word') === 'blank' ? 'blank' : 'word';
    const seats = presentSeats(ctx);
    const state: ImpostorState = {
      seed: ctx.seed,
      mode,
      civilianWord,
      impostorWord: mode === 'word' ? impostorWord : null,
      impostor: rng.pick(seats),
      phase: 'clues',
      order: rng.shuffle(seats),
      rounds: Math.max(1, Math.min(3, numberSetting(ctx.settings, 'rounds', 2))),
      step: 0,
      clues: [],
      turnMs: numberSetting(ctx.settings, 'turn_seconds', 30) * 1000,
      discussionMs: numberSetting(ctx.settings, 'discussion_seconds', 60) * 1000,
      voteMs: 30_000,
      guessMs: 30_000,
      phaseEndsAt: ctx.now,
      ready: Array.from({ length: ctx.seats }, () => false),
      votes: Array.from({ length: ctx.seats }, () => null),
      eliminated: null,
      guess: null,
      winner: null,
      reason: null,
    };
    return cluesOrNext(state, ctx);
  },

  parseAction(raw) {
    if (typeof raw !== 'object' || raw === null) return null;
    const value = raw as Record<string, unknown>;
    switch (value.type) {
      case 'ready':
        return { type: 'ready' };
      case 'vote':
        return Number.isInteger(value.target) ? { type: 'vote', target: value.target as number } : null;
      case 'clue':
      case 'guess': {
        if (typeof value.text !== 'string') return null;
        const text = cleanClue(value.text);
        if (text.length < 1 || text.length > MAX_CLUE_LENGTH) return null;
        return { type: value.type, text };
      }
      default:
        return null;
    }
  },

  apply(state, seat, action, ctx) {
    if (ctx.absentSeats.includes(seat) || seat < 0 || seat >= ctx.seats) return { error: 'PV_NOT_A_PLAYER' };
    switch (action.type) {
      case 'clue': {
        if (state.phase !== 'clues') return { error: 'PV_INVALID_MOVE' };
        const expected = state.order[state.step % state.order.length];
        if (seat !== expected) return { error: 'PV_NOT_YOUR_TURN' };
        const own = seat === state.impostor ? state.impostorWord : state.civilianWord;
        if (own && normalizeWord(action.text).includes(normalizeWord(own))) return { error: 'PV_CLUE_FORBIDDEN' };
        const round = Math.floor(state.step / state.order.length) + 1;
        const next = { ...state, clues: [...state.clues, { seat, round, text: action.text }], step: state.step + 1 };
        return { ...cluesOrNext(next, ctx), log: { clue: seat, round } };
      }
      case 'ready': {
        if (state.phase !== 'discussion') return { error: 'PV_INVALID_MOVE' };
        if (state.ready[seat]) return { error: 'PV_ALREADY_DONE' };
        const ready = [...state.ready];
        ready[seat] = true;
        const next = { ...state, ready };
        if (presentSeats(ctx).every((s) => ready[s])) return { ...startVote(next, ctx), log: { ready: seat } };
        return { ...waiting(next, ctx, (s) => ready[s] === true), log: { ready: seat } };
      }
      case 'vote': {
        if (state.phase !== 'vote') return { error: 'PV_INVALID_MOVE' };
        if (state.votes[seat] !== null) return { error: 'PV_ALREADY_DONE' };
        const present = presentSeats(ctx);
        if (action.target === seat || !present.includes(action.target)) return { error: 'PV_INVALID_MOVE' };
        const votes = [...state.votes];
        votes[seat] = action.target;
        const next = { ...state, votes };
        if (present.every((s) => votes[s] !== null)) return { ...closeVote(next, ctx), log: { voted: seat } };
        return { ...waiting(next, ctx, (s) => votes[s] !== null), log: { voted: seat } };
      }
      case 'guess': {
        if (state.phase !== 'guess' || seat !== state.impostor) return { error: 'PV_INVALID_MOVE' };
        const next = { ...state, guess: action.text };
        return normalizeWord(action.text) === normalizeWord(state.civilianWord)
          ? finish(next, ctx, 'impostor', 'impostor_guessed')
          : finish(next, ctx, 'civilians', 'impostor_caught');
      }
    }
  },

  onTimeout(state, ctx) {
    if (!presentSeats(ctx).includes(state.impostor)) return finish(state, ctx, 'civilians', 'impostor_left');
    switch (state.phase) {
      case 'clues': {
        const seat = state.order[state.step % state.order.length]!;
        const round = Math.floor(state.step / state.order.length) + 1;
        return cluesOrNext({ ...state, clues: [...state.clues, { seat, round, text: null }], step: state.step + 1 }, ctx);
      }
      case 'discussion':
        return startVote(state, ctx);
      case 'vote':
        return closeVote(state, ctx);
      case 'guess':
        return finish(state, ctx, 'civilians', 'impostor_caught');
      case 'finished':
        return finish(state, ctx, state.winner ?? 'civilians', state.reason ?? 'impostor_caught');
    }
  },

  publicView(state) {
    const over = state.phase === 'finished';
    return {
      phase: state.phase,
      mode: state.mode,
      order: state.order,
      rounds: state.rounds,
      round: Math.min(state.rounds, Math.floor(state.step / Math.max(1, state.order.length)) + 1),
      clues: state.clues,
      ready: state.ready,
      voted: state.votes.map((vote) => vote !== null),
      eliminated: state.phase === 'guess' || over ? state.eliminated : null,
      ...(over
        ? {
            reveal: {
              impostor: state.impostor,
              civilianWord: state.civilianWord,
              impostorWord: state.impostorWord,
              votes: state.votes,
              guess: state.guess,
              winner: state.winner,
            },
          }
        : {}),
    };
  },

  privateView(state, seat) {
    // Same shape for everyone: in "word" mode the impostor must not be able
    // to tell from their private view that their word is the odd one.
    const vote = state.votes[seat] ?? null;
    if (seat === state.impostor && state.mode === 'blank') return { word: null, impostor: true, vote };
    return { word: seat === state.impostor ? state.impostorWord : state.civilianWord, impostor: false, vote };
  },

  redactAction(action) {
    return action.type === 'vote' || action.type === 'guess' ? { type: action.type } : action;
  },
};
