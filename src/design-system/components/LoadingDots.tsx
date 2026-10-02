import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { colors } from '../tokens';

/** Three 6 px dots at 100 / 60 / 30 % opacity, animated in sequence. */
export function LoadingDots({ color = colors.white }: { color?: string }) {
  const reduceMotion = useReducedMotion();
  const phase = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    phase.value = withRepeat(withTiming(3, { duration: 900, easing: Easing.linear }), -1, false);
  }, [phase, reduceMotion]);

  return (
    <View style={styles.row} accessibilityLabel="Chargement" accessibilityRole="progressbar">
      {[0, 1, 2].map((index) => (
        <Dot key={index} index={index} phase={phase} color={color} animated={!reduceMotion} />
      ))}
    </View>
  );
}

const BASE_OPACITY = [1, 0.6, 0.3];

function Dot({
  index,
  phase,
  color,
  animated,
}: {
  index: number;
  phase: { value: number };
  color: string;
  animated: boolean;
}) {
  const style = useAnimatedStyle(() => {
    if (!animated) return { opacity: BASE_OPACITY[index] ?? 1 };
    const shifted = (Math.floor(phase.value) + index) % 3;
    return { opacity: BASE_OPACITY[shifted] ?? 1 };
  });
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
