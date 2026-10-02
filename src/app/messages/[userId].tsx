import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlayerAvatar } from '@/components/PlayerAvatar';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, EmptyState, ErrorState, ListSkeleton, Text, colors, fonts, radii, spacing, useToast } from '@/design-system';
import { useCurrentUserId } from '@/features/auth/store';
import { messagesApi } from '@/features/messages/api';
import { useSendMessage, useThread } from '@/features/messages/hooks';
import { BLOCK_REASON_TEXT, dayLabel, groupMessages, timeLabel } from '@/features/messages/thread';
import { displayNameOf } from '@/features/profile/avatars';
import { socialApi } from '@/features/social/api';
import { describePresence, toPresence } from '@/features/social/presence';
import { confirmAction } from '@/lib/confirm';
import { errorMessage } from '@/lib/errors';
import { queryKeys } from '@/lib/queryClient';

export default function ThreadScreen() {
  const { userId: otherId } = useLocalSearchParams<{ userId: string }>();
  const me = useCurrentUserId();
  const { thread } = useThread(otherId);
  const send = useSendMessage(otherId);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const scroll = useRef<ScrollView>(null);
  const data = thread.data;
  const newest = data?.messages[0];

  // Reading the thread marks it read (server-side unread counters and notifications).
  useEffect(() => {
    if (!data?.conversation_id || !newest || newest.sender_id === me) return;
    messagesApi
      .markRead(data.conversation_id)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.unreadMessages });
        void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
        void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
      })
      .catch(() => undefined);
  }, [data?.conversation_id, newest?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    send.mutate(body, {
      onSuccess: () => setDraft(''),
      onError: (error) => toast.show({ message: errorMessage(error), tone: 'error' }),
    });
  };

  const report = async () => {
    if (!data) return;
    const confirmed = await confirmAction({
      title: `Signaler ${displayNameOf(data.user)} ?`,
      message: 'Ses derniers messages seront joints au signalement.',
      confirmLabel: 'Signaler',
      destructive: true,
    });
    if (!confirmed) return;
    socialApi
      .report({ userId: data.user.id, context: 'direct_message', reason: 'harassment' })
      .then(() => toast.show({ message: 'Signalement envoyé. Merci !', tone: 'success' }))
      .catch((error: unknown) => toast.show({ message: errorMessage(error), tone: 'error' }));
  };

  if (thread.isPending) {
    return (
      <SafeAreaView style={styles.root}>
        <ScreenHeader title="Messages" />
        <ListSkeleton rows={6} />
      </SafeAreaView>
    );
  }
  if (thread.error || !data) {
    return (
      <SafeAreaView style={styles.root}>
        <ScreenHeader title="Messages" />
        <ErrorState message={errorMessage(thread.error)} onRetry={() => void thread.refetch()} />
      </SafeAreaView>
    );
  }

  const groups = groupMessages(data.messages, me);
  const presence = describePresence(toPresence(data.user.presence));
  const seen = data.other_read_at && newest && newest.sender_id === me && data.other_read_at >= newest.created_at;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <ScreenHeader
            title={displayNameOf(data.user)}
            subtitle={presence.label}
            right={<Button label="Signaler" variant="ghost" size="S" onPress={() => void report()} />}
          />
        </View>
        <ScrollView
          ref={scroll}
          style={styles.flex}
          contentContainerStyle={styles.messages}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
          keyboardShouldPersistTaps="handled"
        >
          {groups.length === 0 ? (
            <EmptyState icon="messages" title="Démarre la conversation" message={`Dis bonjour à ${displayNameOf(data.user)} !`} />
          ) : null}
          {groups.map((group) => (
            <View key={group.key} style={styles.group}>
              {group.day ? (
                <Text variant="meta" color={colors.textTertiary} align="center" style={styles.day}>
                  {dayLabel(group.day)}
                </Text>
              ) : null}
              <View style={[styles.groupRow, group.mine && styles.groupRowMine]}>
                {!group.mine ? (
                  <Pressable onPress={() => router.push({ pathname: '/player/[userId]', params: { userId: data.user.id } })} accessibilityLabel="Voir le profil">
                    <PlayerAvatar player={data.user} size={28} />
                  </Pressable>
                ) : null}
                <View style={[styles.bubbles, group.mine && styles.bubblesMine]}>
                  {group.messages.map((message) => (
                    <View key={message.id} style={[styles.bubble, group.mine ? styles.mine : styles.theirs]}>
                      <Text variant="body" color={group.mine ? colors.white : colors.textPrimary}>
                        {message.body}
                      </Text>
                      <Text variant="meta" color={group.mine ? colors.violetText : colors.textTertiary} align="right">
                        {timeLabel(message.created_at)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          ))}
          {seen ? (
            <Text variant="meta" color={colors.textTertiary} align="right">
              Vu
            </Text>
          ) : null}
        </ScrollView>
        {data.blocked_reason ? (
          <Text variant="caption" color={colors.textSecondary} align="center" style={styles.blocked}>
            {BLOCK_REASON_TEXT[data.blocked_reason] ?? 'Tu ne peux pas écrire à ce joueur.'}
          </Text>
        ) : (
          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Écrire un message…"
              placeholderTextColor={colors.textTertiary}
              maxLength={1000}
              multiline
              style={styles.input}
              accessibilityLabel="Message"
              testID="dm-input"
            />
            <Button label="Envoyer" size="M" testID="dm-send" onPress={submit} loading={send.isPending} disabled={!draft.trim()} />
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.midnight },
  flex: { flex: 1 },
  header: { paddingHorizontal: spacing.screen, paddingTop: spacing.sm },
  messages: { padding: spacing.screen, gap: spacing.sm },
  group: { gap: 4 },
  day: { paddingVertical: spacing.sm },
  groupRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  groupRowMine: { justifyContent: 'flex-end' },
  bubbles: { gap: 3, maxWidth: '80%', alignItems: 'flex-start' },
  bubblesMine: { alignItems: 'flex-end' },
  bubble: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.lg, gap: 2 },
  mine: { backgroundColor: colors.violet },
  theirs: { backgroundColor: colors.elevated },
  blocked: { padding: spacing.lg },
  composer: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end', padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: fonts.semibold,
    fontSize: 15,
  },
});
