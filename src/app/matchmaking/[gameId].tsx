import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, ErrorState, LoadingDots, Screen, Text, colors } from '@/design-system';
import { useGame } from '@/features/games/catalog';
import { GameEmblem } from '@/features/games/components/GameEmblem';
import { matchmakingApi, type MatchmakingTicket } from '@/features/matchmaking/api';
import { useInterval } from '@/hooks/useInterval';
import { errorMessage } from '@/lib/errors';

const POLL_MS = 2000;

/** Ranked queue: every poll lets the server try a pairing (no worker needed). */
export default function MatchmakingScreen() {
  const { gameId, mode = 'classic' } = useLocalSearchParams<{ gameId: string; mode?: string }>();
  const { game } = useGame(gameId);
  const [ticket, setTicket] = useState<MatchmakingTicket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const finished = useRef(false);

  const handle = (next: MatchmakingTicket | null) => {
    setTicket(next);
    if (next?.status !== 'matched' || finished.current) return;
    if (next.match_id) {
      finished.current = true;
      router.replace({ pathname: '/match/[matchId]', params: { matchId: next.match_id } });
    } else if (next.lobby_id) {
      // Engine games: the room starts the match as soon as a player reaches it.
      finished.current = true;
      router.replace({ pathname: '/lobby/[lobbyId]', params: { lobbyId: next.lobby_id } });
    }
  };

  useEffect(() => {
    finished.current = false;
    matchmakingApi
      .enqueue(gameId, mode)
      .then(handle)
      .catch((reason: unknown) => setError(errorMessage(reason)));
    return () => {
      // Leaving the screen while searching cancels the ticket.
      if (!finished.current) void matchmakingApi.cancel().catch(() => undefined);
    };
  }, [gameId, mode]);

  useInterval(
    () => {
      matchmakingApi
        .poll()
        .then(handle)
        .catch((reason: unknown) => setError(errorMessage(reason)));
    },
    ticket?.status === 'searching' && !error ? POLL_MS : null,
  );

  const searching = ticket?.status === 'searching';
  return (
    <Screen edges={['top', 'left', 'right', 'bottom']} scroll={false} gap={24} contentStyle={styles.content}>
      <GameEmblem gameId={gameId} height={140} width={140} radius={28} scale={1} />
      <Text variant="title" align="center">
        {game ? `${game.name} · ${game.modes.find((m) => m.id === mode)?.name ?? 'classé'}` : 'Partie classée'}
      </Text>
      {error ? <ErrorState message={error} /> : null}
      {!error && (searching || !ticket) ? (
        <View style={styles.status}>
          <LoadingDots color={colors.violetText} />
          <Text variant="body" color={colors.textSecondary} align="center">
            Recherche d’un adversaire de ton niveau…
          </Text>
          {ticket ? (
            <Text variant="caption" color={colors.textTertiary} align="center" style={styles.numeric}>
              {`${ticket.waited_seconds} s · classement ${ticket.rating} · écart toléré ±${ticket.window}`}
            </Text>
          ) : null}
        </View>
      ) : null}
      {ticket?.status === 'expired' ? (
        <Text variant="body" color={colors.amber} align="center">
          Personne n’est disponible pour le moment. Réessaie dans un instant.
        </Text>
      ) : null}
      <View style={styles.actions}>
        {ticket?.status === 'expired' || error ? (
          <Button
            label="Relancer la recherche"
            onPress={() => {
              setError(null);
              matchmakingApi
                .enqueue(gameId, mode)
                .then(handle)
                .catch((reason: unknown) => setError(errorMessage(reason)));
            }}
          />
        ) : null}
        <Button label="Annuler" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', justifyContent: 'center' },
  status: { alignItems: 'center', gap: 12 },
  numeric: { fontVariant: ['tabular-nums'] },
  actions: { alignSelf: 'stretch', gap: 10 },
});
