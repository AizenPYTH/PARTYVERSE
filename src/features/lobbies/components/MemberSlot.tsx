import { StyleSheet, View } from 'react-native';

import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Icon, Pill, PressableScale, Text, colors } from '@/design-system';

import { displayNameOf } from '../../profile/avatars';
import type { LobbyMember } from '../api';

export function MemberSlot({ member, isHost, onPress }: { member: LobbyMember; isHost: boolean; onPress: () => void }) {
  const name = displayNameOf(member);
  const status = !member.is_online ? 'Hors ligne' : member.is_ready ? '✓ Prêt' : 'Pas prêt';
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${name}${isHost ? ', hôte' : ''}, ${status}`}
      onPress={onPress}
      style={styles.slot}
    >
      <PlayerAvatar
        player={member}
        size={64}
        ring={member.is_ready ? 'ready' : 'none'}
        dimmed={!member.is_ready || !member.is_online}
        badge={isHost ? <Pill label="Hôte" color={colors.amber} /> : undefined}
        badgePosition="top"
      />
      <Text variant="captionBold" numberOfLines={1}>
        {name}
      </Text>
      <Text variant="metaBold" color={!member.is_online ? colors.coral : member.is_ready ? colors.mint : colors.textSecondary}>
        {status}
      </Text>
    </PressableScale>
  );
}

export function EmptySlot({ canInvite, onInvite }: { canInvite: boolean; onInvite: () => void }) {
  if (!canInvite) {
    return (
      <View style={styles.slot} accessibilityLabel="Place libre">
        <View style={[styles.circle, styles.free]} />
        <Text variant="captionBold" color={colors.textDisabled}>
          Libre
        </Text>
      </View>
    );
  }
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel="Inviter un ami" onPress={onInvite} style={styles.slot}>
      <View style={styles.circle}>
        <Icon name="plus" color={colors.textSecondary} />
      </View>
      <Text variant="captionBold" color={colors.textSecondary}>
        Inviter
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  slot: { width: '25%', alignItems: 'center', gap: 4, paddingVertical: 6 },
  circle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  free: { borderColor: colors.border },
});
