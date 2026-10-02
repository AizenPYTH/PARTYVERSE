import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { PlayerAvatar } from '@/components/PlayerAvatar';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  ListSkeleton,
  SectionHeader,
  SegmentedControl,
  Sheet,
  Skeleton,
  Text,
  colors,
  tint,
} from '@/design-system';
import { hasRankedMode, isPlayable, playersLabel, rankedModes, useGame, type Game } from '@/features/games/catalog';
import { GameEmblem } from '@/features/games/components/GameEmblem';
import { gameVisual } from '@/features/games/registry';
import { useCreateLobby, usePublicLobbies } from '@/features/lobbies/hooks';
import { gameSettings } from '@/features/lobbies/settings';
import { useLobbyNavigation } from '@/features/lobbies/useLobbyNavigation';
import { useCurrentUserId } from '@/features/auth/store';
import { toggleFavorite } from '@/features/games/favorites';
import { usePlayerProfile, useUpdateProfile } from '@/features/profile/hooks';
import { errorMessage } from '@/lib/errors';

export default function GameDetailScreen() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const { game, isPending, error, refetch } = useGame(gameId);
  const [createOpen, setCreateOpen] = useState(false);
  const me = usePlayerProfile(useCurrentUserId());
  const updateProfile = useUpdateProfile();
  const favorites = me.data?.profile.favorite_games ?? [];

  if (isPending) {
    return (
      <View style={styles.root}>
        <Skeleton height={220} radius={0} />
      </View>
    );
  }
  if (error || !game) {
    return (
      <View style={[styles.root, styles.padded]}>
        <ScreenHeader title="Jeu" />
        <ErrorState message={error ? errorMessage(error) : 'Jeu introuvable.'} onRetry={() => void refetch()} />
      </View>
    );
  }

  const playable = isPlayable(game);
  return (
    <ScrollView style={styles.root} showsVerticalScrollIndicator={false}>
      <View style={[styles.banner, { backgroundColor: tint(gameVisual(game.id).hue).deep }]}>
        <View style={styles.padded}>
          <ScreenHeader
            title=""
            right={
              me.data ? (
                <Button
                  label={favorites.includes(game.id) ? '★ Favori' : '☆ Favori'}
                  size="S"
                  variant={favorites.includes(game.id) ? 'primary' : 'secondary'}
                  accessibilityLabel={favorites.includes(game.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  loading={updateProfile.isPending}
                  disabled={!favorites.includes(game.id) && favorites.length >= 10}
                  onPress={() => {
                    const next = toggleFavorite(favorites, game.id);
                    if (next) updateProfile.mutate({ favorite_games: next });
                  }}
                />
              ) : undefined
            }
          />
        </View>
        <GameEmblem gameId={game.id} height={150} radius={24} style={styles.bannerArt} />
      </View>
      <View style={[styles.padded, styles.body]}>
        <Text variant="display">{game.name}</Text>
        <Text variant="caption" color={colors.textSecondary}>
          {`${gameVisual(game.id).genre} · ${playersLabel(game)} joueurs · ~${game.avg_duration_minutes} min`}
        </Text>
        <Text variant="body" color={colors.textSecondary}>
          {game.description}
        </Text>

        {playable ? (
          <View style={styles.actions}>
            <Button label="Créer un salon" onPress={() => setCreateOpen(true)} testID="game-create-lobby" />
            <QuickJoinButton gameId={game.id} />
            {rankedModes(game).length > 0 ? (
              <View style={styles.ranked}>
                <Text variant="caption" color={colors.textSecondary}>
                  Partie classée
                </Text>
                <View style={styles.row}>
                  {rankedModes(game).map((mode) => (
                    <Button
                      key={mode.id}
                      label={rankedModes(game).length > 1 ? mode.name : 'Partie classée'}
                      variant="secondary"
                      icon="bolt"
                      size="M"
                      style={styles.flex}
                      testID={`ranked-${mode.id}`}
                      onPress={() => router.push({ pathname: '/matchmaking/[gameId]', params: { gameId: game.id, mode: mode.id } })}
                    />
                  ))}
                </View>
              </View>
            ) : null}
            <View style={styles.row}>
              <Button label="Rejoindre avec un code" variant="secondary" size="M" style={styles.flex} onPress={() => router.push('/lobby/join')} />
              {hasRankedMode(game) ? (
                <Button
                  label="Classement"
                  variant="secondary"
                  size="M"
                  icon="leaderboard"
                  onPress={() => router.push({ pathname: '/leaderboard/[gameId]', params: { gameId: game.id } })}
                />
              ) : null}
            </View>
            <PublicLobbies gameId={game.id} />
          </View>
        ) : (
          <Card bordered>
            <Text variant="item" color={colors.amber}>
              Bientôt disponible
            </Text>
            <Text variant="caption" color={colors.textSecondary}>
              Ce jeu est en cours de développement. Il apparaîtra ici dès que son moteur multijoueur sera prêt.
            </Text>
          </Card>
        )}
      </View>
      {playable ? <CreateLobbySheet game={game} visible={createOpen} onClose={() => setCreateOpen(false)} /> : null}
    </ScrollView>
  );
}

function PublicLobbies({ gameId }: { gameId: string }) {
  const lobbies = usePublicLobbies(gameId);
  const lobbyNav = useLobbyNavigation();
  return (
    <View style={styles.section}>
      <SectionHeader title="Salons publics" />
      {lobbies.isPending ? <ListSkeleton rows={2} /> : null}
      {lobbies.error ? <ErrorState message={errorMessage(lobbies.error)} onRetry={() => void lobbies.refetch()} /> : null}
      {lobbies.data?.length === 0 ? (
        <EmptyState icon="lobbies" title="Aucun salon public" message="Crée le tien et rends-le public." />
      ) : null}
      {lobbies.data?.map((lobby) => (
        <Card key={lobby.lobby_id} bordered style={styles.lobbyRow}>
          <PlayerAvatar player={{ avatar_id: lobby.host_avatar_id, username: lobby.host_username }} size={40} />
          <View style={styles.flex}>
            <Text variant="itemSm" numberOfLines={1}>
              {lobby.name || `Salon de ${lobby.host_username ?? 'un joueur'}`}
            </Text>
            <Text variant="caption" color={colors.textSecondary}>{`${lobby.player_count}/${lobby.max_players} joueurs`}</Text>
          </View>
          <Button
            label="Rejoindre"
            size="S"
            loading={lobbyNav.pending === `join:${lobby.lobby_id}`}
            onPress={() => void lobbyNav.join(lobby.lobby_id)}
          />
        </Card>
      ))}
    </View>
  );
}

function CreateLobbySheet({ game, visible, onClose }: { game: Game; visible: boolean; onClose: () => void }) {
  const createLobby = useCreateLobby();
  const settings = gameSettings(game);
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [allowSpectators, setAllowSpectators] = useState(true);
  const [autoStart, setAutoStart] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(settings.map((setting) => [setting.key, setting.default])),
  );

  const submit = () =>
    createLobby.mutate(
      { gameId: game.id, visibility, allowSpectators, autoStart, settings: values },
      {
        onSuccess: (lobby) => {
          onClose();
          router.push({ pathname: '/lobby/[lobbyId]', params: { lobbyId: lobby.id } });
        },
      },
    );

  return (
    <Sheet visible={visible} onClose={onClose} title={`Nouveau salon · ${game.name}`}>
      <SegmentedControl
        segments={[
          { value: 'private', label: 'Privé (code)' },
          { value: 'public', label: 'Public' },
        ]}
        value={visibility}
        onChange={setVisibility}
      />
      {settings.map((setting) => (
        <View key={setting.key} style={styles.setting}>
          <Text variant="caption" color={colors.textSecondary}>
            {setting.label}
          </Text>
          <SegmentedControl
            segments={setting.options.map((option) => ({ value: String(option.value), label: option.label }))}
            value={String(values[setting.key])}
            onChange={(value) => {
              const option = setting.options.find((item) => String(item.value) === value);
              setValues((current) => ({ ...current, [setting.key]: option?.value }));
            }}
          />
        </View>
      ))}
      <ToggleRow label="Spectateurs autorisés" value={allowSpectators} onChange={setAllowSpectators} />
      <ToggleRow label="Démarrage automatique quand tous sont prêts" value={autoStart} onChange={setAutoStart} />
      {createLobby.error ? <ErrorState message={errorMessage(createLobby.error)} /> : null}
      <Button label="Créer le salon" onPress={submit} loading={createLobby.isPending} testID="create-lobby-submit" />
    </Sheet>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.midnight },
  padded: { paddingHorizontal: 20 },
  banner: { paddingTop: 54, paddingBottom: 20, gap: 12 },
  bannerArt: { marginHorizontal: 20, width: undefined },
  body: { gap: 12, paddingTop: 20, paddingBottom: 40 },
  actions: { gap: 10, marginTop: 8 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  section: { gap: 12, marginTop: 12 },
  ranked: { gap: 8 },
  lobbyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  setting: { gap: 8 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
});

function QuickJoinButton({ gameId }: { gameId: string }) {
  const lobbyNav = useLobbyNavigation();
  return (
    <Button
      label="Partie rapide (salon public)"
      variant="secondary"
      testID="game-quick-join"
      loading={lobbyNav.pending === `quick:${gameId}`}
      onPress={() => void lobbyNav.quickJoin(gameId)}
    />
  );
}
