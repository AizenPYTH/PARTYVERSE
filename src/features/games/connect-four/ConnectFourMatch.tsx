import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import {
  Avatar,
  Button,
  ErrorState,
  IconButton,
  Sheet,
  Text,
  colors,
  sizes,
  useToast,
} from '@/design-system';
import { errorMessage, toAppError } from '@/lib/errors';
import { formatCountdown } from '@/lib/serverClock';

import { lobbiesApi } from '../../lobbies/api';
import { LobbyChatSheet } from '../../lobbies/components/LobbyChatSheet';
import type { MatchPlayer, MatchState } from '../../matches/api';
import { moveErrorIsSilent, useMatch } from '../../matches/useMatch';
import { displayNameOf, initialsFor } from '../../profile/avatars';
import { Board } from './Board';
import { dropToken, type Seat } from './engine';
import { SEAT_STYLE, resultSummary, statusLine } from './presentation';
import { parseConnectFourState } from './schema';

const haptic = (style: Haptics.ImpactFeedbackStyle) => {
  if (Platform.OS !== 'web') void Haptics.impactAsync(style).catch(() => undefined);
};

export function ConnectFourMatch({ state, match }: { state: MatchState; match: ReturnType<typeof useMatch> }) {
  const toast = useToast();
  const [sheet, setSheet] = useState<'menu' | 'chat' | null>(null);
  const [resultDismissed, setResultDismissed] = useState(false);
  const [rematchPending, setRematchPending] = useState(false);
  const board = parseConnectFourState(state.match.state);
  const mySeat = state.my_seat;
  const active = state.match.status === 'active';
  const myTurn = active && mySeat !== null && state.match.current_turn_seat === mySeat;
  const pendingMove = match.connectFourMove.isPending ? match.connectFourMove.variables : undefined;

  // Haptics: light on every new token, medium when the round ends.
  const lastMoveCount = useRef(board?.move_count ?? 0);
  useEffect(() => {
    if (!board) return;
    if (board.move_count > lastMoveCount.current) haptic(Haptics.ImpactFeedbackStyle.Light);
    lastMoveCount.current = board.move_count;
  }, [board?.move_count]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!active && Platform.OS !== 'web') {
      void Haptics.notificationAsync(
        state.match.winner_seat === mySeat ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
      ).catch(() => undefined);
    }
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const error = match.connectFourMove.error;
    if (error && !moveErrorIsSilent(error)) toast.show({ message: errorMessage(error), tone: 'error' });
  }, [match.connectFourMove.error]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!board) return <ErrorState message="État de partie illisible." onRetry={() => void match.query.refetch()} />;

  const pending =
    pendingMove && mySeat !== null
      ? (() => {
          const result = dropToken(board, pendingMove.column, mySeat as Seat);
          return result.ok ? { column: pendingMove.column, row: result.row, seat: mySeat as Seat } : null;
        })()
      : null;

  const left = state.players.find((p) => p.seat === (mySeat ?? 0));
  const right = state.players.find((p) => p.seat !== (mySeat ?? 0));
  const status = statusLine(state, mySeat);
  const summary = resultSummary(state, mySeat);
  const lobbyId = state.match.lobby_id;

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

  const confirmResign = () =>
    Alert.alert('Abandonner la manche ?', 'Ton adversaire remportera la manche.', [
      { text: 'Continuer', style: 'cancel' },
      {
        text: 'Abandonner',
        style: 'destructive',
        onPress: () => {
          setSheet(null);
          match.resign.mutate(undefined, { onError: (error) => toast.show({ message: errorMessage(error), tone: 'error' }) });
        },
      },
    ]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.topBar}>
        <IconButton icon="menu" size={sizes.iconButtonGame} accessibilityLabel="Menu de la partie" onPress={() => setSheet('menu')} />
        <Text variant="overline" color={colors.textSecondary}>
          {`CONNECT FOUR · MANCHE ${state.match.round}`}
        </Text>
        <IconButton
          icon="messages"
          size={sizes.iconButtonGame}
          accessibilityLabel="Chat"
          disabled={!lobbyId}
          onPress={() => setSheet('chat')}
        />
      </View>

      <View style={styles.players}>
        <PlayerSide player={left} you={mySeat !== null} active={active && state.match.current_turn_seat === left?.seat} align="left" />
        <Text variant="score" accessibilityLabel={`Score ${left?.series_wins ?? 0} à ${right?.series_wins ?? 0}`}>
          {`${left?.series_wins ?? 0}`}
          <Text variant="score" color={colors.textTertiary}>{' : '}</Text>
          {`${right?.series_wins ?? 0}`}
        </Text>
        <PlayerSide player={right} you={false} active={active && state.match.current_turn_seat === right?.seat} align="right" />
      </View>

      <Text variant="item" color={status.color} align="center" accessibilityLiveRegion="polite" style={styles.numeric}>
        {active && match.remaining !== null ? `${status.text} · ${formatCountdown(match.remaining)}` : status.text}
      </Text>

      <Board
        state={board}
        interactive={myTurn && !match.connectFourMove.isPending}
        pending={pending}
        onDrop={(column) => {
          haptic(Haptics.ImpactFeedbackStyle.Light);
          match.connectFourMove.mutate({ column, version: state.match.version });
        }}
      />

      <View style={styles.footer}>
        <Text variant="captionBold" color={colors.textSecondary}>
          Aligne 4 jetons
        </Text>
        <Text variant="overline" color={colors.textSecondary}>{`Coup ${board.move_count}`}</Text>
      </View>

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
        {mySeat !== null && lobbyId ? (
          <View style={styles.resultActions}>
            <Button label="Quitter" variant="secondary" style={styles.flex1} onPress={() => void quit()} />
            <Button label="Revanche" style={styles.flex2} loading={rematchPending} onPress={() => void rematch()} testID="c4-rematch" />
          </View>
        ) : (
          <Button label="Retour" variant="secondary" onPress={backToLobby} />
        )}
      </Sheet>

      <Sheet visible={sheet === 'menu'} onClose={() => setSheet(null)} title="Partie">
        {lobbyId ? <Button label="Retour au salon" variant="secondary" onPress={() => { setSheet(null); backToLobby(); }} /> : null}
        {active && mySeat !== null ? (
          <Button label="Abandonner la manche" variant="destructive" loading={match.resign.isPending} onPress={confirmResign} />
        ) : null}
      </Sheet>

      {lobbyId ? <LobbyChatSheet lobbyId={lobbyId} visible={sheet === 'chat'} onClose={() => setSheet(null)} /> : null}
    </SafeAreaView>
  );
}

