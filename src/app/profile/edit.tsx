import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PlayerAvatar } from '@/components/PlayerAvatar';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  Button,
  Chip,
  ErrorState,
  ListSkeleton,
  PressableScale,
  Screen,
  SectionHeader,
  Text,
  TextField,
  colors,
  useToast,
} from '@/design-system';
import { useCurrentUserId } from '@/features/auth/store';
import { useCatalog } from '@/features/games/catalog';
import { ownsCosmetic, type Cosmetic, type PlayerProfile } from '@/features/profile/api';
import { useCosmetics, useInventory, usePlayerProfile, useUpdateProfile } from '@/features/profile/hooks';
import { errorMessage } from '@/lib/errors';

export default function EditProfileScreen() {
  const userId = useCurrentUserId();
  const profile = usePlayerProfile(userId);
  const cosmetics = useCosmetics();
  const inventory = useInventory();
  const loaded = profile.data?.profile;

  if (!loaded || !cosmetics.data || !inventory.data) {
    return (
      <Screen>
        <ScreenHeader title="Personnaliser" />
        {profile.error || cosmetics.error || inventory.error ? (
          <ErrorState message={errorMessage(profile.error ?? cosmetics.error ?? inventory.error)} />
        ) : (
          <ListSkeleton rows={4} />
        )}
      </Screen>
    );
  }
  return <EditProfileForm profile={loaded} cosmetics={cosmetics.data} inventory={inventory.data} />;
}

function EditProfileForm({
  profile,
  cosmetics,
  inventory,
}: {
  profile: PlayerProfile['profile'];
  cosmetics: Cosmetic[];
  inventory: string[];
}) {
  const catalog = useCatalog();
  const update = useUpdateProfile();
  const toast = useToast();
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [bio, setBio] = useState(profile.bio);
  const [avatarId, setAvatarId] = useState(profile.avatar_id);
  const [titleId, setTitleId] = useState<string | null>(profile.title_id);
  const [favorites, setFavorites] = useState<string[]>(profile.favorite_games);

  const owned = cosmetics.filter((item) => ownsCosmetic(item, inventory));
  const avatars = owned.filter((item) => item.kind === 'avatar');
  const titles = owned.filter((item) => item.kind === 'title');

  const save = () =>
    update.mutate(
      { display_name: displayName.trim(), bio: bio.trim(), avatar_id: avatarId, title_id: titleId, favorite_games: favorites },
      {
        onSuccess: () => {
          toast.show({ message: 'Profil mis à jour', tone: 'success' });
          router.back();
        },
      },
    );

  return (
    <Screen gap={20} footer={<Button label="Enregistrer" onPress={save} loading={update.isPending} />}>
      <ScreenHeader title="Personnaliser" />
      <View style={styles.preview}>
        <PlayerAvatar player={{ avatar_id: avatarId, display_name: displayName || profile.username }} size={96} ring="profile" />
      </View>
      <TextField label="Nom affiché" value={displayName} onChangeText={setDisplayName} maxLength={32} />
      <TextField label="Bio" value={bio} onChangeText={setBio} maxLength={160} multiline hint={`${bio.length}/160`} />

      <SectionHeader title="Avatar" />
      <View style={styles.grid}>
        {avatars.map((item) => (
          <PressableScale
            key={item.id}
            accessibilityRole="radio"
            accessibilityState={{ selected: avatarId === item.id }}
            accessibilityLabel={item.name}
            onPress={() => setAvatarId(item.id)}
            style={styles.cell}
          >
            <PlayerAvatar player={{ avatar_id: item.id, display_name: displayName || profile.username }} size={56} ring={avatarId === item.id ? 'ready' : 'none'} />
          </PressableScale>
        ))}
      </View>
      <Text variant="caption" color={colors.textTertiary}>
        D’autres avatars se débloquent aux niveaux 3, 5 et 10.
      </Text>

      <SectionHeader title="Titre" />
      <View style={styles.chips}>
        {titles.map((item) => (
          <Chip key={item.id} label={item.name} active={titleId === item.id} onPress={() => setTitleId(item.id)} />
        ))}
      </View>

      <SectionHeader title="Jeux préférés" />
      <View style={styles.chips}>
        {(catalog.data ?? []).map((game) => (
          <Chip
            key={game.id}
            label={game.name}
            active={favorites.includes(game.id)}
            onPress={() =>
              setFavorites((current) => (current.includes(game.id) ? current.filter((id) => id !== game.id) : [...current, game.id]))
            }
          />
        ))}
      </View>
      {update.error ? <ErrorState message={errorMessage(update.error)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  cell: { alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
