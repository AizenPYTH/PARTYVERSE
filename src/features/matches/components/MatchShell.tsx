import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Avatar, Button, IconButton, Sheet, Text, colors, sizes, useToast } from '@/design-system';
import { confirmAction } from '@/lib/confirm';
import { errorMessage, toAppError } from '@/lib/errors';
import { formatCountdown } from '@/lib/serverClock';

import { lobbiesApi } from '../../lobbies/api';
import { LobbyChatSheet } from '../../lobbies/components/LobbyChatSheet';
import { displayNameOf, initialsFor } from '../../profile/avatars';
import type { MatchPlayer, MatchState } from '../api';
import { resultSummary, seatStyle, type StatusLine } from '../presentation';
import type { MatchController } from '../useMatch';

export interface MatchShellProps {
  state: MatchState;
  match: MatchController;
  /** Uppercase overline, e.g. "MORPION". The round number is appended. */
  title: string;
  status: StatusLine;
  /** Shows the authoritative countdown next to the status (default true). */
  showTimer?: boolean;
  /** Non-color seat description ("Croix", "Blancs"…). */
  seatLabel?: (seat: number) => string;
  /** Score shown per player (N-player games) or between the duelists. */
  scoreOf?: (player: MatchPlayer) => string | number | null;
  /** Game-specific result reasons (checkmate…). */
  reasons?: Record<string, string>;
  footer?: ReactNode;
  /** Games that draw their own player bars (chess clocks) hide the default header. */
  hideHeader?: boolean;
  children: ReactNode;
}

const haptic = (run: () => Promise<void>) => {
  if (Platform.OS !== 'web') void run().catch(() => undefined);
};

/**
 * Shared match chrome (handoff 1h): compact top bar, players, status line,
 * result sheet with rematch, menu (resign / back) and lobby chat.
 */
