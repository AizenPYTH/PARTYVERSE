import { forwardRef, useState } from 'react';
import { Pressable, type PressableProps, type StyleProp, type View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { motion } from '../tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type StyleInput = StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleInput;
  /** 0.97 for buttons, 0.98 for large cards. */
  scaleTo?: number;
}

/** Press feedback shared by every tappable element: scale + 110 ms ease-out. */
export const PressableScale = forwardRef<View, PressableScaleProps>(function PressableScale(
  { scaleTo = motion.pressScale, style, onPressIn, onPressOut, ...rest },
  ref,
) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const [pressed, setPressed] = useState(false);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const resolved = typeof style === 'function' ? style({ pressed }) : style;

  return (
    <AnimatedPressable
      ref={ref}
      {...rest}
      onPressIn={(event) => {
        setPressed(true);
        if (!reduceMotion) scale.value = withTiming(scaleTo, { duration: motion.press });
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        scale.value = withTiming(1, { duration: motion.press });
        onPressOut?.(event);
      }}
      style={[resolved, animatedStyle]}
    />
  );
});
