import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PlayerAvatar } from '@/components/PlayerAvatar';
import { PlayerRow } from '@/components/PlayerRow';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Screen,
  SegmentedControl,
  Text,
  colors,
} from '@/design-system';
import { useCatalog } from '@/features/games/catalog';
import { useLobbyNavigation } from '@/features/lobbies/useLobbyNavigation';
import { displayNameOf } from '@/features/profile/avatars';
import { useHomeOverview } from '@/features/profile/hooks';
import type { Friend, FriendRequest } from '@/features/social/api';
import { useFriendRequests, useFriends, useSocialActions } from '@/features/social/hooks';
import { describePresence } from '@/features/social/presence';
import { errorMessage } from '@/lib/errors';

type Tab = 'online' | 'all' | 'requests';

export default function FriendsScreen() {
  const friends = useFriends();
  const requests = useFriendRequests();
  const overview = useHomeOverview();
  const catalog = useCatalog();
  const lobbyNav = useLobbyNavigation();
  const [tab, setTab] = useState<Tab>('online');

  const all = friends.data ?? [];
  const online = all.filter((friend) => friend.presence !== 'offline');
  const incoming = (requests.data ?? []).filter((request) => request.direction === 'incoming');
  const outgoing = (requests.data ?? []).filter((request) => request.direction === 'outgoing');
  const myLobbyId = overview.data?.active_lobby?.status !== 'in_progress' ? overview.data?.active_lobby?.lobby_id : null;
  const gameName = (id: string | null) => catalog.data?.find((game) => game.id === id)?.name ?? null;
  const list = tab === 'online' ? online : all;

  return (
    <Screen
      withTabBar
      gap={18}
      refreshing={friends.isRefetching || requests.isRefetching}
      onRefresh={() => {
        void friends.refetch();
        void requests.refetch();
      }}
    >
      <View style={styles.header}>
        <Text variant="tabTitle" accessibilityRole="header">
          Amis
        </Text>
        <Button label="+ Ajouter" variant="secondary" size="M" onPress={() => router.push('/friends/add')} />
      </View>
      <SegmentedControl
        segments={[
          { value: 'online', label: `En ligne · ${online.length}` },
          { value: 'all', label: `Tous · ${all.length}` },
          { value: 'requests', label: 'Demandes', badge: incoming.length },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab !== 'requests' ? (
        <View style={styles.list}>
          {friends.isPending ? <ListSkeleton rows={4} /> : null}
          {friends.error ? <ErrorState message={errorMessage(friends.error)} onRetry={() => void friends.refetch()} /> : null}
          {friends.data && list.length === 0 ? (
            <EmptyState
              icon="friends"
              title={tab === 'online' ? 'Aucun ami en ligne' : 'Pas encore d’amis'}
              message={tab === 'online' ? 'Invite-les à te rejoindre avec un code de salon.' : 'Cherche un pseudo pour envoyer une demande.'}
              actionLabel="Ajouter des amis"
              onAction={() => router.push('/friends/add')}
            />
          ) : null}
          {list.map((friend) => (
            <FriendRow
              key={friend.user_id}
              friend={friend}
              gameName={gameName(friend.game_id)}
              pending={lobbyNav.pending}
              onInvite={() => void lobbyNav.inviteFriend(friend.user_id, myLobbyId)}
              onJoin={(asSpectator) => friend.lobby_id && void lobbyNav.join(friend.lobby_id, asSpectator)}
            />
          ))}
        </View>
      ) : (
        <RequestsList incoming={incoming} outgoing={outgoing} loading={requests.isPending} error={requests.error} gameName={gameName} />
      )}
    </Screen>
  );
}

function FriendRow({
  friend,
  gameName,
  pending,
  onInvite,
  onJoin,
}: {
  friend: Friend;
  gameName: string | null;
  pending: string | null;
  onInvite: () => void;
  onJoin: (asSpectator: boolean) => void;
}) {
  const presence = describePresence(friend.presence, {
    gameName,
    playerCount: friend.lobby_player_count,
    maxPlayers: friend.lobby_max_players,
  });
  const action = (() => {
    if (friend.presence === 'in_game' && friend.lobby_id) {
      return <Button label="Regarder" variant="secondary" size="S" loading={pending === `join:${friend.lobby_id}`} onPress={() => onJoin(true)} />;
    }
    if (friend.presence === 'in_lobby' && friend.lobby_id) {
      return <Button label="Rejoindre" variant="secondary" size="S" loading={pending === `join:${friend.lobby_id}`} onPress={() => onJoin(false)} />;
    }
    if (friend.presence === 'online' || friend.presence === 'away') {
      return <Button label="Inviter" size="S" loading={pending === `invite-friend:${friend.user_id}`} onPress={onInvite} />;
    }
    return undefined;
  })();
  return (
    <PlayerRow
      player={friend}
      presence={friend.presence}
      status={presence.label}
      statusColor={presence.color}
      action={action}
      onPress={() => router.push({ pathname: '/player/[userId]', params: { userId: friend.user_id } })}
    />
  );
}

function RequestsList({
  incoming,
  outgoing,
  loading,
  error,
  gameName,
}: {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  loading: boolean;
  error: unknown;
  gameName: (id: string | null) => string | null;
}) {
  const { respond, cancelRequest } = useSocialActions();
  if (loading) return <ListSkeleton rows={2} />;
  if (error) return <ErrorState message={errorMessage(error)} />;
  if (!incoming.length && !outgoing.length) {
    return <EmptyState icon="invite" title="Aucune demande en attente" />;
  }
  const context = (request: FriendRequest) =>
    [
      request.last_game_together ? `Rencontré(e) dans ${gameName(request.last_game_together) ?? 'une partie'}` : null,
      request.mutual_friends ? `${request.mutual_friends} ami${request.mutual_friends > 1 ? 's' : ''} en commun` : null,
    ]
      .filter(Boolean)
      .join(' · ') || `Niv. ${request.level}`;

  return (
    <View style={styles.list}>
      {incoming.map((request) => (
        <Card key={request.request_id} style={styles.requestCard}>
          <Text variant="section">Demande d’ami</Text>
          <View style={styles.requestRow}>
            <PlayerAvatar player={request} size={48} />
            <View style={styles.flex}>
              <Text variant="item">{displayNameOf(request)}</Text>
              <Text variant="caption" color={colors.textSecondary}>
                {context(request)}
              </Text>
            </View>
          </View>
          <View style={styles.requestActions}>
            <Button
              label="Ignorer"
              variant="secondary"
              size="M"
              style={styles.flex}
              onPress={() => respond.mutate({ requestId: request.request_id, accept: false })}
            />
            <Button
              label="Accepter"
              size="M"
              style={styles.flex}
              loading={respond.isPending && respond.variables?.requestId === request.request_id}
              onPress={() => respond.mutate({ requestId: request.request_id, accept: true })}
            />
          </View>
        </Card>
      ))}
      {outgoing.length ? <Text variant="section">Envoyées</Text> : null}
      {outgoing.map((request) => (
        <PlayerRow
          key={request.request_id}
          player={request}
          status="En attente"
          action={<Button label="Annuler" variant="secondary" size="S" onPress={() => cancelRequest.mutate(request.request_id)} />}
          onPress={() => router.push({ pathname: '/player/[userId]', params: { userId: request.user_id } })}
        />
      ))}
      {respond.error ? <ErrorState message={errorMessage(respond.error)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  list: { gap: 18 },
  requestCard: { gap: 14 },
  requestRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  requestActions: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
});
