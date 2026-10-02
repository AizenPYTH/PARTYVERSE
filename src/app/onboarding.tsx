import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PlayerAvatar } from '@/components/PlayerAvatar';
import { PlayerRow } from '@/components/PlayerRow';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  ListSkeleton,
  PressableScale,
  ProgressBar,
  Screen,
  Text,
  TextField,
  colors,
} from '@/design-system';
import { usernameSchema } from '@/features/auth/schemas';
import { useCatalog } from '@/features/games/catalog';
import { useOnboardingFlow } from '@/features/onboarding/store';
import { profileApi } from '@/features/profile/api';
import { DEFAULT_AVATAR_ID } from '@/features/profile/avatars';
import { useCosmetics } from '@/features/profile/hooks';
import { usePlayerSearch, useSocialActions } from '@/features/social/hooks';
import { errorMessage } from '@/lib/errors';
import { queryKeys } from '@/lib/queryClient';

type Step = 'identity' | 'avatar' | 'games' | 'friends';
const STEPS: Step[] = ['identity', 'avatar', 'games', 'friends'];

type Availability = { state: 'idle' | 'checking' | 'available' } | { state: 'error'; message: string };

export default function OnboardingScreen() {
  const queryClient = useQueryClient();
  const setFlowActive = useOnboardingFlow((state) => state.setActive);
  const [step, setStep] = useState<Step>('identity');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarId, setAvatarId] = useState(DEFAULT_AVATAR_ID);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [checked, setChecked] = useState<{ username: string; result: Availability } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const parsedUsername = usernameSchema.safeParse(username);
  const candidate = parsedUsername.success ? parsedUsername.data : null;
  const availability: Availability = !username
    ? { state: 'idle' }
    : !parsedUsername.success
      ? { state: 'error', message: parsedUsername.error.issues[0]?.message ?? '' }
      : checked?.username === candidate
        ? checked.result
        : { state: 'checking' };

  // Debounced server check; only its asynchronous result is stored.
  useEffect(() => {
    if (!candidate) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      profileApi
        .isUsernameAvailable(candidate)
        .then((free) => {
          if (!cancelled) {
            setChecked({ username: candidate, result: free ? { state: 'available' } : { state: 'error', message: 'Ce pseudo est déjà pris.' } });
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) setChecked({ username: candidate, result: { state: 'error', message: errorMessage(error) } });
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [candidate]);

  const createProfile = async () => {
    setSubmitting(true);
    setSubmitError(null);
    // Keep the user in the flow for the optional friends step.
    setFlowActive(true);
    try {
      await profileApi.completeOnboarding({
        username: usernameSchema.parse(username),
        displayName: displayName.trim(),
        avatarId,
        favoriteGames: favorites,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.home });
      setStep('friends');
    } catch (error) {
      setFlowActive(false);
      setSubmitError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const index = STEPS.indexOf(step);

  return (
    <Screen gap={22} footer={renderFooter()}>
      <View style={styles.progress}>
        <Text variant="overline" color={colors.textTertiary}>
          {`ÉTAPE ${index + 1} / ${STEPS.length}`}
        </Text>
        <ProgressBar progress={(index + 1) / STEPS.length} height={6} />
      </View>
      {step === 'identity' ? (
        <IdentityStep
          username={username}
          displayName={displayName}
          availability={availability}
          onUsername={setUsername}
          onDisplayName={setDisplayName}
        />
      ) : null}
      {step === 'avatar' ? <AvatarStep avatarId={avatarId} onSelect={setAvatarId} name={displayName || username} /> : null}
      {step === 'games' ? <GamesStep favorites={favorites} onChange={setFavorites} /> : null}
      {step === 'friends' ? <FriendsStep /> : null}
      {submitError ? <ErrorState message={submitError} /> : null}
    </Screen>
  );

  function renderFooter() {
    switch (step) {
      case 'identity':
        return <Button label="Continuer" disabled={availability.state !== 'available'} onPress={() => setStep('avatar')} testID="onboarding-next" />;
      case 'avatar':
        return (
          <View style={styles.footerRow}>
            <Button label="Retour" variant="secondary" style={styles.flex1} onPress={() => setStep('identity')} />
            <Button label="Continuer" style={styles.flex2} onPress={() => setStep('games')} />
          </View>
        );
      case 'games':
        return (
          <View style={styles.footerRow}>
            <Button label="Retour" variant="secondary" style={styles.flex1} onPress={() => setStep('avatar')} />
            <Button label="Créer mon profil" style={styles.flex2} loading={submitting} onPress={createProfile} />
          </View>
        );
      case 'friends':
        return <Button label="C’est parti !" onPress={() => setFlowActive(false)} />;
    }
  }
}

function IdentityStep(props: {
  username: string;
  displayName: string;
  availability: Availability;
  onUsername: (value: string) => void;
  onDisplayName: (value: string) => void;
}) {
  const { availability } = props;
  return (
    <View style={styles.section}>
      <Text variant="title">Choisis ton pseudo</Text>
      <Text variant="body" color={colors.textSecondary}>
        Ton identifiant unique permet à tes amis de te trouver.
      </Text>
      <TextField
        label="Pseudo"
        value={props.username}
        onChangeText={(value) => props.onUsername(value.toLowerCase())}
        placeholder="nova_24"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        error={availability.state === 'error' ? availability.message : undefined}
        success={availability.state === 'available' ? 'Disponible' : undefined}
        hint={availability.state === 'checking' ? 'Vérification…' : '3 à 20 caractères : lettres, chiffres ou _'}
        testID="onboarding-username"
      />
      <TextField
        label="Nom affiché (facultatif)"
        value={props.displayName}
        onChangeText={props.onDisplayName}
        placeholder="Nova"
        maxLength={32}
      />
    </View>
  );
}

function AvatarStep({ avatarId, onSelect, name }: { avatarId: string; onSelect: (id: string) => void; name: string }) {
  const cosmetics = useCosmetics();
  const starters = (cosmetics.data ?? []).filter((item) => item.kind === 'avatar' && item.unlock_rule.type === 'starter');
  return (
    <View style={styles.section}>
      <Text variant="title">Ton avatar</Text>
      <Text variant="body" color={colors.textSecondary}>
        D’autres avatars se débloquent en montant de niveau.
      </Text>
      {cosmetics.isPending ? <ListSkeleton rows={2} /> : null}
      {cosmetics.error ? <ErrorState message={errorMessage(cosmetics.error)} onRetry={() => void cosmetics.refetch()} /> : null}
      <View style={styles.avatarGrid}>
        {starters.map((item) => {
          const selected = item.id === avatarId;
          return (
            <PressableScale
              key={item.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={item.name}
              onPress={() => onSelect(item.id)}
              style={styles.avatarCell}
            >
              <PlayerAvatar player={{ avatar_id: item.id, display_name: name || '?' }} size={64} ring={selected ? 'ready' : 'none'} />
              <Text variant="meta" color={selected ? colors.mint : colors.textSecondary} numberOfLines={1}>
                {item.name}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

function GamesStep({ favorites, onChange }: { favorites: string[]; onChange: (ids: string[]) => void }) {
  const catalog = useCatalog();
  const toggle = (id: string) =>
    onChange(favorites.includes(id) ? favorites.filter((value) => value !== id) : [...favorites, id].slice(0, 10));
  return (
    <View style={styles.section}>
      <Text variant="title">Tes jeux préférés</Text>
      <Text variant="body" color={colors.textSecondary}>
        On s’en sert pour te suggérer des parties. Tu peux passer cette étape.
      </Text>
      {catalog.error ? <ErrorState message={errorMessage(catalog.error)} onRetry={() => void catalog.refetch()} /> : null}
      <View style={styles.chips}>
        {(catalog.data ?? []).map((game) => (
          <Chip key={game.id} label={game.name} active={favorites.includes(game.id)} onPress={() => toggle(game.id)} />
        ))}
      </View>
    </View>
  );
}

function FriendsStep() {
  const [query, setQuery] = useState('');
  const search = usePlayerSearch(query);
  const { sendRequest } = useSocialActions();
  const [sent, setSent] = useState<string[]>([]);

  return (
    <View style={styles.section}>
      <Text variant="title">Retrouve tes amis</Text>
      <Text variant="body" color={colors.textSecondary}>
        Facultatif. Cherche un pseudo pour envoyer une demande d’ami.
      </Text>
      <TextField label="Pseudo d’un ami" value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} />
      {search.isFetching ? <ListSkeleton rows={2} /> : null}
      {search.data?.length === 0 ? <EmptyState title="Aucun joueur trouvé" /> : null}
      {search.data?.map((player) => (
        <PlayerRow
          key={player.user_id}
          player={player}
          status={`@${player.username ?? ''}`}
          action={
            <Button
              label={sent.includes(player.user_id) || player.relationship !== 'none' ? 'Envoyée' : 'Ajouter'}
              size="S"
              disabled={sent.includes(player.user_id) || player.relationship !== 'none'}
              onPress={() =>
                sendRequest.mutate(player.user_id, { onSuccess: () => setSent((ids) => [...ids, player.user_id]) })
              }
            />
          }
        />
      ))}
      {sendRequest.error ? <ErrorState message={errorMessage(sendRequest.error)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { gap: 10, paddingTop: 12 },
  section: { gap: 16 },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between' },
  avatarCell: { width: '22%', alignItems: 'center', gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footerRow: { flexDirection: 'row', gap: 10 },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
});
