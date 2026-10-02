import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Button, EmptyState, ErrorState, Icon, ListSkeleton, PressableScale, Text, colors } from '@/design-system';
import { errorMessage } from '@/lib/errors';

import { useCatalog } from '../games/catalog';
import { useLobbyNavigation } from '../lobbies/useLobbyNavigation';
import { displayNameOf } from '../profile/avatars';
import { useCosmetics } from '../profile/hooks';
import type { AppNotification } from './api';
import { useMarkNotificationsRead, useNotifications } from './hooks';

function relativeTime(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}

export function NotificationsList() {
  const notifications = useNotifications();
  const markRead = useMarkNotificationsRead();
  const catalog = useCatalog();
  const cosmetics = useCosmetics();
  const lobbyNav = useLobbyNavigation();
  const hasUnread = notifications.data?.some((item) => !item.read_at) ?? false;

  // Viewing the inbox marks it as read (after the list is visible).
  useFocusEffect(
    useCallback(() => {
      if (!hasUnread) return;
      const timer = setTimeout(() => markRead.mutate(undefined), 1200);
      return () => clearTimeout(timer);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasUnread]),
  );

  if (notifications.isPending) return <ListSkeleton rows={4} />;
  if (notifications.error) return <ErrorState message={errorMessage(notifications.error)} onRetry={() => void notifications.refetch()} />;
  if (!notifications.data?.length) {
    return <EmptyState icon="bell" title="Rien de neuf" message="Invitations, demandes d’ami et récompenses apparaîtront ici." />;
  }

  const gameName = (id: unknown) => catalog.data?.find((game) => game.id === id)?.name ?? 'une partie';
  const itemName = (id: unknown) => cosmetics.data?.find((item) => item.id === id)?.name ?? 'un objet';

  const describe = (item: AppNotification): { text: string; onPress?: () => void; action?: { label: string; onPress: () => void } } => {
    const actor = item.actor ? displayNameOf(item.actor) : 'Un joueur';
    const openActor = item.actor_id ? () => router.push({ pathname: '/player/[userId]', params: { userId: item.actor_id! } }) : undefined;
    switch (item.type) {
      case 'friend_request':
        return { text: `${actor} veut devenir ton ami`, onPress: openActor, action: { label: 'Voir', onPress: () => router.push('/friends') } };
      case 'friend_accepted':
        return { text: `${actor} a accepté ta demande d’ami`, onPress: openActor };
      case 'lobby_invite': {
        const invitationId = typeof item.payload.invitation_id === 'string' ? item.payload.invitation_id : null;
        return {
          text: `${actor} t’invite à jouer à ${gameName(item.payload.game_id)}`,
          onPress: openActor,
          action: invitationId ? { label: 'Rejoindre', onPress: () => void lobbyNav.acceptInvitation(invitationId) } : undefined,
        };
      }
      case 'level_up':
        return { text: `Niveau ${String(item.payload.level ?? '')} atteint !`, onPress: () => router.push('/profile') };
      case 'item_unlocked':
        return { text: `Nouvel objet débloqué : ${itemName(item.payload.item_id)}`, onPress: () => router.push('/profile/inventory') };
      case 'system':
        return { text: typeof item.payload.message === 'string' ? item.payload.message : 'Message de PARTYVERSE' };
      case 'direct_message':
        return {
          text: `${actor} t’a envoyé un message`,
          onPress: item.actor_id ? () => router.push({ pathname: '/messages/[userId]', params: { userId: item.actor_id! } }) : undefined,
          action: item.actor_id
            ? { label: 'Lire', onPress: () => router.push({ pathname: '/messages/[userId]', params: { userId: item.actor_id! } }) }
            : undefined,
        };
      case 'group_invite':
        return { text: `${actor} t’invite dans son groupe`, onPress: openActor, action: { label: 'Voir', onPress: () => router.push('/groups') } };
      case 'group_challenge': {
        const groupId = typeof item.payload.group_id === 'string' ? item.payload.group_id : null;
        return {
          text: 'Défi de groupe réussi ! +50 XP',
          onPress: groupId ? () => router.push({ pathname: '/groups/[groupId]', params: { groupId } }) : undefined,
        };
      }
      case 'achievement':
        return { text: `Succès débloqué : ${typeof item.payload.name === 'string' ? item.payload.name : 'nouveau trophée'}`, onPress: () => router.push('/quests') };
      case 'quest':
        return { text: `Quête terminée : ${typeof item.payload.name === 'string' ? item.payload.name : 'récompense disponible'}`, onPress: () => router.push('/quests') };
    }
  };

  return (
    <View style={styles.list}>
      {notifications.data.map((item) => {
        const { text, onPress, action } = describe(item);
        return (
          <View key={item.id} style={styles.row}>
            <PressableScale accessibilityRole="button" accessibilityLabel={text} onPress={onPress} disabled={!onPress} style={styles.main}>
              {item.actor ? (
                <PlayerAvatar player={item.actor} size={44} />
              ) : (
                <View style={styles.icon}>
                  <Icon name={['level_up', 'item_unlocked', 'achievement', 'quest', 'group_challenge'].includes(item.type) ? 'gift' : 'bell'} color={colors.amber} />
                </View>
              )}
              <View style={styles.text}>
                <Text variant="itemSm" color={item.read_at ? colors.textSecondary : colors.textPrimary}>
                  {text}
                </Text>
                <Text variant="meta" color={colors.textTertiary}>
                  {relativeTime(item.created_at)}
                </Text>
              </View>
              {!item.read_at ? <View style={styles.unread} accessibilityLabel="Non lu" /> : null}
            </PressableScale>
            {action ? <Button label={action.label} size="S" onPress={action.onPress} /> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, gap: 2 },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.amberSoft, alignItems: 'center', justifyContent: 'center' },
  unread: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.violet },
});
