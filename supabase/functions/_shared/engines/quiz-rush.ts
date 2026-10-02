import { createQuizEngine, type QuizQuestion } from './quiz-core.ts';
import { createRng } from './rng.ts';
import type { EngineContext } from './types.ts';

/**
 * Quiz Rush: questions drawn by the database (app_private.quiz_start_data)
 * from the server-side bank, already ordered by difficulty. Choices are
 * shuffled from the match seed; the answer never leaves the server before
 * the question closes.
 */
export interface BankQuestion {
  id: string;
  category: string;
  difficulty: number;
  prompt: string;
  answer: string;
  wrong: string[];
}

function isBankQuestion(value: unknown): value is BankQuestion {
  if (typeof value !== 'object' || value === null) return false;
  const q = value as Record<string, unknown>;
  return (
    typeof q.id === 'string' &&
    typeof q.category === 'string' &&
    typeof q.difficulty === 'number' &&
    typeof q.prompt === 'string' &&
    typeof q.answer === 'string' &&
    Array.isArray(q.wrong) &&
    q.wrong.length >= 1 &&
    q.wrong.every((w) => typeof w === 'string')
  );
}

export function questionsFromBank(ctx: EngineContext): QuizQuestion[] {
  const data = Array.isArray(ctx.data) ? ctx.data.filter(isBankQuestion) : [];
  return data.map((q) => {
    const rng = createRng(`${ctx.seed}:${q.id}`);
    const choices = rng.shuffle([q.answer, ...q.wrong]);
    return { id: q.id, category: q.category, difficulty: q.difficulty, prompt: q.prompt, choices, answer: choices.indexOf(q.answer) };
  });
}

export const quizRush = createQuizEngine({
  id: 'quiz_rush',
  minPlayers: 2,
  maxPlayers: 8,
  defaultSeconds: 15,
  questions: questionsFromBank,
});
