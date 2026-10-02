import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { ErrorState, Text, colors, useToast } from '@/design-system';
import { errorMessage } from '@/lib/errors';

import type { MatchState } from '../../matches/api';
import { MatchShell } from '../../matches/components/MatchShell';
import { turnStatus } from '../../matches/presentation';
import { moveErrorIsSilent, type MatchController } from '../../matches/useMatch';
import { Board } from './Board';
import { dropToken, type Seat } from './engine';
import { SEAT_STYLE } from './presentation';
import { parseConnectFourState } from './schema';

const lightHaptic = () => {
  if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
};

export function ConnectFourMatch({ state, match }: { state: MatchState; match: MatchController }) {
  const toast = useToast();
  const board = parseConnectFourState(state.match.state);
  const mySeat = state.my_seat;
  const active = state.match.status === 'active';
  const myTurn = active && mySeat !== null && state.match.current_turn_seat === mySeat;
  const pendingMove = match.connectFourMove.isPending ? match.connectFourMove.variables : undefined;

  // Light haptic on every new token.
  const lastMoveCount = useRef(board?.move_count ?? 0);
  useEffect(() => {
    if (!board) return;
    if (board.move_count > lastMoveCount.current) lightHaptic();
    lastMoveCount.current = board.move_count;
  }, [board?.move_count]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <MatchShell
      state={state}
      match={match}
      title="CONNECT FOUR"
      status={turnStatus(state, mySeat)}
      seatLabel={(seat) => SEAT_STYLE[seat === 1 ? 1 : 0].label}
      reasons={{ win: 'Quatre alignés', draw: 'Grille pleine' }}
      footer={
        <View style={styles.footer}>
          <Text variant="captionBold" color={colors.textSecondary}>
            Aligne 4 jetons
          </Text>
          <Text variant="overline" color={colors.textSecondary}>{`Coup ${board.move_count}`}</Text>
        </View>
      }
    >
      <Board
        state={board}
        interactive={myTurn && !match.connectFourMove.isPending}
        pending={pending}
        onDrop={(column) => {
          lightHaptic();
          match.connectFourMove.mutate({ column, version: state.match.version });
        }}
      />
    </MatchShell>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', justifyContent: 'space-between' },
});
