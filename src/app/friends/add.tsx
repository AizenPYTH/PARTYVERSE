import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PlayerRow } from '@/components/PlayerRow';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, EmptyState, ErrorState, ListSkeleton, Screen, SectionHeader, Tag, TextField, colors } from '@/design-system';
import { useCatalog } from '@/features/games/catalog';
import type { Relationship } from '@/features/profile/api';
import { usePlayerSearch, useRecentPlayers, useSocialActions } from '@/features/social/hooks';
import { errorMessage } from '@/lib/errors';

export default function AddFriendsScreen() {
  const [query, setQuery] = useState('');
  const search = usePlayerSearch(query);
  const recent = useRecentPlayers();
  const catalog = useCatalog();
  const { sendRequest, respond } = useSocialActions();
  const searching = query.trim().length >= 2;

  const action = (userId: string, relationship: Relationship) => {
    switch (relationship) {
      case 'friend':
        return <Tag label="Ami" color={colors.mint} />;
      case 'outgoing_request':
        return <Tag label="Envoyée" color={colors.textSecondary} />;
      case 'incoming_request':
        return (
          <Button
            label="Accepter"
            size="S"
            onPress={() => router.push({ pathname: '/player/[userId]', params: { userId } })}
          />
        );
      case 'blocked':
        return <Tag label="Bloqué" color={colors.coral} />;
      default:
        return (
          <Button
            label="Ajouter"
            size="S"
            loading={sendRequest.isPending && sendRequest.variables === userId}
            onPress={() => sendRequest.mutate(userId)}
          />
        );
    }
  };

  return (
    <Screen gap={18}>
      <ScreenHeader title="Ajouter des amis" />
      <TextField
        label="Rechercher un joueur"
        value={query}
        onChangeText={setQuery}
        placeholder="Pseudo ou nom"
        autoCapitalize="none"
        autoCorrect={false}
        hint="2 caractères minimum"
        testID="friend-search"
      />
      {sendRequest.error ? <ErrorState message={errorMessage(sendRequest.error)} /> : null}
      {respond.error ? <ErrorState message={errorMessage(respond.error)} /> : null}

      {searching ? (
        <View style={styles.list}>
          {search.isFetching && !search.data ? <ListSkeleton rows={3} /> : null}
          {search.error ? <ErrorState message={errorMessage(search.error)} onRetry={() => void search.refetch()} /> : null}
          {search.data?.length === 0 ? <EmptyState title="Aucun joueur trouvé" message="Vérifie l’orthographe du pseudo." /> : null}
          {search.data?.map((player) => (
            <PlayerRow
              key={player.user_id}
              player={player}
              status={`@${player.username ?? ''}`}
              statusColor={colors.textTertiary}
              action={action(player.user_id, player.relationship)}
              onPress={() => router.push({ pathname: '/player/[userId]', params: { userId: player.user_id } })}
            />
          ))}
        </View>
      ) : (
        <View style={styles.list}>
          <SectionHeader title="Rencontrés récemment" />
          {recent.isPending ? <ListSkeleton rows={2} /> : null}
          {recent.data?.length === 0 ? (
            <EmptyState icon="games" title="Personne pour l’instant" message="Les joueurs croisés en partie apparaîtront ici." />
          ) : null}
          {recent.data?.map((player) => (
            <PlayerRow
              key={player.user_id}
              player={player}
              status={catalog.data?.find((game) => game.id === player.game_id)?.name ?? ''}
              action={action(player.user_id, player.relationship)}
              onPress={() => router.push({ pathname: '/player/[userId]', params: { userId: player.user_id } })}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ list: { gap: 16 } });
