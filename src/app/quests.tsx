import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import {
  Button,
  Card,
  ErrorState,
  Icon,
  ListSkeleton,
  ProgressBar,
  Screen,
  SectionHeader,
  SegmentedControl,
  Tag,
  Text,
  colors,
  spacing,
  useToast,
} from '@/design-system';
import type { Achievement, Quest } from '@/features/progression/api';
import { useClaimQuest, useProgression } from '@/features/progression/hooks';
import { CATEGORY_LABELS, questState, resetsIn } from '@/features/progression/presentation';
import { errorMessage } from '@/lib/errors';

function QuestRow({ quest, onClaim, claiming }: { quest: Quest; onClaim: () => void; claiming: boolean }) {
  const state = questState(quest);
  return (
    <Card style={styles.quest}>
      <View style={styles.between}>
        <Text variant="item" style={styles.flex}>
          {quest.name}
        </Text>
        <Tag label={`+${quest.reward_xp} XP`} color={colors.amber} />
      </View>
      <ProgressBar
        progress={quest.progress / quest.target}
        color={state === 'in_progress' ? colors.violet : colors.mint}
        accessibilityLabel={`${quest.progress} sur ${quest.target}`}
      />
      <View style={styles.between}>
        <Text variant="caption" color={colors.textSecondary}>{`${quest.progress}/${quest.target}`}</Text>
        {state === 'claimable' ? (
          <Button label="Récupérer" size="S" variant="reward" testID={`quest-claim-${quest.id}`} loading={claiming} onPress={onClaim} />
        ) : (
          <Text variant="caption" color={state === 'claimed' ? colors.mint : colors.textTertiary}>
            {state === 'claimed' ? 'Récupérée ✓' : `Fin ${resetsIn(quest.resets_at)}`}
          </Text>
        )}
      </View>
    </Card>
  );
}

function AchievementRow({ achievement }: { achievement: Achievement }) {
  const unlocked = !!achievement.unlocked_at;
  return (
    <View style={styles.achievement} accessibilityLabel={`${achievement.name}, ${unlocked ? 'débloqué' : `${achievement.progress} sur ${achievement.threshold}`}`}>
      <View style={[styles.trophy, { backgroundColor: unlocked ? colors.amberSoft : colors.elevated }]}>
        <Icon name="trophy" color={unlocked ? colors.amber : colors.textTertiary} />
      </View>
      <View style={styles.flex}>
        <Text variant="itemSm" color={unlocked ? colors.textPrimary : colors.textSecondary}>
          {achievement.name}
        </Text>
        <Text variant="caption" color={colors.textTertiary}>
          {achievement.description}
        </Text>
        {!unlocked ? (
          <ProgressBar progress={achievement.progress / achievement.threshold} height={4} color={colors.textTertiary} />
        ) : null}
      </View>
      <Text variant="caption" color={unlocked ? colors.mint : colors.textTertiary}>
        {unlocked ? '✓' : `${achievement.progress}/${achievement.threshold}`}
      </Text>
    </View>
  );
}

export default function QuestsScreen() {
  const progression = useProgression();
  const claim = useClaimQuest();
  const toast = useToast();
  const [category, setCategory] = useState<Achievement['category'] | 'all'>('all');
  const data = progression.data;

  const onClaim = (quest: Quest) =>
    claim.mutate(quest.id, {
      onSuccess: (xp) => toast.show({ message: `+${xp} XP`, detail: quest.name, tone: 'success' }),
      onError: (error) => toast.show({ message: errorMessage(error), tone: 'error' }),
    });

  const achievements = (data?.achievements ?? []).filter((a) => category === 'all' || a.category === category);
  const unlocked = (data?.achievements ?? []).filter((a) => a.unlocked_at).length;

  return (
    <Screen gap={18} refreshing={progression.isRefetching} onRefresh={() => void progression.refetch()}>
      <ScreenHeader title="Quêtes et succès" right={<Button label="Classement" size="S" variant="secondary" onPress={() => router.push('/rankings')} />} />
      {progression.isPending ? <ListSkeleton rows={6} /> : null}
      {progression.error ? <ErrorState message={errorMessage(progression.error)} onRetry={() => void progression.refetch()} /> : null}
      {data ? (
        <>
          <Card style={styles.streak}>
            <Text variant="stat" color={data.play_streak > 0 ? colors.amber : colors.textSecondary}>
              {`${data.play_streak} j`}
            </Text>
            <Text variant="caption" color={colors.textSecondary} style={styles.flex}>
              {data.play_streak > 0 ? 'Série de jours joués. Joue aujourd’hui pour la prolonger !' : 'Joue une partie aujourd’hui pour lancer ta série.'}
            </Text>
          </Card>

          {(['daily', 'weekly'] as const).map((period) => (
            <View key={period} style={styles.section}>
              <SectionHeader title={period === 'daily' ? 'Quêtes du jour' : 'Quêtes de la semaine'} />
              {data.quests
                .filter((q) => q.period === period)
                .map((quest) => (
                  <QuestRow key={quest.id} quest={quest} claiming={claim.isPending && claim.variables === quest.id} onClaim={() => onClaim(quest)} />
                ))}
            </View>
          ))}

          <View style={styles.section}>
            <SectionHeader title="Succès" accent={{ text: `${unlocked}/${data.achievements.length}`, color: colors.amber }} />
            <SegmentedControl
              segments={[
                { value: 'all', label: 'Tous' },
                ...(Object.keys(CATEGORY_LABELS) as Achievement['category'][]).map((value) => ({ value, label: CATEGORY_LABELS[value] })),
              ]}
              value={category}
              onChange={setCategory}
            />
            {achievements.map((achievement) => (
              <AchievementRow key={achievement.id} achievement={achievement} />
            ))}
          </View>
          <Text variant="caption" color={colors.textTertiary}>
            Seules les parties réellement jouées (au moins deux coups) comptent pour les quêtes et les succès.
          </Text>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  quest: { gap: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  flex: { flex: 1 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  achievement: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  trophy: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
