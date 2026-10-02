import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { PlayerAvatar } from '@/components/PlayerAvatar';
import { PlayerRow } from '@/components/PlayerRow';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  ListSkeleton,
  ProgressBar,
  Screen,
  SectionHeader,
  Sheet,
  Tag,
  Text,
  colors,
  fonts,
  radii,
  spacing,
  useToast,
} from '@/design-system';
import { useCurrentUserId } from '@/features/auth/store';
import { isPlayable, useCatalog } from '@/features/games/catalog';
import { groupsApi, type GroupMember } from '@/features/groups/api';
import { useGroup, useGroupMessages } from '@/features/groups/hooks';
import { ROLE_LABELS, activityText, challengeText, daysLeft } from '@/features/groups/presentation';
import { lobbiesApi } from '@/features/lobbies/api';
import { displayNameOf, initialsFor } from '@/features/profile/avatars';
import { socialApi } from '@/features/social/api';
import { useFriends } from '@/features/social/hooks';
import { describePresence, toPresence } from '@/features/social/presence';
import { confirmAction } from '@/lib/confirm';
import { errorMessage } from '@/lib/errors';
import { queryKeys } from '@/lib/queryClient';

type SheetName = 'chat' | 'invite' | 'room' | 'member' | null;

export default function GroupScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { group, realtimeConnected } = useGroup(groupId);
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();
  const toast = useToast();
  const catalog = useCatalog();
  const [sheet, setSheet] = useState<SheetName>(null);
  const [selected, setSelected] = useState<GroupMember | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    try {
      await action();
      if (success) toast.show({ message: success, tone: 'success' });
      void queryClient.invalidateQueries({ queryKey: queryKeys.group(groupId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.groups });
    } catch (error) {
      toast.show({ message: errorMessage(error), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (group.isPending) {
    return (
      <Screen>
        <ScreenHeader title="Groupe" />
        <ListSkeleton rows={5} />
      </Screen>
    );
  }
  if (group.error || !group.data) {
    return (
      <Screen>
        <ScreenHeader title="Groupe" />
        <ErrorState message={errorMessage(group.error)} onRetry={() => void group.refetch()} />
      </Screen>
    );
  }

  const data = group.data;
  const info = data.group;
  if (data.my_role === null) {
    return (
      <Screen gap={18}>
        <ScreenHeader title={info.name} subtitle={`Groupe public · ${data.member_count} membre${data.member_count > 1 ? 's' : ''}`} />
        <Card style={styles.center}>
          <Avatar size={72} hue={info.hue} initials={initialsFor(info.name)} />
          <Text variant="body" color={colors.textSecondary} align="center">
            {info.description || 'Aucune description.'}
          </Text>
          <Button label="Rejoindre le groupe" loading={busy} onPress={() => void run(() => groupsApi.joinPublic(info.id), 'Bienvenue dans le groupe !')} />
        </Card>
      </Screen>
    );
  }

  const isAdmin = data.my_role === 'owner' || data.my_role === 'admin';
  const nameOf = (id: string) => {
    const member = data.members.find((m) => m.user_id === id);
    return member ? (member.user_id === userId ? 'Toi' : displayNameOf(member)) : 'Un ancien membre';
  };
  const gameName = (id: string) => catalog.data?.find((g) => g.id === id)?.name ?? 'un jeu';
  const challenge = data.challenge;

  const leave = async () => {
    const confirmed = await confirmAction({
      title: 'Quitter le groupe ?',
      message: data.my_role === 'owner' ? 'Le rôle de fondateur passera à un autre membre (ou le groupe sera supprimé si tu es seul).' : undefined,
      confirmLabel: 'Quitter',
      destructive: true,
    });
    if (!confirmed) return;
    await run(async () => {
      await groupsApi.leave(info.id);
      router.replace('/groups');
    });
  };

  return (
    <Screen gap={18} refreshing={group.isRefetching} onRefresh={() => void group.refetch()}>
      <ScreenHeader
        title={info.name}
        subtitle={`${info.visibility === 'private' ? 'Groupe privé' : 'Groupe public'} · ${data.member_count} membre${data.member_count > 1 ? 's' : ''}`}
        right={<Button label="Chat" size="S" variant="secondary" testID="group-chat" onPress={() => setSheet('chat')} />}
      />
      {info.description ? (
        <Text variant="body" color={colors.textSecondary}>
          {info.description}
        </Text>
      ) : null}

      <Card style={styles.challenge}>
        <View style={styles.between}>
          <Text variant="overline" color={colors.textSecondary}>
            Défi de la semaine
          </Text>
          <Text variant="caption" color={colors.textSecondary}>
            {challenge.completed_at ? 'Réussi !' : `${daysLeft(challenge.week_start)} j restants`}
          </Text>
        </View>
        <Text variant="item">{challengeText(challenge)}</Text>
        <ProgressBar
          progress={challenge.progress / challenge.target}
          color={challenge.completed_at ? colors.mint : colors.violet}
          accessibilityLabel={`${challenge.progress} sur ${challenge.target}`}
        />
        <Text variant="caption" color={colors.textSecondary}>{`${challenge.progress}/${challenge.target} · +50 XP pour chaque membre`}</Text>
      </Card>

      <View style={styles.actions}>
        <Button label="Créer un salon" icon="play" style={styles.flex} testID="group-room" onPress={() => setSheet('room')} />
        {isAdmin ? <Button label="Inviter" variant="secondary" icon="invite" style={styles.flex} onPress={() => setSheet('invite')} /> : null}
      </View>

      <View style={styles.section}>
        <SectionHeader title="Classement de la semaine" />
        {data.members.map((member, index) => (
          <PlayerRow
            key={member.user_id}
            player={member}
            presence={toPresence(member.presence)}
            status={`${index + 1}. ${member.week_wins} victoire${member.week_wins > 1 ? 's' : ''} · ${member.week_matches} partie${member.week_matches > 1 ? 's' : ''} · ${describePresence(toPresence(member.presence)).short}`}
            onPress={() => {
              setSelected(member);
              setSheet('member');
            }}
            action={member.role !== 'member' ? <Tag label={ROLE_LABELS[member.role]} color={colors.violetText} /> : undefined}
          />
        ))}
      </View>

      {isAdmin && data.pending_invitations.length ? (
        <Text variant="caption" color={colors.textSecondary}>
          {`Invitations en attente : ${data.pending_invitations.map((i) => displayNameOf(i)).join(', ')}`}
        </Text>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title="Activité" />
        {data.activity.length === 0 ? (
          <Text variant="caption" color={colors.textSecondary}>
            Rien pour l’instant.
          </Text>
        ) : (
          data.activity.map((entry) => (
            <Text key={entry.id} variant="caption" color={colors.textSecondary}>
              {`• ${activityText(entry, nameOf, gameName)}`}
            </Text>
          ))
        )}
      </View>

      <Button label="Quitter le groupe" variant="destructive" icon="logout" onPress={() => void leave()} />

      <GroupChatSheet groupId={info.id} visible={sheet === 'chat'} poll={!realtimeConnected} onClose={() => setSheet(null)} />
      <InviteSheet
        visible={sheet === 'invite'}
        onClose={() => setSheet(null)}
        memberIds={data.members.map((m) => m.user_id)}
        pendingIds={data.pending_invitations.map((i) => i.invitee_id)}
        onInvite={(id) => void run(() => groupsApi.invite(info.id, id), 'Invitation envoyée')}
      />
      <Sheet visible={sheet === 'room'} onClose={() => setSheet(null)} title="Salon du groupe">
        <Text variant="caption" color={colors.textSecondary}>
          Choisis un jeu : un salon privé est créé et tous les membres reçoivent une invitation.
        </Text>
        <ScrollView style={styles.games} contentContainerStyle={styles.gameList}>
          {(catalog.data ?? []).filter(isPlayable).map((game) => (
            <Button
              key={game.id}
              label={`${game.name} · ${game.min_players === game.max_players ? game.min_players : `${game.min_players}–${game.max_players}`} joueurs`}
              variant="secondary"
              loading={busy}
              onPress={() =>
                void run(async () => {
                  const lobby = await lobbiesApi.create({
                    gameId: game.id,
                    visibility: 'private',
                    maxPlayers: Math.min(game.max_players, Math.max(game.min_players, data.member_count)),
                    allowSpectators: true,
                    autoStart: false,
                    settings: {},
                  });
                  const invited = await groupsApi.inviteToLobby(info.id, lobby.id);
                  setSheet(null);
                  toast.show({ message: `${invited} membre${invited > 1 ? 's' : ''} invité${invited > 1 ? 's' : ''}`, tone: 'success' });
                  router.push({ pathname: '/lobby/[lobbyId]', params: { lobbyId: lobby.id } });
                })
              }
            />
          ))}
        </ScrollView>
      </Sheet>
      <Sheet visible={sheet === 'member' && !!selected} onClose={() => setSheet(null)} title={selected ? displayNameOf(selected) : ''}>
        {selected ? (
          <View style={styles.memberActions}>
            <Button label="Voir le profil" variant="secondary" onPress={() => {
              setSheet(null);
              router.push({ pathname: '/player/[userId]', params: { userId: selected.user_id } });
            }} />
            {selected.user_id !== userId ? (
              <Button label="Envoyer un message" variant="secondary" icon="messages" onPress={() => {
                setSheet(null);
                router.push({ pathname: '/messages/[userId]', params: { userId: selected.user_id } });
              }} />
            ) : null}
            {data.my_role === 'owner' && selected.user_id !== userId ? (
              <>
                <Button
                  label={selected.role === 'admin' ? 'Retirer le rôle admin' : 'Nommer admin'}
                  variant="secondary"
                  onPress={() => void run(() => groupsApi.setRole(info.id, selected.user_id, selected.role === 'admin' ? 'member' : 'admin')).then(() => setSheet(null))}
                />
                <Button
                  label="Transférer la fondation"
                  variant="secondary"
                  onPress={() =>
                    void confirmAction({ title: `Faire de ${displayNameOf(selected)} le fondateur ?`, message: 'Tu deviendras admin.', confirmLabel: 'Transférer' }).then(
                      async (ok) => {
                        if (ok) await run(() => groupsApi.setRole(info.id, selected.user_id, 'owner'));
                        setSheet(null);
                      },
                    )
                  }
                />
              </>
            ) : null}
            {isAdmin && selected.user_id !== userId && selected.role !== 'owner' && (data.my_role === 'owner' || selected.role === 'member') ? (
              <Button
                label="Retirer du groupe"
                variant="destructive"
                onPress={() =>
                  void confirmAction({ title: `Retirer ${displayNameOf(selected)} ?`, confirmLabel: 'Retirer', destructive: true }).then(
                    async (ok) => {
                      if (ok) await run(() => groupsApi.kick(info.id, selected.user_id));
                      setSheet(null);
                    },
                  )
                }
              />
            ) : null}
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function InviteSheet({
  visible,
  onClose,
  memberIds,
  pendingIds,
  onInvite,
}: {
  visible: boolean;
  onClose: () => void;
  memberIds: string[];
  pendingIds: string[];
  onInvite: (userId: string) => void;
}) {
  const friends = useFriends();
  const candidates = (friends.data ?? []).filter((f) => !memberIds.includes(f.user_id));
  return (
    <Sheet visible={visible} onClose={onClose} title="Inviter des amis">
      {friends.isPending ? <ListSkeleton rows={3} /> : null}
      {friends.data && candidates.length === 0 ? <EmptyState icon="friends" title="Tous tes amis sont déjà là" /> : null}
      <ScrollView style={styles.games} contentContainerStyle={styles.gameList}>
        {candidates.map((friend) => (
          <PlayerRow
            key={friend.user_id}
            player={friend}
            action={
              pendingIds.includes(friend.user_id) ? (
                <Tag label="Invité" color={colors.textSecondary} />
              ) : (
                <Button label="Inviter" size="S" testID={`group-invite-${friend.user_id}`} onPress={() => onInvite(friend.user_id)} />
              )
            }
          />
        ))}
      </ScrollView>
    </Sheet>
  );
}

function GroupChatSheet({ groupId, visible, poll, onClose }: { groupId: string; visible: boolean; poll: boolean; onClose: () => void }) {
  const messages = useGroupMessages(groupId, visible, poll);
  const userId = useCurrentUserId();
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const ordered = [...(messages.data ?? [])].reverse();

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      await groupsApi.send(groupId, body);
      setDraft('');
      void messages.refetch();
    } catch (error) {
      toast.show({ message: errorMessage(error), tone: 'error' });
    } finally {
      setSending(false);
    }
  };

  const report = async (senderId: string | null) => {
    if (!senderId || senderId === userId) return;
    const confirmed = await confirmAction({ title: 'Signaler ce joueur ?', message: 'Ses derniers messages du groupe seront joints.', confirmLabel: 'Signaler', destructive: true });
    if (!confirmed) return;
    socialApi
      .report({ userId: senderId, context: 'group_chat', reason: 'harassment', contextRef: groupId })
      .then(() => toast.show({ message: 'Signalement envoyé. Merci !', tone: 'success' }))
      .catch((error: unknown) => toast.show({ message: errorMessage(error), tone: 'error' }));
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Chat du groupe">
      {messages.error ? <ErrorState message={errorMessage(messages.error)} onRetry={() => void messages.refetch()} /> : null}
      <ScrollView style={styles.chat} contentContainerStyle={styles.gameList}>
        {messages.data && ordered.length === 0 ? <EmptyState icon="messages" title="Pas encore de message" /> : null}
        {ordered.map((message) => (
          <View key={message.id} style={styles.message}>
            <PlayerAvatar player={message} size={28} />
            <Text variant="caption" style={styles.flex} onLongPress={() => void report(message.sender_id)}>
              <Text variant="captionBold">{message.sender_id === userId ? 'Toi' : displayNameOf(message)}</Text>
              {`  ${message.body}`}
            </Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Écrire au groupe…"
          placeholderTextColor={colors.textTertiary}
          maxLength={500}
          style={styles.input}
          accessibilityLabel="Message au groupe"
          testID="group-chat-input"
          onSubmitEditing={() => void send()}
          returnKeyType="send"
        />
        <Button label="Envoyer" size="M" testID="group-chat-send" onPress={() => void send()} loading={sending} disabled={!draft.trim()} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: spacing.md },
  challenge: { gap: spacing.sm },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  section: { gap: spacing.md },
  games: { maxHeight: 360 },
  gameList: { gap: spacing.sm },
  memberActions: { gap: spacing.sm },
  chat: { maxHeight: 320 },
  message: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  composer: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    flex: 1,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingHorizontal: 14,
    fontFamily: fonts.semibold,
    fontSize: 15,
  },
});
