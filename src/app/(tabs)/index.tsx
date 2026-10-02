import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PlayerAvatar } from '@/components/PlayerAvatar';
import {
  Card,
  ErrorState,
  Icon,
  IconButton,
  Pill,
  PressableScale,
  Screen,
  SectionHeader,
  Skeleton,
  Text,
  colors,
  motion,
} from '@/design-system';
import { useCatalog, type Game } from '@/features/games/catalog';
import { GameEmblem } from '@/features/games/components/GameEmblem';
import { formatNumber, greetingFor } from '@/features/home/greeting';
import { InvitationCard } from '@/features/home/InvitationCard';
import { useInvitations } from '@/features/lobbies/hooks';
import { useLobbyNavigation } from '@/features/lobbies/useLobbyNavigation';
import { displayNameOf } from '@/features/profile/avatars';
import { useHomeOverview } from '@/features/profile/hooks';
import { useFriends } from '@/features/social/hooks';
import { describePresence } from '@/features/social/presence';
import type { Friend } from '@/features/social/api';
import { errorMessage } from '@/lib/errors';

export default function HomeScreen() {
  const overview = useHomeOverview();
  const friends = useFriends();
  const invitations = useInvitations();
  const catalog = useCatalog();
  const lobbyNav = useLobbyNavigation();

  const data = overview.data;
  const gameName = (id: string | null | undefined) => catalog.data?.find((game) => game.id === id)?.name ?? '';
  const onlineFriends = (friends.data ?? []).filter((friend) => friend.presence !== 'offline');
  const refreshing = overview.isRefetching || friends.isRefetching;

  return (
    <Screen
      withTabBar
      refreshing={refreshing}
      onRefresh={() => {
        void overview.refetch();
        void friends.refetch();
        void invitations.refetch();
      }}
    >
      {data ? <Header overview={data} /> : <Skeleton height={48} />}
      {overview.error ? <ErrorState message={errorMessage(overview.error)} onRetry={() => void overview.refetch()} /> : null}

      <View style={styles.section}>
        <SectionHeader
          title="En ligne"
          accent={{ text: String(onlineFriends.length), color: colors.mint }}
          actionLabel="Tous"
          onAction={() => router.push('/friends')}
        />
        {friends.error ? <ErrorState message={errorMessage(friends.error)} onRetry={() => void friends.refetch()} /> : null}
        {friends.data && friends.data.length === 0 ? (
          <Card bordered onPress={() => router.push('/friends/add')} accessibilityLabel="Ajoute tes premiers amis">
            <Text variant="item">Ajoute tes premiers amis</Text>
            <Text variant="caption" color={colors.textSecondary}>
              Cherche un pseudo pour jouer ensemble.
            </Text>
          </Card>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
            {onlineFriends.map((friend) => (
              <OnlineFriend
                key={friend.user_id}
                friend={friend}
                gameName={gameName(friend.game_id)}
                onPress={() =>
                  friend.presence === 'in_lobby' && friend.lobby_id
                    ? void lobbyNav.join(friend.lobby_id)
                    : router.push({ pathname: '/player/[userId]', params: { userId: friend.user_id } })
                }
              />
            ))}
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Inviter des amis"
              onPress={() => router.push('/friends/add')}
              style={styles.friend}
            >
              <View style={styles.inviteCircle}>
                <Icon name="plus" color={colors.textSecondary} />
              </View>
              <Text variant="captionBold" color={colors.textSecondary}>
                Inviter
              </Text>
            </PressableScale>
          </ScrollView>
        )}
      </View>

      {(invitations.data ?? []).map((invitation) => (
        <InvitationCard
          key={invitation.invitation_id}
          invitation={invitation}
          gameName={gameName(invitation.game_id)}
          loading={lobbyNav.pending === `invite:${invitation.invitation_id}`}
          onJoin={() => void lobbyNav.acceptInvitation(invitation.invitation_id)}
          onExpired={() => void invitations.refetch()}
        />
      ))}

      {data?.active_match ? (
        <ResumeCard
          gameId={data.active_match.game_id}
          title={`${gameName(data.active_match.game_id)} · contre ${data.active_match.opponent_username ?? 'un joueur'}`}
          status={data.active_match.my_turn ? `À toi de jouer · coup ${data.active_match.move_count + 1}` : 'Tour de ton adversaire'}
          urgent={!!data.active_match.my_turn}
          onPress={() => router.push({ pathname: '/match/[matchId]', params: { matchId: data.active_match!.match_id } })}
        />
      ) : data?.active_lobby ? (
        <ResumeCard
          gameId={data.active_lobby.game_id}
          title={`Salon ${gameName(data.active_lobby.game_id)}`}
          status="Ton salon t’attend"
          urgent={false}
          onPress={() => router.push({ pathname: '/lobby/[lobbyId]', params: { lobbyId: data.active_lobby!.lobby_id } })}
        />
      ) : null}

      <HeroCard loading={lobbyNav.pending === 'create:connect_four'} onPress={() => void lobbyNav.quickLobby()} />

      <View style={styles.section}>
        <SectionHeader title="Jeux" actionLabel="Catalogue" onAction={() => router.push('/games')} />
        {catalog.error ? <ErrorState message={errorMessage(catalog.error)} onRetry={() => void catalog.refetch()} /> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gamesCarousel}>
          {(catalog.data ?? []).map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </ScrollView>
      </View>
    </Screen>
  );
}

function Header({ overview }: { overview: NonNullable<ReturnType<typeof useHomeOverview>['data']> }) {
  const { profile, progress } = overview;
  const span = Math.max(progress.next_level_xp - progress.level_start_xp, 1);
  const ratio = (profile.xp - progress.level_start_xp) / span;
  return (
    <View style={styles.header}>
      <PressableScale accessibilityRole="button" accessibilityLabel="Mon profil" onPress={() => router.push('/profile')}>
        <PlayerAvatar player={profile} size={48} progress={ratio} />
      </PressableScale>
      <View style={styles.headerText}>
        <Text variant="titleSm" numberOfLines={1}>
          {`${greetingFor(new Date())}, ${displayNameOf(profile)}`}
        </Text>
        <Text variant="caption" color={colors.textSecondary} style={styles.numeric}>
          {`Niv. ${profile.level} · ${formatNumber(profile.xp)} / ${formatNumber(progress.next_level_xp)} XP`}
        </Text>
      </View>
      <IconButton
        icon="bell"
        accessibilityLabel="Notifications"
        badgeCount={overview.unread_notifications}
        onPress={() => router.push('/notifications')}
      />
    </View>
  );
}

function OnlineFriend({ friend, gameName, onPress }: { friend: Friend; gameName: string; onPress: () => void }) {
  const presence = describePresence(friend.presence, { gameName });
  const badge =
    friend.presence === 'in_game' ? (
      <Pill label="En jeu" color={colors.violet} textColor={colors.white} />
    ) : friend.presence === 'in_lobby' ? (
      <Pill label="Salon" color={colors.amber} />
    ) : undefined;
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={`${displayNameOf(friend)}, ${presence.label}`} onPress={onPress} style={styles.friend}>
      <PlayerAvatar player={friend} size={58} presence={badge ? undefined : friend.presence} badge={badge} />
      <Text variant="captionBold" numberOfLines={1}>
        {displayNameOf(friend)}
      </Text>
      <Text variant="metaBold" color={presence.color} numberOfLines={1}>
        {presence.short}
      </Text>
    </PressableScale>
  );
}

