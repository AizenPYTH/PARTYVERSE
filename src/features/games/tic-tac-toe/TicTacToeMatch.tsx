import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { z } from 'zod';

import { ErrorState, PressableScale, Text, colors } from '@/design-system';

import type { MatchState } from '../../matches/api';
import { MatchShell } from '../../matches/components/MatchShell';
import { seatStyle, turnStatus } from '../../matches/presentation';
import { canAct, useEngineAction } from '../../matches/useEngineAction';
import type { MatchController } from '../../matches/useMatch';

const stateSchema = z.object({
  board: z.array(z.union([z.literal(0), z.literal(1), z.null()])).length(9),
  turn: z.number(),
  moveCount: z.number(),
  winLine: z.array(z.number()).nullable(),
});

type Action = { type: 'place'; cell: number };

export const MARK_LABELS = ['Croix', 'Ronds'] as const;

export function Mark({ mark, size }: { mark: 0 | 1; size: number }) {
  const stroke = Math.max(4, size * 0.12);
  const pad = size * 0.22;
  return (
    <Svg width={size} height={size} accessibilityElementsHidden>
      {mark === 0 ? (
        <>
          <Line x1={pad} y1={pad} x2={size - pad} y2={size - pad} stroke={seatStyle(0).color} strokeWidth={stroke} strokeLinecap="round" />
          <Line x1={size - pad} y1={pad} x2={pad} y2={size - pad} stroke={seatStyle(0).color} strokeWidth={stroke} strokeLinecap="round" />
        </>
      ) : (
        <Circle cx={size / 2} cy={size / 2} r={size / 2 - pad} stroke={seatStyle(1).color} strokeWidth={stroke} fill="none" />
      )}
    </Svg>
  );
}

export function TicTacToeMatch({ state, match }: { state: MatchState; match: MatchController }) {
  const { width } = useWindowDimensions();
  const action = useEngineAction<Action>(state, match);
  const parsed = stateSchema.safeParse(state.match.state);
  if (!parsed.success) return <ErrorState message="État de partie illisible." onRetry={() => void match.query.refetch()} />;
  const game = parsed.data;
  const playable = canAct(state) && !action.pending;
  const size = Math.min(Math.floor((Math.min(width, 480) - 40 - 2 * 10) / 3), 120);

  return (
    <MatchShell
      state={state}
      match={match}
      title="MORPION"
      status={turnStatus(state, state.my_seat)}
      seatLabel={(seat) => MARK_LABELS[seat === 1 ? 1 : 0]}
      reasons={{ line: 'Trois alignés', full_board: 'Grille pleine' }}
      footer={
        <View style={styles.footer}>
          <Text variant="captionBold" color={colors.textSecondary}>
            Aligne 3 symboles
          </Text>
          <Text variant="overline" color={colors.textSecondary}>{`Coup ${game.moveCount}`}</Text>
        </View>
      }
    >
      <View style={styles.grid} accessibilityLabel={`Grille de morpion, ${game.moveCount} coups joués`}>
        {game.board.map((cell, index) => {
          const pending = action.pendingPayload?.cell === index && state.my_seat !== null;
          const mark = cell ?? (pending ? (state.my_seat as 0 | 1) : null);
          const winning = game.winLine?.includes(index) ?? false;
          return (
            <PressableScale
              key={index}
              testID={`ttt-cell-${index}`}
              accessibilityRole="button"
              accessibilityLabel={`Case ${index + 1}${cell === null ? ', libre' : `, ${MARK_LABELS[cell]}`}`}
              disabled={!playable || cell !== null}
              onPress={() => action.send({ type: 'place', cell: index })}
              style={[styles.cell, { width: size, height: size }, winning && styles.winning]}
            >
              {mark !== null ? (
                <View style={{ opacity: pending && cell === null ? 0.5 : 1 }}>
                  <Mark mark={mark} size={size * 0.8} />
                </View>
              ) : null}
            </PressableScale>
          );
        })}
      </View>
    </MatchShell>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, width: '100%', justifyContent: 'center', alignSelf: 'center', maxWidth: 400 },
  cell: { borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'transparent' },
  winning: { borderColor: colors.mint },
  footer: { flexDirection: 'row', justifyContent: 'space-between' },
});
