import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { PlayerRow } from '@/components/PlayerRow';
import { Button, EmptyState, ErrorState, ListSkeleton, Sheet, useToast } from '@/design-system';
import { errorMessage } from '@/lib/errors';

import { describePresence } from '../../social/presence';
import { useFriends } from '../../social/hooks';
import { lobbiesApi } from '../api';

export function InviteFriendsSheet({
  lobbyId,
  memberIds,
  visible,
  onClose,
  onAddFriends,
}: {
  lobbyId: string;
  memberIds: string[];
  visible: boolean;
  onClose: () => void;
  onAddFriends: () => void;
}) {
  const friends = useFriends();
  const toast = useToast();
  const [invited, setInvited] = useState<string[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const candidates = (friends.data ?? []).filter((friend) => !memberIds.includes(friend.user_id));

  const invite = async (userId: string) => {
    setPending(userId);
    try {
      await lobbiesApi.invite(lobbyId, userId);
      setInvited((ids) => [...ids, userId]);
    } catch (error) {
      toast.show({ message: errorMessage(error), tone: 'error' });
    } finally {
      setPending(null);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Inviter des amis">
      {friends.isPending ? <ListSkeleton rows={3} /> : null}
      {friends.error ? <ErrorState message={errorMessage(friends.error)} onRetry={() => void friends.refetch()} /> : null}
      {friends.data && candidates.length === 0 ? (
        <EmptyState
          icon="invite"
          title="Personne à inviter"
          message="Ajoute des amis ou partage le code du salon."
          actionLabel="Ajouter des amis"
          onAction={onAddFriends}
        />
      ) : null}
      <ScrollView style={styles.list} contentContainerStyle={styles.content}>
        {candidates.map((friend) => {
          const presence = describePresence(friend.presence);
          const done = invited.includes(friend.user_id);
          return (
            <PlayerRow
              key={friend.user_id}
              player={friend}
              presence={friend.presence}
              status={presence.label}
              statusColor={presence.color}
              action={
                <Button
                  label={done ? 'Invité' : 'Inviter'}
                  size="S"
                  disabled={done}
                  loading={pending === friend.user_id}
                  onPress={() => void invite(friend.user_id)}
                />
              }
            />
          );
        })}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({ list: { maxHeight: 380 }, content: { gap: 14 } });
