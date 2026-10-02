import { useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Button, Chip, EmptyState, ErrorState, Sheet, Text, colors, fonts, useToast } from '@/design-system';
import { errorMessage } from '@/lib/errors';

import { useCurrentUserId } from '../../auth/store';
import { displayNameOf } from '../../profile/avatars';
import { socialApi } from '../../social/api';
import { QUICK_MESSAGES, lobbiesApi, type LobbyMessage, type QuickMessageId } from '../api';
import { useLobbyMessages } from '../hooks';
import { messageText } from '../systemMessages';

export function LobbyChatSheet({ lobbyId, visible, onClose }: { lobbyId: string; visible: boolean; onClose: () => void }) {
  const messages = useLobbyMessages(lobbyId, visible);
  const userId = useCurrentUserId();
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const send = async (body: string, kind: 'text' | 'quick') => {
    if (!body.trim()) return;
    setSending(true);
    try {
      await lobbiesApi.sendMessage(lobbyId, body, kind);
      if (kind === 'text') setDraft('');
      void messages.refetch();
    } catch (error) {
      toast.show({ message: errorMessage(error), tone: 'error' });
    } finally {
      setSending(false);
    }
  };

  const report = (message: LobbyMessage) => {
    if (!message.sender_id || message.sender_id === userId) return;
    Alert.alert('Signaler ce message ?', 'Les derniers messages de ce joueur seront joints au signalement.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Signaler',
        style: 'destructive',
        onPress: () =>
          socialApi
            .report({ userId: message.sender_id!, context: 'lobby_chat', reason: 'harassment', contextRef: lobbyId })
            .then(() => toast.show({ message: 'Signalement envoyé. Merci !', tone: 'success' }))
            .catch((error: unknown) => toast.show({ message: errorMessage(error), tone: 'error' })),
      },
    ]);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Chat du salon">
      {messages.error ? <ErrorState message={errorMessage(messages.error)} onRetry={() => void messages.refetch()} /> : null}
      <FlatList
        data={messages.data ?? []}
        keyExtractor={(item) => item.id}
        style={styles.list}
        inverted={false}
        ListEmptyComponent={messages.isPending ? null : <EmptyState icon="messages" title="Pas encore de message" />}
        renderItem={({ item }) =>
          item.kind === 'system' ? (
            <Text variant="meta" color={colors.textTertiary} align="center" style={styles.system}>
              {messageText(item)}
            </Text>
          ) : (
            <Pressable onLongPress={() => report(item)} accessibilityHint="Appui long pour signaler" style={styles.message}>
              <PlayerAvatar
                player={{ avatar_id: item.sender_avatar_id, display_name: item.sender_display_name, username: item.sender_username }}
                size={28}
              />
              <Text variant="caption" style={styles.flex}>
                <Text variant="captionBold">
                  {displayNameOf({ display_name: item.sender_display_name, username: item.sender_username })}
                </Text>
                {`  ${messageText(item)}`}
              </Text>
            </Pressable>
          )
        }
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quick} keyboardShouldPersistTaps="handled">
        {(Object.keys(QUICK_MESSAGES) as QuickMessageId[]).map((id) => (
          <Chip key={id} label={QUICK_MESSAGES[id]} active={false} onPress={() => void send(id, 'quick')} />
        ))}
      </ScrollView>
      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Écrire un message…"
          placeholderTextColor={colors.textTertiary}
          maxLength={300}
          style={styles.input}
          accessibilityLabel="Message"
          onSubmitEditing={() => void send(draft, 'text')}
          returnKeyType="send"
        />
        <Button label="Envoyer" size="M" onPress={() => void send(draft, 'text')} loading={sending} disabled={!draft.trim()} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { maxHeight: 320 },
  system: { paddingVertical: 6 },
  message: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  flex: { flex: 1 },
  quick: { gap: 8 },
  composer: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingHorizontal: 14,
    fontFamily: fonts.semibold,
    fontSize: 14,
  },
});
