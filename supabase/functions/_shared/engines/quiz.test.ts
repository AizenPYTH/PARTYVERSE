import { distractors, generateProblem, generateQuestions, mentalMath } from './mental-math';
import { pointsFor, REVEAL_MS, type QuizState } from './quiz-core';
import { questionsFromBank, quizRush } from './quiz-rush';
import { createRng } from './rng';
import { attempt, ctx, play } from './testing';
import type { Transition } from './types';

const BANK = [
  { id: 'q1', category: 'science', difficulty: 1, prompt: 'Planète rouge ?', answer: 'Mars', wrong: ['Vénus', 'Jupiter', 'Mercure'] },
  { id: 'q2', category: 'science', difficulty: 2, prompt: 'Symbole de l’or ?', answer: 'Au', wrong: ['Ag', 'Or', 'Go'] },
];

const start = (seats = 2) => quizRush.init(ctx({ seats, data: BANK, settings: { question_seconds: 10 } }));
const answerOf = (t: Transition<QuizState>) => t.state.questions[t.state.index]!.answer;

describe('quiz core', () => {
  it('shuffles choices deterministically and keeps the answer secret while open', () => {
    const questions = questionsFromBank(ctx({ data: BANK }));
    expect(questions.map((q) => q.choices[q.answer])).toEqual(['Mars', 'Au']);
    expect(questionsFromBank(ctx({ data: BANK }))).toEqual(questions);
    const t = start();
    expect(t).toMatchObject({ activeSeats: [0, 1], turnSeat: null, deadlineMs: 10_000 });
    const view = quizRush.publicView(t.state) as { question: Record<string, unknown> };
    expect(view.question).not.toHaveProperty('answer');
    expect(JSON.stringify(view)).not.toContain('Symbole');
  });

  it('collects simultaneous answers, hides picks, then reveals and scores', () => {
    let t = start();
    const right = answerOf(t);
    const wrong = (right + 1) % 4;
    t = play(quizRush, t, 1, { type: 'answer', choice: wrong }, ctx({ now: 1_002_000, data: BANK }));
    expect(t.activeSeats).toEqual([0]);
    expect(quizRush.privateView(t.state, 1)).toEqual({ choice: wrong });
    expect(quizRush.privateView(t.state, 0)).toBeNull();
    expect(JSON.stringify(quizRush.publicView(t.state))).not.toContain(`"choice"`);
    expect(attempt(quizRush, t, 1, { type: 'answer', choice: right })).toBe('PV_ALREADY_DONE');
    expect(quizRush.redactAction!({ type: 'answer', choice: right })).toEqual({ type: 'answer' });

    t = play(quizRush, t, 0, { type: 'answer', choice: right }, ctx({ now: 1_005_000 }));
    expect(t.state.phase).toBe('reveal');
    expect(t).toMatchObject({ activeSeats: [], deadlineMs: REVEAL_MS });
    expect(t.state.scores).toEqual([pointsFor(true, 5000, 10_000, 1, 1), 0]);
    const view = quizRush.publicView(t.state) as { question: { answer: number }; lastRound: { picks: unknown[] } };
    expect(view.question.answer).toBe(right);
    expect(view.lastRound.picks[1]).toEqual({ choice: wrong, ms: 2000 });
  });

  it('closes a question on timeout and finishes after the last reveal', () => {
    let t = start();
    t = quizRush.onTimeout(t.state, ctx());
    expect(t.state.phase).toBe('reveal');
    t = quizRush.onTimeout(t.state, ctx({ now: 2_000_000 }));
    expect(t.state).toMatchObject({ phase: 'question', index: 1, questionStartedAt: 2_000_000 });
    expect(t.state.picks).toEqual([null, null]);
    t = play(quizRush, t, 0, { type: 'answer', choice: answerOf(t) }, ctx({ now: 2_001_000 }));
    expect(attempt(quizRush, t, 1, { type: 'answer', choice: 0 }, ctx({ now: 2_011_000 }))).toBe('PV_TURN_EXPIRED');
    t = quizRush.onTimeout(t.state, ctx({ now: 2_011_000 }));
    t = quizRush.onTimeout(t.state, ctx({ now: 2_015_000 }));
    expect(t.outcome).toMatchObject({ outcome: 'win', reason: 'questions_done' });
    expect(t.outcome?.results[0]).toMatchObject({ seat: 0, result: 'win', rank: 1 });
  });

  it('ignores absent players and ranks N players', () => {
    let t = quizRush.init(ctx({ seats: 3, data: BANK }));
    const right = answerOf(t);
    const away = ctx({ seats: 3, absentSeats: [2] });
    t = play(quizRush, t, 0, { type: 'answer', choice: right }, away);
    t = play(quizRush, t, 1, { type: 'answer', choice: right }, away);
    expect(t.state.phase).toBe('reveal');
    expect(attempt(quizRush, quizRush.init(ctx({ seats: 3, data: BANK })), 2, { type: 'answer', choice: 0 }, away)).toBe('PV_NOT_A_PLAYER');
    t = quizRush.onTimeout(t.state, away);
    t = quizRush.onTimeout(quizRush.onTimeout(t.state, away).state, away);
    expect(t.outcome?.outcome).toBe('completed');
    expect(t.outcome?.results.find((r) => r.seat === 2)).toMatchObject({ result: 'loss', rank: 3 });
  });

  it('rewards speed, difficulty and streaks', () => {
    expect(pointsFor(false, 0, 10_000, 3, 5)).toBe(0);
    expect(pointsFor(true, 0, 10_000, 1, 1)).toBe(200);
    expect(pointsFor(true, 10_000, 10_000, 1, 1)).toBe(100);
    expect(pointsFor(true, 5000, 10_000, 2, 1)).toBe(300);
    expect(pointsFor(true, 5000, 10_000, 2, 3)).toBe(350);
  });
});

describe('mental math generator', () => {
  it('generates correct problems with distinct choices and rising difficulty', () => {
    const questions = generateQuestions(ctx({ settings: { questions: 12 } }));
    expect(questions).toHaveLength(12);
    for (const q of questions) {
      expect(new Set(q.choices).size).toBe(4);
      const expression = q.prompt.replace(' = ?', '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
      // eslint-disable-next-line no-new-func
      expect(Number(q.choices[q.answer])).toBe(Function(`return (${expression})`)());
    }
    expect(questions[0]!.difficulty).toBe(1);
    expect(questions[11]!.difficulty).toBe(3);
    expect(generateQuestions(ctx({ settings: { questions: 12 } }))).toEqual(questions);
  });

  it('never produces negative results or duplicate distractors', () => {
    const rng = createRng('x');
    for (let i = 0; i < 300; i++) {
      const problem = generateProblem(rng, ((i % 3) + 1) as 1 | 2 | 3);
      expect(problem.value).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(problem.value)).toBe(true);
      const wrong = distractors(rng, problem.value);
      expect(new Set(wrong).size).toBe(3);
      expect(wrong).not.toContain(problem.value);
    }
  });

  it('runs on the shared quiz core', () => {
    const t = mentalMath.init(ctx({ settings: { questions: 5, question_seconds: 8 } }));
    expect(t).toMatchObject({ activeSeats: [0, 1], deadlineMs: 8000 });
    expect(t.state.questions).toHaveLength(5);
  });
});
