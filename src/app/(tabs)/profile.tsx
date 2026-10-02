import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, ErrorState, IconButton, ListSkeleton, Screen } from '@/design-system';
import { useCurrentUserId } from '@/features/auth/store';
import { ProfileView } from '@/features/profile/components/ProfileView';
import { useInventory, useMatchHistory, usePlayerProfile } from '@/features/profile/hooks';
import { errorMessage } from '@/lib/errors';

export default function MyProfileScreen() {
  const userId = useCurrentUserId();
  const profile = usePlayerProfile(userId);
  const history = useMatchHistory(userId);
  const inventory = useInventory();

  return (
    <Screen
      withTabBar
      refreshing={profile.isRefetching}
      onRefresh={() => {
        void profile.refetch();
        void history.refetch();
        void inventory.refetch();
      }}
    >
      <View style={styles.top}>
        <IconButton icon="settings" accessibilityLabel="Paramètres" onPress={() => router.push('/settings')} />
      </View>
      {profile.isPending ? <ListSkeleton rows={4} /> : null}
      {profile.error ? <ErrorState message={errorMessage(profile.error)} onRetry={() => void profile.refetch()} /> : null}
      {profile.data ? (
        <ProfileView data={profile.data} history={history.data} inventory={inventory.data ?? []} />
      ) : null}
      {profile.data ? (
        <View style={styles.actions}>
          <Button label="Inventaire" variant="secondary" style={styles.flex} onPress={() => router.push('/profile/inventory')} />
          <Button label="Personnaliser" style={styles.flex} onPress={() => router.push('/profile/edit')} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'flex-end' },
  actions: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
});
