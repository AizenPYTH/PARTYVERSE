import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, ErrorState, IconButton, ListSkeleton, Screen, Sheet, Text, colors, useToast } from '@/design-system';
import { useCurrentUserId } from '@/features/auth/store';
import { useLobbyNavigation } from '@/features/lobbies/useLobbyNavigation';
import type { PlayerProfile } from '@/features/profile/api';
import { displayNameOf } from '@/features/profile/avatars';
import { ProfileView } from '@/features/profile/components/ProfileView';
import { useHomeOverview, useMatchHistory, usePlayerProfile } from '@/features/profile/hooks';
import type { ReportReason } from '@/features/social/api';
import { useFriendRequests, useSocialActions } from '@/features/social/hooks';
import { confirmAction } from '@/lib/confirm';
import { errorMessage } from '@/lib/errors';

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'harassment', label: 'Harcèlement' },
  { value: 'hate', label: 'Propos haineux' },
  { value: 'inappropriate_name', label: 'Pseudo ou profil inapproprié' },
  { value: 'cheating', label: 'Triche' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Autre' },
];

export default function PlayerScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const me = useCurrentUserId();
  const profile = usePlayerProfile(userId);
  const history = useMatchHistory(userId, !!profile.data?.stats_visible);
  const [sheet, setSheet] = useState<'more' | 'report' | null>(null);

  useEffect(() => {
    if (userId === me) router.replace('/profile');
  }, [userId, me]);

  return (
    <Screen refreshing={profile.isRefetching} onRefresh={() => void profile.refetch()}>
      <ScreenHeader
        title={profile.data ? displayNameOf(profile.data.profile) : 'Profil'}
        right={profile.data ? <IconButton icon="menu" accessibilityLabel="Plus d’options" onPress={() => setSheet('more')} /> : undefined}
      />
      {profile.isPending ? <ListSkeleton rows={4} /> : null}
      {profile.error ? <ErrorState message={errorMessage(profile.error)} onRetry={() => void profile.refetch()} /> : null}
      {profile.data ? (
        <ProfileView data={profile.data} history={history.data} actions={<RelationshipActions data={profile.data} />} />
      ) : null}
      {profile.data ? (
        <MoreSheets data={profile.data} sheet={sheet} onSheet={setSheet} />
      ) : null}
    </Screen>
  );
}

function RelationshipActions({ data }: { data: PlayerProfile }) {
  const { sendRequest, respond, cancelRequest, removeFriend, unblock } = useSocialActions();
  const requests = useFriendRequests();
  const overview = useHomeOverview();
  const lobbyNav = useLobbyNavigation();
  const userId = data.profile.id;
  const request = requests.data?.find((item) => item.user_id === userId);
  const error = sendRequest.error ?? respond.error ?? cancelRequest.error ?? removeFriend.error ?? unblock.error;
  const myLobby = overview.data?.active_lobby?.status !== 'in_progress' ? overview.data?.active_lobby?.lobby_id : null;

  const content = (() => {
    switch (data.relationship) {
      case 'friend':
        return (
          <View style={styles.row}>
            <Button
              label="Inviter à jouer"
              style={styles.flex2}
              loading={lobbyNav.pending === `invite-friend:${userId}`}
              onPress={() => void lobbyNav.inviteFriend(userId, myLobby)}
            />
            <Button
              label="Message"
              variant="secondary"
              icon="messages"
              style={styles.flex1}
              testID="player-message"
              onPress={() => router.push({ pathname: '/messages/[userId]', params: { userId } })}
            />
            <Button
              label="Retirer"
              variant="secondary"
              style={styles.flex1}
              onPress={() =>
                void confirmAction({ title: 'Retirer cet ami ?', confirmLabel: 'Retirer', destructive: true }).then(
                  (confirmed) => confirmed && removeFriend.mutate(userId),
                )
              }
            />
          </View>
        );
      case 'incoming_request':
        return request ? (
          <View style={styles.row}>
            <Button label="Ignorer" variant="secondary" style={styles.flex1} onPress={() => respond.mutate({ requestId: request.request_id, accept: false })} />
            <Button label="Accepter" style={styles.flex1} loading={respond.isPending} onPress={() => respond.mutate({ requestId: request.request_id, accept: true })} />
          </View>
        ) : null;
      case 'outgoing_request':
        return request ? (
          <Button label="Annuler la demande" variant="secondary" onPress={() => cancelRequest.mutate(request.request_id)} />
        ) : null;
      case 'blocked':
        return <Button label="Débloquer" variant="secondary" onPress={() => unblock.mutate(userId)} />;
      case 'none':
        return <Button label="Ajouter en ami" icon="invite" loading={sendRequest.isPending} onPress={() => sendRequest.mutate(userId)} />;
      case 'self':
        return null;
    }
  })();

  return (
    <View style={styles.actions}>
      {data.mutual_friends ? (
        <Text variant="caption" color={colors.textSecondary} align="center">
          {`${data.mutual_friends} ami${data.mutual_friends > 1 ? 's' : ''} en commun`}
        </Text>
      ) : null}
      {content}
      {error ? <ErrorState message={errorMessage(error)} /> : null}
    </View>
  );
}

function MoreSheets({ data, sheet, onSheet }: { data: PlayerProfile; sheet: 'more' | 'report' | null; onSheet: (sheet: 'more' | 'report' | null) => void }) {
  const toast = useToast();
  const { block, report } = useSocialActions();
  const name = displayNameOf(data.profile);
  return (
    <>
      <Sheet visible={sheet === 'more'} onClose={() => onSheet(null)} title={name}>
        <Button label="Signaler" variant="secondary" icon="flag" onPress={() => onSheet('report')} />
        {data.relationship !== 'blocked' ? (
          <Button
            label="Bloquer"
            variant="destructive"
            icon="block"
            onPress={() =>
              void confirmAction({
                title: `Bloquer ${name} ?`,
                message: 'Vous ne pourrez plus vous inviter, vous écrire ou jouer dans le même salon.',
                confirmLabel: 'Bloquer',
                destructive: true,
              }).then(
                (confirmed) =>
                  confirmed &&
                  block.mutate(data.profile.id, {
                    onSuccess: () => {
                      onSheet(null);
                      toast.show({ message: `${name} est bloqué`, tone: 'success' });
                    },
                    onError: (error) => toast.show({ message: errorMessage(error), tone: 'error' }),
                  }),
              )
            }
          />
        ) : null}
      </Sheet>
      <Sheet visible={sheet === 'report'} onClose={() => onSheet(null)} title={`Signaler ${name}`}>
        <Text variant="caption" color={colors.textSecondary}>
          Les signalements sont examinés par la modération. Le joueur n’est pas prévenu.
        </Text>
        {REPORT_REASONS.map((reason) => (
          <Button
            key={reason.value}
            label={reason.label}
            variant="secondary"
            size="M"
            loading={report.isPending && report.variables?.reason === reason.value}
            onPress={() =>
              report.mutate(
                { userId: data.profile.id, context: 'profile', reason: reason.value },
                {
                  onSuccess: () => {
                    onSheet(null);
                    toast.show({ message: 'Signalement envoyé. Merci !', tone: 'success' });
                  },
                  onError: (error) => toast.show({ message: errorMessage(error), tone: 'error' }),
                },
              )
            }
          />
        ))}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
});
