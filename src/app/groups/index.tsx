import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PlayerAvatar } from '@/components/PlayerAvatar';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  ListSkeleton,
  PressableScale,
  Screen,
  SectionHeader,
  Sheet,
  Tag,
  Text,
  TextField,
  colors,
  spacing,
  useToast,
} from '@/design-system';
import { groupsApi, type MyGroup } from '@/features/groups/api';
import { useMyGroups } from '@/features/groups/hooks';
import { ROLE_LABELS } from '@/features/groups/presentation';
import { displayNameOf, initialsFor } from '@/features/profile/avatars';
import { errorMessage } from '@/lib/errors';
import { queryKeys } from '@/lib/queryClient';

function GroupRow({ group }: { group: MyGroup }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${group.name}, ${group.members} membres, ${group.online} en ligne`}
      onPress={() => router.push({ pathname: '/groups/[groupId]', params: { groupId: group.id } })}
      style={styles.row}
    >
      <Avatar size={48} hue={group.hue} initials={initialsFor(group.name)} />
      <View style={styles.flex}>
        <Text variant="item" numberOfLines={1}>
          {group.name}
        </Text>
        <Text variant="caption" color={colors.textSecondary}>
          {`${group.members} membre${group.members > 1 ? 's' : ''} · ${group.online} en ligne`}
        </Text>
      </View>
      {group.role !== 'member' ? <Tag label={ROLE_LABELS[group.role]} color={colors.violetText} /> : null}
    </PressableScale>
  );
}

export default function GroupsScreen() {
  const { groups, invitations } = useMyGroups();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Awaited<ReturnType<typeof groupsApi.search>> | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      void queryClient.invalidateQueries({ queryKey: queryKeys.groups });
      void queryClient.invalidateQueries({ queryKey: queryKeys.groupInvitations });
    } catch (error) {
      toast.show({ message: errorMessage(error), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    run(async () => {
      const id = await groupsApi.create(name, description, visibility);
      setCreating(false);
      setName('');
      setDescription('');
      router.push({ pathname: '/groups/[groupId]', params: { groupId: id } });
    });

  return (
    <Screen
      gap={18}
      refreshing={groups.isRefetching}
      onRefresh={() => {
        void groups.refetch();
        void invitations.refetch();
      }}
    >
      <ScreenHeader title="Groupes" right={<Button label="Créer" size="S" testID="group-create" onPress={() => setCreating(true)} />} />

      {invitations.data?.length ? (
        <View style={styles.section}>
          <SectionHeader title="Invitations" />
          {invitations.data.map((invitation) => (
            <Card key={invitation.id} style={styles.invitation}>
              <PlayerAvatar player={invitation.inviter} size={36} />
              <Text variant="itemSm" style={styles.flex}>
                {`${displayNameOf(invitation.inviter)} t’invite dans « ${invitation.group_name} »`}
              </Text>
              <Button label="Refuser" size="S" variant="secondary" onPress={() => void run(() => groupsApi.respond(invitation.id, false))} />
              <Button
                label="Rejoindre"
                size="S"
                testID={`group-accept-${invitation.group_id}`}
                onPress={() =>
                  void run(async () => {
                    await groupsApi.respond(invitation.id, true);
                    router.push({ pathname: '/groups/[groupId]', params: { groupId: invitation.group_id } });
                  })
                }
              />
            </Card>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title="Mes groupes" />
        {groups.isPending ? <ListSkeleton rows={3} /> : null}
        {groups.error ? <ErrorState message={errorMessage(groups.error)} onRetry={() => void groups.refetch()} /> : null}
        {groups.data && groups.data.length === 0 ? (
          <EmptyState
            icon="friends"
            title="Pas encore de groupe"
            message="Crée un groupe pour ta bande : chat, classement interne et défis de la semaine."
            actionLabel="Créer un groupe"
            onAction={() => setCreating(true)}
          />
        ) : null}
        {groups.data?.map((group) => <GroupRow key={group.id} group={group} />)}
      </View>

      <View style={styles.section}>
        <SectionHeader title="Groupes publics" />
        <View style={styles.searchRow}>
          <View style={styles.flex}>
            <TextField label="Rechercher" value={search} onChangeText={setSearch} placeholder="Nom du groupe" returnKeyType="search"
              onSubmitEditing={() => void run(async () => setResults(await groupsApi.search(search)))} />
          </View>
          <Button label="Chercher" size="M" variant="secondary" onPress={() => void run(async () => setResults(await groupsApi.search(search)))} />
        </View>
        {results && results.length === 0 ? (
          <Text variant="caption" color={colors.textSecondary}>
            Aucun groupe public trouvé.
          </Text>
        ) : null}
        {results?.map((group) => (
          <View key={group.id} style={styles.row}>
            <Avatar size={40} hue={group.hue} initials={initialsFor(group.name)} />
            <View style={styles.flex}>
              <Text variant="itemSm">{group.name}</Text>
              <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
                {`${group.members} membres${group.description ? ` · ${group.description}` : ''}`}
              </Text>
            </View>
            {group.is_member ? (
              <Button label="Ouvrir" size="S" variant="secondary" onPress={() => router.push({ pathname: '/groups/[groupId]', params: { groupId: group.id } })} />
            ) : (
              <Button
                label="Rejoindre"
                size="S"
                onPress={() =>
                  void run(async () => {
                    await groupsApi.joinPublic(group.id);
                    router.push({ pathname: '/groups/[groupId]', params: { groupId: group.id } });
                  })
                }
              />
            )}
          </View>
        ))}
      </View>

      <Sheet visible={creating} onClose={() => setCreating(false)} title="Nouveau groupe">
        <TextField label="Nom" value={name} onChangeText={setName} maxLength={40} hint="3 à 40 caractères" testID="group-name" />
        <TextField label="Description" value={description} onChangeText={setDescription} maxLength={200} hint="Facultatif" />
        <View style={styles.searchRow}>
          <Button label="Privé" size="S" variant={visibility === 'private' ? 'primary' : 'secondary'} onPress={() => setVisibility('private')} />
          <Button label="Public" size="S" variant={visibility === 'public' ? 'primary' : 'secondary'} onPress={() => setVisibility('public')} />
        </View>
        <Text variant="caption" color={colors.textSecondary}>
          {visibility === 'private' ? 'Sur invitation uniquement.' : 'Visible dans la recherche, ouvert à tous.'}
        </Text>
        <Button label="Créer le groupe" testID="group-create-confirm" loading={busy} disabled={name.trim().length < 3} onPress={() => void create()} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  invitation: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
});
