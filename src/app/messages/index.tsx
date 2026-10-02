import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { PlayerRow } from '@/components/PlayerRow';
import { ScreenHeader } from '@/components/ScreenHeader';
import { CountBadge, EmptyState, ErrorState, ListSkeleton, Screen, Text, colors } from '@/design-system';
import { useCurrentUserId } from '@/features/auth/store';
import { useConversations } from '@/features/messages/hooks';
import { timeLabel } from '@/features/messages/thread';
import { toPresence } from '@/features/social/presence';
import { errorMessage } from '@/lib/errors';

export default function MessagesScreen() {
  const conversations = useConversations();
  const userId = useCurrentUserId();

  return (
    <Screen gap={18} refreshing={conversations.isRefetching} onRefresh={() => void conversations.refetch()}>
      <ScreenHeader title="Messages" />
      {conversations.isPending ? <ListSkeleton rows={5} /> : null}
      {conversations.error ? <ErrorState message={errorMessage(conversations.error)} onRetry={() => void conversations.refetch()} /> : null}
      {conversations.data && conversations.data.length === 0 ? (
        <EmptyState
          icon="messages"
          title="Aucune conversation"
          message="Écris à un ami depuis son profil pour commencer."
          actionLabel="Mes amis"
          onAction={() => router.push('/friends')}
        />
      ) : null}
      <View style={styles.list}>
        {conversations.data?.map((conversation) => {
          const last = conversation.last_message;
          const preview = last ? `${last.sender_id === userId ? 'Toi : ' : ''}${last.body}` : '';
          return (
            <PlayerRow
              key={conversation.conversation_id}
              player={conversation.user}
              presence={toPresence(conversation.user.presence)}
              status={preview}
              statusColor={conversation.unread > 0 ? colors.textPrimary : colors.textSecondary}
              onPress={() => router.push({ pathname: '/messages/[userId]', params: { userId: conversation.user.id } })}
              action={
                <View style={styles.meta}>
                  {last ? (
                    <Text variant="meta" color={colors.textTertiary}>
                      {timeLabel(last.created_at)}
                    </Text>
                  ) : null}
                  <CountBadge count={conversation.unread} />
                </View>
              }
            />
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 14 },
  meta: { alignItems: 'flex-end', gap: 4 },
});