export function MatchShell({
  state,
  match,
  title,
  status,
  showTimer = true,
  seatLabel,
  scoreOf,
  reasons,
  footer,
  hideHeader = false,
  children,
}: MatchShellProps) {
  const toast = useToast();
  const [sheet, setSheet] = useState<'menu' | 'chat' | null>(null);
  const [resultDismissed, setResultDismissed] = useState(false);
  const [rematchPending, setRematchPending] = useState(false);
  const mySeat = state.my_seat;
  const active = state.match.status === 'active';
  const lobbyId = state.match.lobby_id;
  const duel = state.players.length <= 2;
  const summary = resultSummary(state, mySeat, reasons);

  useEffect(() => {
    if (active) return;
    const me = state.players.find((p) => p.seat === mySeat);
    haptic(() =>
      Haptics.notificationAsync(
        me?.result === 'win' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
      ),
    );
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const backToLobby = () => {
    if (lobbyId) router.dismissTo({ pathname: '/lobby/[lobbyId]', params: { lobbyId } });
    else router.replace('/');
  };

  const rematch = async () => {
    if (!lobbyId) return;
    setRematchPending(true);
    try {
      await lobbiesApi.setReady(lobbyId, true);
      backToLobby();
    } catch (error) {
      toast.show({ message: errorMessage(error), tone: 'error' });
    } finally {
      setRematchPending(false);
    }
  };

  const quit = async () => {
    try {
      if (lobbyId && mySeat !== null) await lobbiesApi.leave(lobbyId);
    } catch (error) {
      if (toAppError(error).code !== 'PV_LOBBY_NOT_FOUND') toast.show({ message: errorMessage(error), tone: 'error' });
    }
    router.replace('/');
  };

  const confirmResign = async () => {
    const confirmed = await confirmAction({
      title: duel ? 'Abandonner la manche ?' : 'Quitter la partie ?',
      message: duel ? 'Ton adversaire remportera la manche.' : 'Tu seras classé dernier de cette partie.',
      confirmLabel: duel ? 'Abandonner' : 'Quitter',
      cancelLabel: 'Continuer',
      destructive: true,
    });
    if (!confirmed) return;
    setSheet(null);
    match.resign.mutate(undefined, { onError: (error) => toast.show({ message: errorMessage(error), tone: 'error' }) });
  };

  const statusText = active && showTimer && match.remaining !== null ? `${status.text} · ${formatCountdown(match.remaining)}` : status.text;
  const activeSeats = state.match.active_seats ?? (state.match.current_turn_seat !== null ? [state.match.current_turn_seat] : []);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.topBar}>
        <IconButton icon="menu" size={sizes.iconButtonGame} accessibilityLabel="Menu de la partie" onPress={() => setSheet('menu')} />
        <Text variant="overline" color={colors.textSecondary} numberOfLines={1} style={styles.title}>
          {`${title} · MANCHE ${state.match.round}`}
        </Text>
        <IconButton icon="messages" size={sizes.iconButtonGame} accessibilityLabel="Chat" disabled={!lobbyId} onPress={() => setSheet('chat')} />
      </View>

      {hideHeader ? null : duel ? (
        <DuelHeader state={state} activeSeats={active ? activeSeats : []} seatLabel={seatLabel} scoreOf={scoreOf} />
      ) : (
        <PlayersStrip state={state} activeSeats={active ? activeSeats : []} scoreOf={scoreOf} />
      )}

      <Text variant="item" color={status.color} align="center" accessibilityLiveRegion="polite" style={styles.numeric}>
        {statusText}
      </Text>

      <View style={styles.content}>{children}</View>

      {footer}

      {mySeat === null ? (
        <Text variant="caption" color={colors.textTertiary} align="center">
          Tu regardes cette partie en spectateur.
        </Text>
      ) : null}

      {!active && resultDismissed ? (
        <View style={styles.after}>
          <Button label="Retour au salon" variant="secondary" onPress={backToLobby} />
        </View>
      ) : null}

      <Sheet visible={!active && !resultDismissed} onClose={() => setResultDismissed(true)}>
        <Text variant="score" color={summary.color} align="center" accessibilityRole="header">
          {summary.title}
        </Text>
        {summary.reward ? (
          <Text variant="item" color={colors.amber} align="center">
            {summary.reward}
          </Text>
        ) : null}
        {summary.detail ? (
          <Text variant="caption" color={colors.textSecondary} align="center">
            {summary.detail}
          </Text>
        ) : null}
        {!duel ? <FinalRanking state={state} scoreOf={scoreOf} /> : null}
        {mySeat !== null && lobbyId ? (
          <View style={styles.resultActions}>
            <Button label="Quitter" variant="secondary" style={styles.flex1} onPress={() => void quit()} />
            <Button label="Revanche" style={styles.flex2} loading={rematchPending} onPress={() => void rematch()} testID="match-rematch" />
          </View>
        ) : (
          <Button label="Retour" variant="secondary" onPress={backToLobby} />
        )}
      </Sheet>

      <Sheet visible={sheet === 'menu'} onClose={() => setSheet(null)} title="Partie">
        {lobbyId ? (
          <Button
            label="Retour au salon"
            variant="secondary"
            onPress={() => {
              setSheet(null);
              backToLobby();
            }}
          />
        ) : null}
        {active && mySeat !== null ? (
          <Button
            label={duel ? 'Abandonner la manche' : 'Quitter la partie'}
            variant="destructive"
            loading={match.resign.isPending}
            onPress={() => void confirmResign()}
          />
        ) : null}
      </Sheet>

      {lobbyId ? <LobbyChatSheet lobbyId={lobbyId} visible={sheet === 'chat'} onClose={() => setSheet(null)} /> : null}
    </SafeAreaView>
  );
}

function DuelHeader({
  state,
  activeSeats,
  seatLabel,
  scoreOf,
}: {
  state: MatchState;
  activeSeats: number[];
  seatLabel?: (seat: number) => string;
  scoreOf?: (player: MatchPlayer) => string | number | null;
}) {
  const mySeat = state.my_seat;
  const left = state.players.find((p) => p.seat === (mySeat ?? 0));
  const right = state.players.find((p) => p.seat !== (mySeat ?? 0));
  const score = (player: MatchPlayer | undefined) => (player ? (scoreOf?.(player) ?? player.series_wins) : 0);
  return (
    <View style={styles.players}>
      <PlayerSide player={left} you={mySeat !== null} active={!!left && activeSeats.includes(left.seat)} align="left" label={seatLabel} />
      <Text variant="score" accessibilityLabel={`Score ${score(left)} à ${score(right)}`}>
        {`${score(left)}`}
        <Text variant="score" color={colors.textTertiary}>
          {':'}
        </Text>
        {`${score(right)}`}
      </Text>
      <PlayerSide player={right} you={false} active={!!right && activeSeats.includes(right.seat)} align="right" label={seatLabel} />
    </View>
  );
}

