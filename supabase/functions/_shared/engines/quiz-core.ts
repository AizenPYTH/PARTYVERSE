import { numberSetting, presentSeats, rankByScore, type EngineContext, type GameEngine, type Outcome, type Seat, type Transition } from './types.ts';

/**
 * Shared core for question-and-answer games (Quiz Rush, Calcul Express).
 *
 *  - Every present player answers the same question simultaneously.
 *  - The answer and the other players' picks stay server-side until the
 *    question closes (everybody answered or the clock ran out).
 *  - A short reveal step shows the answer and points, then the next question.
 *  - Points reward correctness, speed, difficulty and streaks.
 */
export interface QuizQuestion {
  id: string;
  category: string;
  difficulty: number;
  prompt: string;
  choices: string[];
  answer: number;
}

export interface QuizPick {
  choice: number;
  ms: number;
}

export interface QuizRoundResult {
  index: number;
  answer: number;
  picks: (QuizPick | null)[];
  points: number[];
}

export interface QuizState {
  seed: string;
  questions: QuizQuestion[];
  index: number;
  phase: 'question' | 'reveal' | 'finished';
  questionStartedAt: number;
  questionMs: number;
  revealMs: number;
  /** picks[seat] for the current question (server-side only). */
  picks: (QuizPick | null)[];
  scores: number[];
  streaks: number[];
  correct: number[];
  rounds: QuizRoundResult[];
}

export type QuizAction = { type: 'answer'; choice: number };

export const REVEAL_MS = 4000;
const STREAK_BONUS = 50;

/** Points for one answer: (100 + up to 100 for speed) × difficulty, + streak bonus from the 3rd in a row. */
export function pointsFor(correct: boolean, ms: number, limitMs: number, difficulty: number, streak: number): number {
  if (!correct) return 0;
  const speed = Math.max(0, Math.min(1, 1 - ms / limitMs));
  return Math.round((100 + 100 * speed) * Math.max(1, difficulty)) + (streak >= 3 ? STREAK_BONUS : 0);
}

export interface QuizEngineOptions {
  id: string;
  minPlayers: number;
  maxPlayers: number;
  defaultSeconds: number;
  /** Builds the question list at start (from server data or the seed). */
  questions(ctx: EngineContext): QuizQuestion[];
}

