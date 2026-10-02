import { createQuizEngine, type QuizQuestion } from './quiz-core.ts';
import { createRng, type Rng } from './rng.ts';
import { numberSetting, type EngineContext } from './types.ts';

/**
 * Calcul Express: arithmetic generated from the match seed, getting harder
 * through the game (additions → tables → mixed operations). Four choices,
 * with distractors close to the answer.
 */
interface Problem {
  prompt: string;
  value: number;
  level: 1 | 2 | 3;
}

const between = (rng: Rng, min: number, max: number) => min + rng.int(max - min + 1);

export function generateProblem(rng: Rng, level: 1 | 2 | 3): Problem {
  if (level === 1) {
    const a = between(rng, 2, 20);
    const b = between(rng, 2, 20);
    if (rng.next() < 0.5) return { prompt: `${a} + ${b}`, value: a + b, level };
    const [big, small] = a >= b ? [a, b] : [b, a];
    return { prompt: `${big} − ${small}`, value: big - small, level };
  }
  if (level === 2) {
    const kind = rng.int(3);
    if (kind === 0) {
      const a = between(rng, 3, 12);
      const b = between(rng, 3, 12);
      return { prompt: `${a} × ${b}`, value: a * b, level };
    }
    const a = between(rng, 21, 99);
    const b = between(rng, 11, 79);
    if (kind === 1) return { prompt: `${a} + ${b}`, value: a + b, level };
    const [big, small] = a >= b ? [a, b] : [b, a];
    return { prompt: `${big} − ${small}`, value: big - small, level };
  }
  const kind = rng.int(3);
  if (kind === 0) {
    const a = between(rng, 3, 12);
    const b = between(rng, 3, 12);
    const c = between(rng, 2, 30);
    return { prompt: `${a} × ${b} + ${c}`, value: a * b + c, level };
  }
  if (kind === 1) {
    const b = between(rng, 3, 12);
    const quotient = between(rng, 3, 15);
    return { prompt: `${b * quotient} ÷ ${b}`, value: quotient, level };
  }
  const a = between(rng, 13, 25);
  const b = between(rng, 3, 9);
  return { prompt: `${a} × ${b}`, value: a * b, level };
}

/** Three distinct positive distractors near the answer. */
export function distractors(rng: Rng, value: number): number[] {
  const offsets = rng.shuffle([1, 2, 3, 10, -1, -2, -3, -10, 5, -5]);
  const result: number[] = [];
  for (const offset of offsets) {
    const candidate = value + offset;
    if (candidate >= 0 && candidate !== value && !result.includes(candidate)) result.push(candidate);
    if (result.length === 3) break;
  }
  return result;
}

export function generateQuestions(ctx: EngineContext): QuizQuestion[] {
  const count = Math.max(1, Math.min(30, numberSetting(ctx.settings, 'questions', 10)));
  const rng = createRng(`${ctx.seed}:math`);
  return Array.from({ length: count }, (_, index) => {
    const progress = index / count;
    const level: 1 | 2 | 3 = progress < 0.34 ? 1 : progress < 0.67 ? 2 : 3;
    const problem = generateProblem(rng, level);
    const choices = rng.shuffle([problem.value, ...distractors(rng, problem.value)]);
    return {
      id: `math-${index}`,
      category: 'math',
      difficulty: level,
      prompt: `${problem.prompt} = ?`,
      choices: choices.map(String),
      answer: choices.indexOf(problem.value),
    };
  });
}

export const mentalMath = createQuizEngine({
  id: 'mental_math',
  minPlayers: 2,
  maxPlayers: 8,
  defaultSeconds: 10,
  questions: generateQuestions,
});