function PlayerSide({
  player,
  you,
  active,
  align,
  label,
}: {
  player: MatchPlayer | undefined;
  you: boolean;
  active: boolean;
  align: 'left' | 'right';
  label?: (seat: number) => string;
}) {
  if (!player) return <View style={styles.side} />;
  const style = seatStyle(player.seat);
  const name = you ? 'Toi' : displayNameOf(player);
  const sub = player.left ? 'A quitté' : !player.is_online ? 'Hors ligne' : (label?.(player.seat) ?? '');
  return (
    <View
      style={[styles.side, { backgroundColor: active ? style.soft : 'transparent', flexDirection: align === 'left' ? 'row' : 'row-reverse' }]}
      accessibilityLabel={`${name}${sub ? `, ${sub}` : ''}${active ? ', à son tour' : ''}`}
    >
      <Avatar size={40} hue={style.hue} initials={initialsFor(displayNameOf(player))} accessibilityLabel={name} />
      <View style={[styles.sideText, { alignItems: align === 'left' ? 'flex-start' : 'flex-end' }]}>
        <Text variant="itemSm" numberOfLines={1}>
          {name}
        </Text>
        {sub ? (
          <Text variant="meta" color={player.is_online && !player.left ? colors.textSecondary : colors.coral} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function PlayersStrip({
  state,
  activeSeats,
  scoreOf,
}: {
  state: MatchState;
  activeSeats: number[];
  scoreOf?: (player: MatchPlayer) => string | number | null;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {state.players.map((player) => {
        const active = activeSeats.includes(player.seat);
        const me = player.seat === state.my_seat;
        const score = scoreOf?.(player);
        return (
          <View
            key={player.seat}
            style={[styles.chip, active && { backgroundColor: seatStyle(player.seat).soft }, player.left && styles.left]}
            accessibilityLabel={`${me ? 'Toi' : displayNameOf(player)}${score != null ? `, ${score} points` : ''}${active ? ', doit jouer' : ''}`}
          >
            <PlayerAvatar player={player} size={32} presence={player.is_online ? undefined : 'offline'} />
            <Text variant="captionBold" numberOfLines={1} style={styles.chipName}>
              {me ? 'Toi' : displayNameOf(player)}
            </Text>
            {score != null ? (
              <Text variant="numeric" color={colors.amber}>
                {score}
              </Text>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

function FinalRanking({ state, scoreOf }: { state: MatchState; scoreOf?: (player: MatchPlayer) => string | number | null }) {
  const ranked = [...state.players].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  return (
    <View style={styles.ranking}>
      {ranked.map((player) => (
        <View key={player.seat} style={styles.rankRow}>
          <Text variant="itemSm" color={player.rank === 1 ? colors.amber : colors.textSecondary} style={styles.rank}>
            {`#${player.rank ?? '–'}`}
          </Text>
          <PlayerAvatar player={player} size={28} />
          <Text variant="itemSm" style={styles.flex1} numberOfLines={1}>
            {player.seat === state.my_seat ? 'Toi' : displayNameOf(player)}
          </Text>
          <Text variant="numeric">{scoreOf?.(player) ?? player.score ?? ''}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.midnight, paddingHorizontal: 20, gap: 16 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, gap: 8 },
  title: { flexShrink: 1 },
  players: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  side: { flex: 1, alignItems: 'center', gap: 8, padding: 8, borderRadius: 16 },
  sideText: { flex: 1, gap: 2 },
  strip: { gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14, backgroundColor: colors.surface },
  chipName: { maxWidth: 90 },
  left: { opacity: 0.45 },
  numeric: { fontVariant: ['tabular-nums'] },
  content: { flex: 1, gap: 14 },
  after: { paddingBottom: 12 },
  resultActions: { flexDirection: 'row', gap: 10 },
  ranking: { gap: 8 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: { width: 32 },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
});
