import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';

import { PlayerRow } from '@/components/PlayerRow';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  Button,
  Card,
  ErrorState,
  ListSkeleton,
  Screen,
  SectionHeader,
  SegmentedControl,
  Text,
  colors,
  useToast,
} from '@/design-system';
import { authService } from '@/features/auth/service';
import type { UserSettings } from '@/features/profile/api';
import { useSettings, useUpdateSettings } from '@/features/profile/hooks';
import { socialApi, type PresenceStatus } from '@/features/social/api';
import { useBlockedUsers, useSocialActions } from '@/features/social/hooks';
import { errorMessage } from '@/lib/errors';
import { queryKeys } from '@/lib/queryClient';

const NOTIFICATION_TYPES: { key: string; label: string }[] = [
  { key: 'lobby_invite', label: 'Invitations à jouer' },
  { key: 'friend_request', label: 'Demandes d’ami' },
  { key: 'friend_accepted', label: 'Demandes acceptées' },
  { key: 'level_up', label: 'Niveaux et récompenses' },
];

export default function SettingsScreen() {
  const settings = useSettings();
  const update = useUpdateSettings();
  const toast = useToast();
  const queryClient = useQueryClient();
  const presence = useQuery({ queryKey: queryKeys.presenceStatus, queryFn: socialApi.myPresenceStatus });

  const patch = (value: Partial<Omit<UserSettings, 'user_id'>>) =>
    update.mutate(value, { onError: (error) => toast.show({ message: errorMessage(error), tone: 'error' }) });

  const setPresence = (status: PresenceStatus) =>
    socialApi
      .heartbeat(status)
      .then(() => {
        void presence.refetch();
        void queryClient.invalidateQueries({ queryKey: queryKeys.friends });
      })
      .catch((error: unknown) => toast.show({ message: errorMessage(error), tone: 'error' }));

  const confirmDelete = () =>
    Alert.alert(
      'Supprimer ton compte ?',
      'Ton profil, tes amis, ton inventaire et tes messages seront supprimés définitivement. Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => authService.deleteAccount().catch((error: unknown) => toast.show({ message: errorMessage(error), tone: 'error' })),
        },
      ],
    );

  const data = settings.data;
  return (
    <Screen gap={22}>
      <ScreenHeader title="Paramètres" />
      {settings.isPending ? <ListSkeleton rows={4} /> : null}
      {settings.error ? <ErrorState message={errorMessage(settings.error)} onRetry={() => void settings.refetch()} /> : null}

      <View style={styles.section}>
        <SectionHeader title="Statut" />
        <SegmentedControl<PresenceStatus>
          segments={[
            { value: 'online', label: 'En ligne' },
            { value: 'away', label: 'Absent' },
            { value: 'dnd', label: 'Occupé' },
            { value: 'invisible', label: 'Invisible' },
          ]}
          value={presence.data ?? 'online'}
          onChange={(value) => void setPresence(value)}
        />
        <Text variant="caption" color={colors.textTertiary}>
          Invisible : tes amis te voient hors ligne, mais tu peux toujours jouer.
        </Text>
      </View>

      {data ? (
        <>
          <View style={styles.section}>
            <SectionHeader title="Confidentialité" />
            <Option label="Statistiques et historique visibles par">
              <SegmentedControl
                segments={[
                  { value: 'public', label: 'Tout le monde' },
                  { value: 'friends', label: 'Mes amis' },
                ]}
                value={data.profile_visibility}
                onChange={(value) => patch({ profile_visibility: value })}
              />
            </Option>
            <Option label="Demandes d’ami">
              <SegmentedControl
                segments={[
                  { value: 'everyone', label: 'Tous' },
                  { value: 'friends_of_friends', label: 'Amis d’amis' },
                  { value: 'nobody', label: 'Personne' },
                ]}
                value={data.friend_requests_from}
                onChange={(value) => patch({ friend_requests_from: value })}
              />
            </Option>
            <Option label="Invitations à jouer">
              <SegmentedControl
                segments={[
                  { value: 'friends', label: 'Mes amis' },
                  { value: 'nobody', label: 'Personne' },
                ]}
                value={data.invites_from}
                onChange={(value) => patch({ invites_from: value })}
              />
            </Option>
            <Toggle
              label="Mes amis peuvent rejoindre mes salons"
              value={data.allow_join_from_friends}
              onChange={(value) => patch({ allow_join_from_friends: value })}
            />
            <Toggle label="Afficher ma présence" value={data.show_presence} onChange={(value) => patch({ show_presence: value })} />
          </View>

          <View style={styles.section}>
            <SectionHeader title="Notifications" />
            {NOTIFICATION_TYPES.map((type) => (
              <Toggle
                key={type.key}
                label={type.label}
                value={data.notification_prefs[type.key] !== false}
                onChange={(value) => patch({ notification_prefs: { ...data.notification_prefs, [type.key]: value } })}
              />
            ))}
            <Text variant="caption" color={colors.textTertiary}>
              Notifications dans l’application. Les notifications push arriveront dans une prochaine version.
            </Text>
          </View>
        </>
      ) : null}

      <BlockedUsers />

      <View style={styles.section}>
        <SectionHeader title="Compte" />
        <Button label="Se déconnecter" variant="secondary" icon="logout" onPress={() => void authService.signOut().catch(() => undefined)} />
        <Button
          label="Déconnecter tous mes appareils"
          variant="secondary"
          onPress={() =>
            authService.signOutEverywhere().catch((error: unknown) => toast.show({ message: errorMessage(error), tone: 'error' }))
          }
        />
        <Button label="Supprimer mon compte" variant="destructive" onPress={confirmDelete} />
      </View>
    </Screen>
  );
}

function Option({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.option}>
      <Text variant="caption" color={colors.textSecondary}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <Text variant="itemSm" style={styles.flex}>
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ false: colors.border, true: colors.violet }}
        thumbColor={colors.textPrimary}
      />
    </View>
  );
}

function BlockedUsers() {
  const blocked = useBlockedUsers();
  const { unblock } = useSocialActions();
  if (!blocked.data?.length) return null;
  return (
    <View style={styles.section}>
      <SectionHeader title="Joueurs bloqués" />
      <Card style={styles.blocked}>
        {blocked.data.map((user) => (
          <PlayerRow
            key={user.user_id}
            player={user}
            action={<Button label="Débloquer" variant="secondary" size="S" onPress={() => unblock.mutate(user.user_id)} />}
          />
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  option: { gap: 8 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  flex: { flex: 1 },
  blocked: { gap: 14 },
});
