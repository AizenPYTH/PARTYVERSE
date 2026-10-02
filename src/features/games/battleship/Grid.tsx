import { StyleSheet, View } from 'react-native';

import { GRID } from '@engines/battleship';
import { boardColors, colors, PressableScale, tint } from '@/design-system';

export type CellMark = 'ship' | 'hit' | 'miss' | 'sunk' | 'selected' | 'invalid' | null;

export interface GridProps {
  size: number;
  marks: CellMark[];
  /** Ship cells overlaid on a mark (own fleet under enemy shots). */
  ships?: ReadonlySet<number>;
  onPress?: (square: number) => void;
  disabled?: (square: number) => boolean;
  label: string;
  testPrefix: string;
  describe: (square: number) => string;
}

const ROWS = 'ABCDEFGHIJ';
export const squareName = (square: number) => `${ROWS[Math.floor(square / GRID)]}${(square % GRID) + 1}`;

export function Grid({ size, marks, ships, onPress, disabled, label, testPrefix, describe }: GridProps) {
  const cell = Math.floor(size / GRID);
  const palette = tint(230);
  return (
    <View style={[styles.grid, { width: cell * GRID, height: cell * GRID, backgroundColor: palette.deep }]} accessibilityLabel={label}>
      {Array.from({ length: GRID * GRID }, (_, square) => {
        const mark = marks[square] ?? null;
        const ship = ships?.has(square) || mark === 'ship' || mark === 'selected' || mark === 'invalid';
        const isDisabled = !onPress || (disabled?.(square) ?? false);
        return (
          <PressableScale
            key={square}
            testID={`${testPrefix}-${square}`}
            accessibilityRole={onPress ? 'button' : undefined}
            accessibilityLabel={`${squareName(square)}, ${describe(square)}`}
            disabled={isDisabled}
            onPress={() => onPress?.(square)}
            style={[styles.cell, { width: cell, height: cell, borderColor: palette.card }]}
          >
            {ship ? (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  styles.ship,
                  mark === 'selected' && styles.selected,
                  mark === 'invalid' && styles.invalid,
                  mark === 'sunk' && styles.sunkShip,
                ]}
              />
            ) : null}
            {mark === 'sunk' && !ship ? <View style={[StyleSheet.absoluteFill, styles.sunkShip]} /> : null}
            {mark === 'hit' || mark === 'sunk' ? (
              <View style={[styles.hit, { width: cell * 0.5, height: cell * 0.5, borderRadius: cell * 0.25 }]} />
            ) : null}
            {mark === 'miss' ? <View style={[styles.miss, { width: cell * 0.2, height: cell * 0.2, borderRadius: cell * 0.1 }]} /> : null}
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center', borderRadius: 10, overflow: 'hidden' },
  cell: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  ship: { backgroundColor: colors.borderStrong, margin: 1, borderRadius: 3 },
  selected: { backgroundColor: colors.violet },
  invalid: { backgroundColor: colors.coral },
  sunkShip: { backgroundColor: boardColors.danger },
  hit: { backgroundColor: colors.coral },
  miss: { backgroundColor: colors.textTertiary },
});
