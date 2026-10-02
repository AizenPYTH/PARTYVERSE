import { useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { z } from 'zod';

import { isDark, legalMoves, type Piece } from '@engines/checkers';
import { boardColors, Button, ErrorState, PressableScale, Text, colors, tint } from '@/design-system';

import type { MatchState } from '../../matches/api';
import { MatchShell } from '../../matches/components/MatchShell';
import { seatStyle, turnStatus } from '../../matches/presentation';
import { canAct, useEngineAction } from '../../matches/useEngineAction';
import type { MatchController } from '../../matches/useMatch';
import { pendingCaptures, selectionStep, tapSquare } from './selection';

const piece = z.object({ s: z.number(), k: z.boolean() }).nullable();
export const stateSchema = z.object({
  board: z.array(piece).length(64),
  turn: z.number(),
  quietPlies: z.number(),
  history: z.array(z.object({ seat: z.number(), path: z.array(z.number()), captures: z.array(z.number()), crowned: z.boolean() })),
});

type Action = { type: 'move'; path: number[] };

export const SIDE_LABELS = ['Violets', 'Ambres'] as const;

function Crown({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d="M3 18h18l-1.6-9-4.4 4-3-6-3 6-4.4-4L3 18Z" fill={colors.midnight} />
    </Svg>
  );
}

export function CheckersMatch({ state, match }: { state: MatchState; match: MatchController }) {
  const { width } = useWindowDimensions();
  const action = useEngineAction<Action>(state, match);
  // A selection belongs to one server version: a new state discards it.
  const [selection, setSelection] = useState<{ version: number; path: number[] }>({ version: -1, path: [] });
  const selected = selection.version === state.match.version ? selection.path : [];
  const setSelected = (path: number[]) => setSelection({ version: state.match.version, path });
  const parsed = stateSchema.safeParse(state.match.state);
  const game = parsed.success ? parsed.data : null;
  const mySeat = state.my_seat;
  const playable = game !== null && canAct(state) && !action.pending && mySeat !== null;
  const moves = useMemo(
    () => (game && playable ? legalMoves(game.board as (Piece | null)[], mySeat) : []),
    [game?.board, playable, mySeat], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!game) return <ErrorState message="État de partie illisible." onRetry={() => void match.query.refetch()} />;

  const step = selectionStep(moves, selected);
  const captured = new Set(pendingCaptures(moves, selected));
  const mustCapture = moves.some((move) => move.captures.length > 0);
  const last = game.history.at(-1);
  const lastSquares = new Set(last?.path ?? []);
  const flipped = mySeat === 1;
  const cell = Math.floor((Math.min(width, 480) - 40) / 8);
  const palette = tint(30);
  const remaining = (seat: number) => game.board.filter((p) => p?.s === seat).length;

  const onTap = (square: number) => {
    const next = tapSquare(moves, selected, square);
    const complete = selectionStep(moves, next).complete;
    if (complete && next.length > 1) {
      setSelected([]);
      action.send({ type: 'move', path: complete.path });
      return;
    }
    setSelected(next);
  };

  return (
    <MatchShell
      state={state}
      match={match}
      title="DAMES"
      status={turnStatus(state, mySeat)}
      seatLabel={(seat) => SIDE_LABELS[seat === 1 ? 1 : 0]}
      scoreOf={(player) => remaining(player.seat)}
      reasons={{ no_moves: 'Plus aucun coup possible', forty_moves: '40 coups sans prise ni pion avancé' }}
      footer={
        <View style={styles.footer}>
          <Text variant="captionBold" color={mustCapture ? colors.amber : colors.textSecondary}>
            {!playable
              ? 'La prise est obligatoire'
              : mustCapture
                ? selected.length > 1
                  ? 'Continue la rafle'
                  : 'Prise obligatoire'
                : selected.length === 0
                  ? 'Touche un pion'
                  : 'Choisis la case d’arrivée'}
          </Text>
          {selected.length > 0 ? (
            <Button label="Annuler" variant="ghost" size="S" onPress={() => setSelected([])} />
          ) : (
            <Text variant="overline" color={colors.textSecondary}>{`${remaining(0)} – ${remaining(1)}`}</Text>
          )}
        </View>
      }
    >
      <View style={[styles.board, { width: cell * 8, height: cell * 8 }]} accessibilityLabel="Damier">
        {Array.from({ length: 64 }, (_, index) => {
          const square = flipped ? 63 - index : index;
          const value = game.board[square] ?? null;
          const dark = isDark(square);
          const tappable = playable && (step.next.includes(square) || (selected.length > 0 && moves.some((m) => m.path[0] === square)));
          const isSelected = selected.includes(square);
          return (
            <PressableScale
              key={square}
              testID={`checkers-${square}`}
              accessibilityRole="button"
              accessibilityLabel={`Case ${square}${value ? `, ${value.k ? 'dame' : 'pion'} ${SIDE_LABELS[value.s === 1 ? 1 : 0]}` : ''}${step.next.includes(square) ? ', jouable' : ''}`}
              disabled={!tappable}
              onPress={() => onTap(square)}
              style={[styles.square, { width: cell, height: cell, backgroundColor: dark ? palette.deep : palette.pattern }]}
            >
              {isSelected ? (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: boardColors.selected }]} />
              ) : lastSquares.has(square) ? (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: boardColors.lastMove }]} />
              ) : null}
              {value ? (
                <View
                  style={[
                    styles.piece,
                    {
                      width: cell * 0.76,
                      height: cell * 0.76,
                      borderRadius: cell * 0.38,
                      backgroundColor: seatStyle(value.s).color,
                      opacity: captured.has(square) ? 0.35 : 1,
                    },
                  ]}
                >
                  {value.k ? <Crown size={cell * 0.42} /> : null}
                </View>
              ) : null}
              {step.next.includes(square) && !value ? (
                <View style={[styles.hint, { width: cell * 0.28, height: cell * 0.28, borderRadius: cell * 0.14 }]} />
              ) : null}
              {step.next.includes(square) && value && selected.length === 0 ? (
                <View style={[StyleSheet.absoluteFill, styles.movable]} />
              ) : null}
            </PressableScale>
          );
        })}
      </View>
    </MatchShell>
  );
}

const styles = StyleSheet.create({
  board: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center', borderRadius: 12, overflow: 'hidden' },
  square: { alignItems: 'center', justifyContent: 'center' },
  piece: { alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.midnight },
  hint: { backgroundColor: boardColors.hint },
  movable: { borderWidth: 2, borderColor: boardColors.hintRing },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
