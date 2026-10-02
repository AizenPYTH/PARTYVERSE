import { StyleSheet, View } from 'react-native';

import { colors } from '../tokens';

export function ProgressBar({
  progress,
  height = 8,
  color = colors.violet,
  track = colors.border,
  accessibilityLabel,
}: {
  progress: number;
  height?: number;
  color?: string;
  track?: string;
  accessibilityLabel?: string;
}) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, { height, borderRadius: height / 2, backgroundColor: track }]}
    >
      <View style={{ width: `${clamped * 100}%`, height, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

const styles = StyleSheet.create({ track: { overflow: 'hidden', width: '100%' } });
