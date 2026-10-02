import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { colors, motion, tint } from '@/design-system';

import { COLUMNS, ROWS, canDrop, cellAt, isWinningCell, type ConnectFourState, type Seat } from './engine';
import { SEAT_STYLE } from './presentation';

const GAP = 4;
const PADDING = 12;

export interface BoardProps {
  state: ConnectFourState;
  interactive: boolean;
  onDrop: (column: number) => void;
  /** Optimistic token shown while the server confirms the move. */
  pending?: { column: number; row: number; seat: Seat } | null;
}

export function Board({ state, interactive, onDrop, pending }: BoardProps) {
  const { width } = useWindowDimensions();
  const boardWidth = Math.min(width - 40, 480);
  const cell = Math.floor((boardWidth - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS);

  return (
    <View
      style={[styles.board, { backgroundColor: tint(245).deep, width: cell * COLUMNS + GAP * (COLUMNS - 1) + PADDING * 2 }]}
      accessibilityLabel={`Plateau Connect Four, ${state.move_count} jetons joués`}
    >
      {Array.from({ length: COLUMNS }, (_, column) => {
        const playable = interactive && canDrop(state, column);
        const height = state.columns[column]?.length ?? 0;
        return (
          <Pressable
            key={column}
            accessibilityRole="button"
            accessibilityLabel={`Colonne ${column + 1}${canDrop(state, column) ? `, ${ROWS - height} places libres` : ', pleine'}`}
            accessibilityState={{ disabled: !playable }}
            disabled={!playable}
            onPress={() => onDrop(column)}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
              styles.column,
              { gap: GAP },
              playable && (pressed || hovered) && styles.columnActive,
            ]}
            testID={`c4-column-${column}`}
          >
            {Array.from({ length: ROWS }, (_, index) => {
              const row = ROWS - 1 - index;
              const seat = cellAt(state.columns, column, row);
              const isPending = pending?.column === column && pending.row === row;
              const isLast = state.last_move?.column === column && state.last_move.row === row;
              return (
                <View key={row} style={[styles.hole, { width: cell, height: cell, borderRadius: cell / 2 }]}>
                  {seat !== null || isPending ? (
                    <Token
                      seat={(seat ?? pending!.seat) as Seat}
                      size={cell}
                      winning={seat !== null && isWinningCell(state, column, row)}
                      dropFrom={isLast || isPending ? (ROWS - row) * (cell + GAP) : 0}
                      faded={isPending && seat === null}
                    />
                  ) : null}
                </View>
              );
            })}
          </Pressable>
        );
      })}
    </View>
  );
}

function Token({ seat, size, winning, dropFrom, faded }: { seat: Seat; size: number; winning: boolean; dropFrom: number; faded: boolean }) {
  const reduceMotion = useReducedMotion();
  const offset = useSharedValue(reduceMotion || dropFrom === 0 ? 0 : -dropFrom);

  useEffect(() => {
    if (reduceMotion || dropFrom === 0) return;
    // Gravity-like fall then a small 6 % bounce (design handoff).
    offset.value = withSequence(
      withTiming(0, { duration: motion.drop, easing: Easing.in(Easing.quad) }),
      withTiming(-size * 0.06, { duration: 70, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 70, easing: Easing.in(Easing.quad) }),
    );
  }, [dropFrom, offset, reduceMotion, size]);

  const animated = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  const style = SEAT_STYLE[seat];
  return (
    <Animated.View
      style={[
        styles.token,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: style.color, opacity: faded ? 0.6 : 1 },
        winning && styles.winning,
        animated,
      ]}
      accessibilityElementsHidden
    >
      {seat === 1 ? <View style={{ width: size * 0.4, height: size * 0.4, borderRadius: size * 0.2, backgroundColor: colors.midnight }} /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  board: {
    flexDirection: 'row',
    padding: PADDING,
    gap: GAP,
    borderRadius: 24,
    alignSelf: 'center',
    overflow: 'hidden',
  },
  column: { borderRadius: 12, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null) } as object,
  columnActive: { backgroundColor: 'rgba(255,255,255,0.08)' },
  hole: { backgroundColor: colors.midnight, alignItems: 'center', justifyContent: 'center' },
  token: { alignItems: 'center', justifyContent: 'center' },
  winning: { borderWidth: 3, borderColor: colors.mint },
});
