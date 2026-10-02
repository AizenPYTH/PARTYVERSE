import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PlayerAvatar } from '@/components/PlayerAvatar';
import { ScreenHeader } from '@/components/ScreenHeader';
import { EmptyState, ErrorState, ListSkeleton, PressableScale, Screen, SegmentedControl, Text, colors } from '@/design-system';
import { useGame } from '@/features/games/catalog';
import { displayNameOf } from '@/features/profile/avatars';
import { useLeaderboard } from '@/features/profile/hooks';
import { errorMessage } from '@/lib/errors';

export default function LeaderboardScreen() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const { game } = useGame(gameId);
  const [scope, setScope] = useState<'global' | 'friends'>('global');
  const board = useLeaderboard(gameId, scope);

  return (
    <Screen gap={18} refreshing={board.isRefetching} onRefresh={() => void board.refetch()}>
      <ScreenHeader title="Classement" subtitle={game ? `${game.name} · parties classées` : undefined} />
      <SegmentedControl
        segments={[
          { value: 'global', label: 'Mondial' },
          { value: 'friends', label: 'Entre amis' },
        ]}
        value={scope}
        onChange={setScope}
      />
      {board.isPending ? <ListSkeleton rows={5} /> : null}
      {board.error ? <ErrorState message={errorMessage(board.error)} onRetry={() => void board.refetch()} /> : null}
      {board.data?.length === 0 ? (
        <EmptyState icon="leaderboard" title="Pas encore de classement" message="Joue une partie classée pour apparaître ici." />
      ) : null}
      <View style={styles.list}>
        {board.data?.map((entry) => (
          <PressableScale
            key={entry.user_id}
            accessibilityRole="button"
            accessibilityLabel={`Rang ${entry.rank}, ${displayNameOf(entry)}, ${entry.rating} points`}
            onPress={() => router.push({ pathname: '/player/[userId]', params: { userId: entry.user_id } })}
            style={[styles.row, entry.is_me && styles.me]}
          >
            <Text variant="item" color={entry.rank <= 3 ? colors.amber : colors.textSecondary} style={styles.rank}>
              {`#${entry.rank}`}
            </Text>
            <PlayerAvatar player={entry} size={40} />
            <View style={styles.flex}>
              <Text variant="itemSm" numberOfLines={1}>
                {entry.is_me ? 'Toi' : displayNameOf(entry)}
              </Text>
              <Text variant="caption" color={colors.textSecondary}>{`${entry.games_played} parties`}</Text>
            </View>
            <Text variant="numeric">{entry.rating}</Text>
          </PressableScale>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14 },
  me: { backgroundColor: colors.violetSoft },
  rank: { width: 44, fontVariant: ['tabular-nums'] },
  flex: { flex: 1, gap: 2 },
});
