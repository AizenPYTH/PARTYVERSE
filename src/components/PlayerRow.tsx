import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { PressableScale, Text, colors, type PresenceKind } from '@/design-system';

import { displayNameOf } from '@/features/profile/avatars';

import { PlayerAvatar } from './PlayerAvatar';

export function PlayerRow({
  player,
  status,
  statusColor = colors.textSecondary,
  presence,
  action,
  onPress,
}: {
  player: { avatar_id?: string | null; display_name?: string | null; username?: string | null; level?: number | null };
  status?: string;
  statusColor?: string;
  presence?: PresenceKind;
  action?: ReactNode;
  onPress?: () => void;
}) {
  const name = displayNameOf(player);
  return (
    <View style={styles.row}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${name}${status ? `, ${status}` : ''}`}
        onPress={onPress}
        disabled={!onPress}
        style={styles.main}
      >
        <PlayerAvatar player={player} size={48} presence={presence} />
        <View style={styles.text}>
          <Text variant="item" numberOfLines={1}>
            {name}
            {player.level ? (
              <Text variant="caption" color={colors.textTertiary}>{`  Niv. ${player.level}`}</Text>
            ) : null}
          </Text>
          {status ? (
            <Text variant="caption" color={statusColor} numberOfLines={1}>
              {status}
            </Text>
          ) : null}
        </View>
      </PressableScale>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, gap: 2 },
});
