import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PlayerRow } from '@/components/PlayerRow';
import { ScreenHeader } from '@/components/ScreenHeader';
import { EmptyState, ErrorState, ListSkeleton, Screen, SegmentedControl, Text, colors, spacing } from '@/design-system';
import { useXpLeaderboard } from '@/features/progression/hooks';
import { errorMessage } from '@/lib/errors';

export default function RankingsScreen() {
  const [scope, setScope] = useState<'global' | 'friends'>('friends');
  const [period, setPeriod] = useState<'week' | 'all'>('week');
  const board = useXpLeaderboard(scope, period);

  return (
    <Screen gap={18} refreshing={board.isRefetching} onRefresh={() => void board.refetch()}>
      <ScreenHeader title="Classement XP" />
      <SegmentedControl segments={[{ value: 'friends', label: 'Amis' }, { value: 'global', label: 'Monde' }]} value={scope} onChange={setScope} />
      <SegmentedControl segments={[{ value: 'week', label: 'Cette semaine' }, { value: 'all', label: 'Depuis toujours' }]} value={period} onChange={setPeriod} />
      {board.isPending ? <ListSkeleton rows={6} /> : null}
      {board.error ? <ErrorState message={errorMessage(board.error)} onRetry={() => void board.refetch()} /> : null}
      {board.data && board.data.length === 0 ? (
        <EmptyState icon="leaderboard" title="Personne pour l’instant" message="Joue une partie pour entrer au classement." />
      ) : null}
      <View style={styles.list}>
        {board.data?.map((row) => (
          <PlayerRow
            key={row.user_id}
            player={row}
            status={`${row.rank}${row.rank === 1 ? 'er' : 'e'} · ${row.xp} XP`}
            statusColor={row.is_me ? colors.violetText : colors.textSecondary}
            onPress={() => router.push({ pathname: '/player/[userId]', params: { userId: row.user_id } })}
            action={
              <Text variant="numeric" color={row.rank <= 3 ? colors.amber : colors.textSecondary}>
                {`#${row.rank}`}
              </Text>
            }
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ list: { gap: spacing.md } });
