import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '../tokens';

export type PresenceKind = 'online' | 'away' | 'dnd' | 'in_game' | 'in_lobby' | 'offline';

export const presenceColor: Record<PresenceKind, string> = {
  online: colors.mint,
  in_game: colors.violet,
  in_lobby: colors.amber,
  away: colors.textSecondary,
  dnd: colors.coral,
  offline: colors.midnight,
};

/** 14–16 px dot with a 3 px midnight border. Pulses only when asked. */
export function PresenceDot({ kind, size = 14, pulse = false }: { kind: PresenceKind; size?: number; pulse?: boolean }) {
  const reduceMotion = useReducedMotion();
  const halo = useSharedValue(0);

  useEffect(() => {
    if (!pulse || reduceMotion) return;
    halo.value = withRepeat(withTiming(1, { duration: 1200 }), -1, true);
  }, [halo, pulse, reduceMotion]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - halo.value),
    transform: [{ scale: 1 + halo.value * 0.7 }],
  }));

  return (
    <View style={{ width: size, height: size }}>
      {pulse ? (
        <Animated.View
          style={[
            { position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: presenceColor[kind] },
            haloStyle,
          ]}
        />
      ) : null}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: presenceColor[kind],
          borderWidth: 3,
          borderColor: kind === 'offline' ? colors.textDisabled : colors.midnight,
        }}
      />
    </View>
  );
}
