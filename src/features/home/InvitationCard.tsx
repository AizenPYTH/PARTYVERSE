import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Text, colors, useToast } from '@/design-system';
import { useCountdown } from '@/hooks/useCountdown';
import { formatCountdown } from '@/lib/serverClock';

import { GameEmblem } from '../games/components/GameEmblem';
import type { Invitation } from '../lobbies/api';
import { displayNameOf } from '../profile/avatars';

export function InvitationCard({
  invitation,
  gameName,
  loading,
  onJoin,
  onExpired,
}: {
  invitation: Invitation;
  gameName: string;
  loading: boolean;
  onJoin: () => void;
  onExpired: () => void;
}) {
  const toast = useToast();
  const remaining = useCountdown(invitation.expires_at, 1000);
  const expiredNotified = useRef(false);
  const expired = remaining === 0;
  const sender = displayNameOf({ display_name: invitation.sender_display_name, username: invitation.sender_username });

  useEffect(() => {
    if (expired && !expiredNotified.current) {
      expiredNotified.current = true;
      toast.show({ message: 'Invitation expirée', tone: 'error' });
      onExpired();
    }
  }, [expired, onExpired, toast]);

  if (expired) return null;

  return (
    <Card bordered style={styles.card}>
      <GameEmblem gameId={invitation.game_id} height={48} width={48} radius={14} scale={0.42} />
      <View style={styles.text}>
        <Text variant="itemSm" numberOfLines={1}>{`${sender} t’invite`}</Text>
        <Text variant="caption" color={colors.textSecondary} style={styles.numeric}>
          {`${gameName} · ${remaining === null ? '' : formatCountdown(remaining)}`}
        </Text>
      </View>
      <Button label="Rejoindre" size="M" onPress={onJoin} loading={loading} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  text: { flex: 1, gap: 2 },
  numeric: { fontVariant: ['tabular-nums'] },
});