function ResumeCard({ gameId, title, status, urgent, onPress }: { gameId: string; title: string; status: string; urgent: boolean; onPress: () => void }) {
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={`${title}, ${status}`} onPress={onPress} style={styles.resume} scaleTo={motion.cardPressScale}>
      <GameEmblem gameId={gameId} height={52} width={52} radius={14} scale={0.45} />
      <View style={styles.flex}>
        <Text variant="itemSm" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" color={urgent ? colors.amber : colors.textSecondary}>
          {status}
        </Text>
      </View>
      <Text variant="buttonSm" color={colors.violetText}>
        Reprendre
      </Text>
    </PressableScale>
  );
}

function HeroCard({ onPress, loading }: { onPress: () => void; loading: boolean }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel="Lance un salon Connect Four"
      accessibilityState={{ busy: loading }}
      onPress={onPress}
      disabled={loading}
      scaleTo={motion.cardPressScale}
      style={styles.hero}
      testID="home-hero"
    >
      <View style={[styles.ring, styles.ringLarge]} />
      <View style={[styles.ring, styles.ringSmall]} />
      <View style={styles.heroDot} />
      <Text variant="overline" color="rgba(255,255,255,0.8)">
        Jouer entre amis
      </Text>
      <Text variant="hero" color={colors.white} style={styles.heroTitle}>
        Lance un salon
      </Text>
      <View style={styles.heroFooter}>
        <Text variant="caption" color="rgba(255,255,255,0.85)">
          Connect Four · 2 joueurs · ~5 min
        </Text>
        <View style={styles.play}>
          <Icon name="play" color={colors.violet} filled />
        </View>
      </View>
    </PressableScale>
  );
}

function GameCard({ game }: { game: Game }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={game.name}
      onPress={() => router.push({ pathname: '/games/[gameId]', params: { gameId: game.id } })}
      style={styles.gameCard}
      scaleTo={motion.cardPressScale}
    >
      <GameEmblem gameId={game.id} height={120} dimmed={game.availability !== 'available' && game.availability !== 'beta'} />
      <Text variant="itemSm" numberOfLines={1}>
        {game.name}
      </Text>
      <Text variant="meta" color={game.availability === 'available' ? colors.textSecondary : colors.amber}>
        {game.availability === 'available' ? `${game.min_players}–${game.max_players} · ${game.avg_duration_minutes} min` : 'Bientôt'}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 },
  headerText: { flex: 1, gap: 2 },
  numeric: { fontVariant: ['tabular-nums'] },
  section: { gap: 14 },
  carousel: { gap: 16, paddingRight: 20 },
  friend: { width: 64, alignItems: 'center', gap: 4 },
  inviteCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resume: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, gap: 2 },
  hero: { backgroundColor: colors.violet, borderRadius: 24, padding: 22, gap: 8, overflow: 'hidden', minHeight: 160 },
  heroTitle: { marginBottom: 10 },
  heroFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  play: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', borderRadius: 999 },
  ringLarge: { width: 220, height: 220, right: -70, top: -40 },
  ringSmall: { width: 110, height: 110, right: 10, top: 14 },
  heroDot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: colors.white, right: 60, top: 62 },
  gamesCarousel: { gap: 12, paddingRight: 20 },
  gameCard: { width: 150, gap: 6 },
});
