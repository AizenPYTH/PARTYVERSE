import { StyleSheet, View } from 'react-native';
import { z } from 'zod';

import { ErrorState, PressableScale, Tag, Text, colors, radii, spacing } from '@/design-system';

import type { MatchState } from '../../matches/api';
import { MatchShell } from '../../matches/components/MatchShell';
import { turnStatus, type StatusLine } from '../../matches/presentation';
import { canAct, useEngineAction } from '../../matches/useEngineAction';
import type { MatchController } from '../../matches/useMatch';
import { CATEGORY_LABELS, quizStatus } from './presentation';

const pick = z.object({ choice: z.number(), ms: z.number() }).nullable();

export const stateSchema = z.object({
  phase: z.enum(['question', 'reveal', 'finished']),
  index: z.number(),
  total: z.number(),
  question: z
    .object({
      category: z.string(),
      difficulty: z.number(),
      prompt: z.string(),
      choices: z.array(z.string()),
      answer: z.number().optional(),
    })
    .nullable(),
  answered: z.array(z.boolean()),
  scores: z.array(z.number()),
  streaks: z.array(z.number()),
  lastRound: z.object({ index: z.number(), answer: z.number(), picks: z.array(pick), points: z.array(z.number()) }).nullable(),
});
const privateSchema = z.object({ choice: z.number() }).nullable();

type Action = { type: 'answer'; choice: number };

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function QuizMatch({ state, match, title }: { state: MatchState; match: MatchController; title: string }) {
  const action = useEngineAction<Action>(state, match);
  const parsed = stateSchema.safeParse(state.match.state);
  const mine = privateSchema.safeParse(state.private_state ?? null);
  if (!parsed.success || !mine.success) return <ErrorState message="État de partie illisible." onRetry={() => void match.query.refetch()} />;

  const game = parsed.data;
  const mySeat = state.my_seat;
  const question = game.question;
  const myPick =
    game.phase === 'question'
      ? (mine.data?.choice ?? (action.pending ? action.pendingPayload?.choice : undefined) ?? null)
      : (game.lastRound?.picks[mySeat ?? -1]?.choice ?? null);
  const playable = canAct(state) && !action.pending && game.phase === 'question';
  const answeredCount = game.answered.filter(Boolean).length;
  const present = state.players.filter((p) => !p.left).length;
  const myPoints = mySeat !== null ? (game.lastRound?.points[mySeat] ?? 0) : 0;

  const status: StatusLine =
    state.match.status === 'active' ? quizStatus(game.phase, myPick, question?.answer, mySeat !== null, myPoints) : turnStatus(state, mySeat);

  return (
    <MatchShell
      state={state}
      match={match}
      title={title}
      status={status}
      scoreOf={(player) => game.scores[player.seat] ?? 0}
      reasons={{ questions_done: 'Toutes les questions jouées' }}
      footer={
        <View style={styles.footer}>
          <Text variant="captionBold" color={colors.textSecondary}>
            {game.phase === 'question' ? `${answeredCount}/${present} ont répondu` : 'Question suivante dans un instant'}
          </Text>
          {mySeat !== null && (game.streaks[mySeat] ?? 0) >= 2 ? (
            <Text variant="captionBold" color={colors.amber}>{`Série ×${game.streaks[mySeat]}`}</Text>
          ) : null}
        </View>
      }
    >
      {question ? (
        <View style={styles.column}>
          <View style={styles.meta}>
            <Text variant="overline" color={colors.textSecondary}>{`Question ${game.index + 1}/${game.total}`}</Text>
            <View style={styles.tags}>
              <Tag label={CATEGORY_LABELS[question.category] ?? question.category} color={colors.blue} />
              <Tag label={['Facile', 'Moyen', 'Difficile'][question.difficulty - 1] ?? 'Moyen'} color={colors.amber} />
            </View>
          </View>
          <Text variant="title" style={styles.prompt} accessibilityRole="header">
            {question.prompt}
          </Text>
          <View style={styles.choices}>
            {question.choices.map((choice, index) => {
              const revealed = question.answer !== undefined;
              const isAnswer = revealed && index === question.answer;
              const isMine = myPick === index;
              const tone = isAnswer ? styles.correct : revealed && isMine ? styles.wrong : isMine ? styles.mine : null;
              return (
                <PressableScale
                  key={index}
                  testID={`quiz-choice-${index}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isMine, disabled: !playable }}
                  accessibilityLabel={`${LETTERS[index]} : ${choice}${isAnswer ? ', bonne réponse' : ''}${isMine ? ', ton choix' : ''}`}
                  disabled={!playable || myPick !== null}
                  onPress={() => action.send({ type: 'answer', choice: index })}
                  style={[styles.choice, tone]}
                >
                  <Text variant="captionBold" color={isAnswer || (isMine && !revealed) ? colors.onAccent : colors.textSecondary}>
                    {LETTERS[index]}
                  </Text>
                  <Text variant="item" color={isAnswer || (isMine && !revealed) ? colors.onAccent : colors.textPrimary} style={styles.choiceText}>
                    {choice}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>
      ) : null}
    </MatchShell>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: spacing.lg },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tags: { flexDirection: 'row', gap: spacing.xs },
  prompt: { textAlign: 'center' },
  choices: { gap: spacing.sm },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
  },
  choiceText: { flex: 1 },
  mine: { backgroundColor: colors.violet, borderColor: colors.violet },
  correct: { backgroundColor: colors.mint, borderColor: colors.mint },
  wrong: { borderColor: colors.coral, backgroundColor: colors.coralSoft },
  footer: { flexDirection: 'row', justifyContent: 'space-between' },
});
