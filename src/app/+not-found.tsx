import { router } from 'expo-router';

import { EmptyState, Screen } from '@/design-system';

export default function NotFoundScreen() {
  return (
    <Screen>
      <EmptyState icon="search" title="Page introuvable" message="Ce lien ne mène nulle part." actionLabel="Accueil" onAction={() => router.replace('/')} />
    </Screen>
  );
}