function PlayerSide({ player, you, active, align }: { player: MatchPlayer | undefined; you: boolean; active: boolean; align: 'left' | 'right' }) {
  if (!player) return <View style={styles.side} />;
  const seat = SEAT_STYLE[player.seat === 1 ? 1 : 0];
  const name = you ? 'Toi' : displayNameOf(player);
  const avatar = <Avatar size={40} hue={seat.hue} initials={initialsFor(displayNameOf(player))} accessibilityLabel={name} />;
  return (
    <View
      style={[styles.side, { backgroundColor: active ? seat.soft : 'transparent', flexDirection: align === 'left' ? 'row' : 'row-reverse' }]}
      accessibilityLabel={`${name}, ${seat.label}${active ? ', à son tour' : ''}${player.is_online ? '' : ', hors ligne'}`}
    >
      {avatar}
      <View style={[styles.sideText, { alignItems: align === 'left' ? 'flex-start' : 'flex-end' }]}>
        <Text variant="itemSm" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="meta" color={player.is_online ? colors.textSecondary : colors.coral} numberOfLines={1}>
          {player.is_online ? seat.label : 'Hors ligne'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.midnight, paddingHorizontal: 20, gap: 18 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6 },
  players: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  side: { flex: 1, alignItems: 'center', gap: 10, padding: 10, borderRadius: 16 },
  sideText: { flex: 1, gap: 2 },
  numeric: { fontVariant: ['tabular-nums'] },
  footer: { flexDirection: 'row', justifyContent: 'space-between' },
  after: { marginTop: 'auto', paddingBottom: 12 },
  resultActions: { flexDirection: 'row', gap: 10 },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
});
