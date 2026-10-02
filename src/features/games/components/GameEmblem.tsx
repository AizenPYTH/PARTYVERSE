import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text, colors, tint, withAlpha } from '@/design-system';

import { gameVisual, type EmblemKind } from '../registry';

export interface GameEmblemProps {
  gameId: string;
  height: number;
  width?: number | '100%';
  radius?: number;
  /** 1 = catalog tile (112 px). Small tiles (48–52 px) use ~0.45. */
  scale?: number;
  dimmed?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Provisional geometric emblems (design handoff "Assets"): they keep each
 * game's hue until final illustrations replace them.
 */
export function GameEmblem({ gameId, height, width = '100%', radius = 18, scale = 1, dimmed, style }: GameEmblemProps) {
  const visual = gameVisual(gameId);
  const palette = tint(visual.hue);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.base,
        { height, width, borderRadius: radius, backgroundColor: palette.card, opacity: dimmed ? 0.5 : 1 },
        style,
      ]}
    >
      <EmblemArt kind={visual.emblem} hue={visual.hue} scale={scale} />
    </View>
  );
}

function EmblemArt({ kind, hue, scale }: { kind: EmblemKind; hue: number; scale: number }) {
  const palette = tint(hue);
  const s = (value: number) => Math.round(value * scale);

  switch (kind) {
    case 'chess': {
      const square = Math.max(s(14), 6);
      return (
        <>
          <View style={[StyleSheet.absoluteFill, styles.wrapGrid]}>
            {Array.from({ length: 16 * 8 }, (_, i) => {
              const row = Math.floor(i / 16);
              const col = i % 16;
              return (
                <View
                  key={i}
                  style={{
                    width: square,
                    height: square,
                    backgroundColor: (row + col) % 2 === 0 ? palette.deep : palette.pattern,
                  }}
                />
              );
            })}
          </View>
          <Text style={{ fontSize: s(56), lineHeight: s(64), color: colors.textPrimary }} allowFontScaling={false}>
            ♞
          </Text>
        </>
      );
    }
    case 'dots': {
      const step = Math.max(s(22), 9);
      const dot = Math.max(s(14), 6);
      return (
        <View style={[StyleSheet.absoluteFill, styles.wrapGrid, { padding: s(4), gap: step - dot }]}>
          {Array.from({ length: 12 * 8 }, (_, i) => (
            <View key={i} style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: palette.emblem }} />
          ))}
        </View>
      );
    }
    case 'pool':
      return (
        <View style={[styles.row, { gap: s(4) }]}>
          {[colors.textPrimary, tint(75).emblem, colors.midnight].map((color) => (
            <View key={color} style={{ width: s(24), height: s(24), borderRadius: s(12), backgroundColor: color }} />
          ))}
        </View>
      );
    case 'golf':
      return (
        <View style={[styles.row, { alignItems: 'flex-end', gap: s(24), position: 'absolute', bottom: s(26) }]}>
          <View style={{ width: s(16), height: s(16), borderRadius: s(8), backgroundColor: colors.textPrimary }} />
          <View style={styles.flag}>
            <View style={{ width: Math.max(1, s(2)), height: s(48), backgroundColor: colors.textPrimary }} />
            <View
              style={{
                width: 0,
                height: 0,
                borderTopWidth: s(7),
                borderBottomWidth: s(7),
                borderLeftWidth: s(20),
                borderTopColor: 'transparent',
                borderBottomColor: 'transparent',
                borderLeftColor: colors.coral,
              }}
            />
          </View>
        </View>
      );
    case 'bomb':
      return (
        <View style={[styles.center, { width: s(58), height: s(58), borderRadius: s(29), backgroundColor: colors.midnight }]}>
          <Text variant="overline" color={palette.emblem} style={{ fontSize: Math.max(s(13), 7), letterSpacing: 0 }}>
            0:42
          </Text>
        </View>
      );
    case 'racers':
      return (
        <View style={[StyleSheet.absoluteFill, styles.racers]}>
          {Array.from({ length: 14 }, (_, i) => (
            <View key={i} style={{ width: s(4), height: '300%', backgroundColor: withAlpha('#ffffff', 0.14), marginRight: s(14) }} />
          ))}
        </View>
      );
    case 'mindlink':
      return (
        <View style={{ width: s(140), height: s(90) }}>
          <View
            style={{ position: 'absolute', right: 0, width: s(90), height: s(90), borderRadius: s(45), backgroundColor: palette.accent, opacity: 0.9 }}
          />
          <View
            style={{
              position: 'absolute',
              left: 0,
              width: s(90),
              height: s(90),
              borderRadius: s(45),
              borderWidth: Math.max(2, s(3)),
              borderColor: colors.textPrimary,
            }}
          />
        </View>
      );
    case 'impostor':
      return (
        <View style={[styles.row, { gap: s(8) }]}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={{
                width: s(26),
                height: s(26),
                borderRadius: s(13),
                backgroundColor: i === 2 ? colors.midnight : palette.emblem,
                borderWidth: i === 2 ? Math.max(1, s(2)) : 0,
                borderColor: palette.emblem,
              }}
            />
          ))}
        </View>
      );
    case 'quiz':
      return (
        <View style={[styles.quiz, { width: s(80), gap: s(8) }]}>
          {['A', 'B', 'C', 'D'].map((letter, i) => (
            <View
              key={letter}
              style={[
                styles.center,
                { width: s(36), height: s(30), borderRadius: s(8), backgroundColor: i === 0 ? tint(75).accent : withAlpha('#ffffff', 0.16) },
              ]}
            >
              <Text style={{ fontFamily: 'Manrope_800ExtraBold', fontSize: Math.max(s(14), 7) }} color={i === 0 ? colors.onAccent : colors.textPrimary}>
                {letter}
              </Text>
            </View>
          ))}
        </View>
      );
    case 'draw':
      return (
        <View
          style={[
            styles.center,
            { width: s(64), height: s(64), borderRadius: s(32), borderWidth: Math.max(2, s(3)), borderStyle: 'dashed', borderColor: palette.emblem },
          ]}
        >
          <View style={{ width: s(10), height: s(10), borderRadius: s(5), backgroundColor: colors.textPrimary }} />
        </View>
      );
  }
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  wrapGrid: { flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  flag: { flexDirection: 'row', alignItems: 'flex-start' },
  racers: { flexDirection: 'row', transform: [{ rotate: '-45deg' }, { scale: 1.6 }], alignItems: 'center', justifyContent: 'center' },
  quiz: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
});
