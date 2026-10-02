import { act, gameAction, matchState, startEngineMatch } from './engineDb';
import { admin, asUser, createUser, expectError } from './helpers';

interface QuizView {
  phase: string;
  index: number;
  total: number;
  question: { prompt: string; choices: string[]; answer?: number; category: string };
  answered: boolean[];
  scores: number[];
}

async function expire(matchId: string) {
  await admin(`update public.matches set turn_deadline = now() - interval '1 second' where id = $1`, [matchId]);
}

async function serverAnswer(matchId: string): Promise<number> {
  const [row] = await admin<{ answer: number }>(
    `select ((state -> 'questions' -> (state ->> 'index')::int) ->> 'answer')::int as answer from public.match_server_state where match_id = $1`,
    [matchId],
  );
  return row!.answer;
}

describe('quiz rush through the game-action handler', () => {
  it('serves bank questions without answers, scores simultaneous picks and finishes', async () => {
    const { matchId, seats } = await startEngineMatch('quiz_rush', 3, { questions: 5, category: 'science' });
    const [a, b, c] = seats as [NonNullable<typeof seats[0]>, NonNullable<typeof seats[0]>, NonNullable<typeof seats[0]>];
    const first = await matchState<QuizView>(a, matchId);
    expect(first.match.state).toMatchObject({ phase: 'question', index: 0, total: 5, answered: [false, false, false] });
    expect(first.match.state.question.category).toBe('science');
    expect(first.match.state.question).not.toHaveProperty('answer');
    expect(first.match.active_seats).toEqual([0, 1, 2]);

    const right = await serverAnswer(matchId);
    await act(matchId, a, { type: 'answer', choice: right });
    await expectError(act(matchId, a, { type: 'answer', choice: right }), 'PV_ALREADY_DONE');
    const seenByB = await matchState<QuizView>(b, matchId);
    expect(seenByB.match.state.answered).toEqual([true, false, false]);
    expect(seenByB.private_state).toBeNull();
    expect(JSON.stringify(await asUser(b, 'select action from public.match_moves where match_id = $1', [matchId]))).not.toContain('choice');

    await act(matchId, b, { type: 'answer', choice: (right + 1) % 4 });
    await act(matchId, c, { type: 'answer', choice: right });
    const revealed = await matchState<QuizView>(b, matchId);
    expect(revealed.match.state.phase).toBe('reveal');
    expect(revealed.match.state.question.answer).toBe(right);
    expect(revealed.match.state.scores[0]).toBeGreaterThan(0);
    expect(revealed.match.state.scores[1]).toBe(0);

    // Reveal → next question, then let the remaining questions time out.
    for (let i = 0; i < 9; i++) {
      await expire(matchId);
      await gameAction(b, { op: 'timeout', matchId });
    }
    const final = await matchState<QuizView>(c, matchId);
    expect(final.match).toMatchObject({ status: 'finished', outcome: 'completed', result_detail: { reason: 'questions_done' } });
    expect(final.players.find((p) => p.seat === 1)).toMatchObject({ rank: 3 });
  });

  it('keeps the bank out of reach of clients', async () => {
    const user = await createUser();
    await expect(asUser(user, 'select * from app_private.quiz_questions')).rejects.toThrow(/permission denied/);
    await expect(asUser(user, `select app_private.quiz_start_data('{}')`)).rejects.toThrow(/permission denied/);
    const [count] = await admin<{ n: string }>('select count(*) as n from app_private.quiz_questions where active');
    expect(Number(count!.n)).toBeGreaterThanOrEqual(90);
  });
});

describe('mental math through the game-action handler', () => {
  it('plays a duel of generated questions', async () => {
    const { matchId, seats } = await startEngineMatch('mental_math', 2, { questions: 10, question_seconds: 8 });
    const state = await matchState<QuizView>(seats[0]!, matchId);
    expect(state.match.state.question.prompt).toMatch(/= \?$/);
    expect(state.match.state.question.choices).toHaveLength(4);
    const right = await serverAnswer(matchId);
    await act(matchId, seats[0]!, { type: 'answer', choice: right });
    await act(matchId, seats[1]!, { type: 'answer', choice: right });
    const after = await matchState<QuizView>(seats[1]!, matchId);
    expect(after.match.state.phase).toBe('reveal');
    expect(after.match.state.scores.every((s) => s > 0)).toBe(true);
  });
});