export function createQuizEngine(options: QuizEngineOptions): GameEngine<QuizState, QuizAction> {
  const questionStep = (state: QuizState, ctx: EngineContext): Transition<QuizState> => {
    const waiting = presentSeats(ctx).filter((seat) => state.picks[seat] == null);
    return {
      state,
      activeSeats: waiting,
      turnSeat: null,
      deadlineMs: Math.max(0, state.questionMs - (ctx.now - state.questionStartedAt)),
    };
  };

  const finish = (state: QuizState, ctx: EngineContext, log?: Record<string, unknown>): Transition<QuizState> => {
    const seats = presentSeats(ctx);
    const scores = Object.fromEntries(state.scores.map((score, seat) => [seat, score]));
    const ranked = rankByScore(scores, seats.length > 0 ? seats : state.scores.map((_, seat) => seat));
    // Players who left keep their score but rank last.
    const absent = state.scores
      .map((score, seat) => ({ seat, score }))
      .filter(({ seat }) => !seats.includes(seat))
      .map(({ seat, score }) => ({ seat, result: 'loss' as const, rank: ranked.length + 1, score }));
    const results = [...ranked, ...absent];
    const winners = results.filter((r) => r.rank === 1).length;
    const outcome: Outcome = {
      outcome: ctx.seats === 2 ? (winners === 1 ? 'win' : 'draw') : 'completed',
      reason: 'questions_done',
      results,
    };
    return { state: { ...state, phase: 'finished' }, activeSeats: [], turnSeat: null, deadlineMs: null, outcome, log };
  };

  /** Closes the current question: scores it and shows the answer. */
  const reveal = (state: QuizState, ctx: EngineContext): Transition<QuizState> => {
    const question = state.questions[state.index]!;
    const scores = [...state.scores];
    const streaks = [...state.streaks];
    const correct = [...state.correct];
    const points = state.scores.map((_, seat) => {
      const pick = state.picks[seat] ?? null;
      const right = pick !== null && pick.choice === question.answer;
      streaks[seat] = right ? (streaks[seat] ?? 0) + 1 : 0;
      if (right) correct[seat] = (correct[seat] ?? 0) + 1;
      const earned = pick ? pointsFor(right, pick.ms, state.questionMs, question.difficulty, streaks[seat]!) : 0;
      scores[seat] = (scores[seat] ?? 0) + earned;
      return earned;
    });
    const round: QuizRoundResult = { index: state.index, answer: question.answer, picks: state.picks, points };
    const next: QuizState = { ...state, phase: 'reveal', scores, streaks, correct, rounds: [...state.rounds, round] };
    return { state: next, activeSeats: [], turnSeat: null, deadlineMs: state.revealMs, log: { question: state.index, points } };
  };

  return {
    id: options.id,
    minPlayers: options.minPlayers,
    maxPlayers: options.maxPlayers,

    init(ctx) {
      const questions = options.questions(ctx);
      const state: QuizState = {
        seed: ctx.seed,
        questions,
        index: 0,
        phase: 'question',
        questionStartedAt: ctx.now,
        questionMs: numberSetting(ctx.settings, 'question_seconds', options.defaultSeconds) * 1000,
        revealMs: REVEAL_MS,
        picks: Array.from({ length: ctx.seats }, () => null),
        scores: Array.from({ length: ctx.seats }, () => 0),
        streaks: Array.from({ length: ctx.seats }, () => 0),
        correct: Array.from({ length: ctx.seats }, () => 0),
        rounds: [],
      };
      if (questions.length === 0) return finish(state, ctx);
      return questionStep(state, ctx);
    },

    parseAction(raw) {
      if (typeof raw !== 'object' || raw === null) return null;
      const { type, choice } = raw as { type?: unknown; choice?: unknown };
      if (type !== 'answer' || typeof choice !== 'number' || !Number.isInteger(choice)) return null;
      return { type: 'answer', choice };
    },

    apply(state, seat, action, ctx) {
      if (state.phase !== 'question') return { error: 'PV_INVALID_MOVE' };
      if (seat < 0 || seat >= state.picks.length || ctx.absentSeats.includes(seat)) return { error: 'PV_NOT_A_PLAYER' };
      if (state.picks[seat] != null) return { error: 'PV_ALREADY_DONE' };
      const question = state.questions[state.index]!;
      if (action.choice < 0 || action.choice >= question.choices.length) return { error: 'PV_INVALID_MOVE' };
      const elapsed = ctx.now - state.questionStartedAt;
      if (elapsed > state.questionMs) return { error: 'PV_TURN_EXPIRED' };

      const picks = [...state.picks];
      picks[seat] = { choice: action.choice, ms: Math.max(0, elapsed) };
      const next = { ...state, picks };
      const everyone = presentSeats(ctx).every((s) => picks[s] != null);
      return everyone ? reveal(next, ctx) : { ...questionStep(next, ctx), log: { answered: seat } };
    },

    onTimeout(state, ctx) {
      if (state.phase === 'question') return reveal(state, ctx);
      if (state.phase === 'reveal') {
        if (state.index + 1 >= state.questions.length || presentSeats(ctx).length < Math.min(2, options.minPlayers)) {
          return finish(state, ctx);
        }
        return questionStep(
          { ...state, index: state.index + 1, phase: 'question', questionStartedAt: ctx.now, picks: state.picks.map(() => null) },
          ctx,
        );
      }
      return finish(state, ctx);
    },

    publicView(state) {
      const question = state.questions[state.index];
      const open = state.phase === 'question';
      return {
        phase: state.phase,
        index: state.index,
        total: state.questions.length,
        questionMs: state.questionMs,
        questionStartedAt: state.questionStartedAt,
        question: question
          ? {
              category: question.category,
              difficulty: question.difficulty,
              prompt: question.prompt,
              choices: question.choices,
              ...(open ? {} : { answer: question.answer }),
            }
          : null,
        // Who answered, never what, while the question is open.
        answered: state.picks.map((pick) => pick != null),
        scores: state.scores,
        streaks: state.streaks,
        correct: state.correct,
        lastRound: open ? null : (state.rounds.at(-1) ?? null),
      };
    },

    privateView(state, seat) {
      const pick = state.picks[seat];
      return state.phase === 'question' && pick ? { choice: pick.choice } : null;
    },

    redactAction: () => ({ type: 'answer' }),
  };
}

export type QuizSeat = Seat;
