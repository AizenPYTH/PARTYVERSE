import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii, sizes } from '../tokens';
import { Icon, type IconName } from './Icon';
import { LoadingDots } from './LoadingDots';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'success' | 'reward' | 'ghost';
export type ButtonSize = 'L' | 'M' | 'S';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Defaults to the label. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  trailing?: ReactNode;
}

const palette: Record<ButtonVariant, { bg: string; fg: string; pressed: string; border?: string }> = {
  primary: { bg: colors.violet, fg: colors.white, pressed: colors.violetPressed },
  secondary: { bg: colors.elevated, fg: colors.textPrimary, pressed: colors.surface, border: colors.border },
  destructive: { bg: colors.coralSoft, fg: colors.coral, pressed: 'rgba(255,92,114,0.2)' },
  success: { bg: colors.mintSoft, fg: colors.mint, pressed: 'rgba(62,230,168,0.22)' },
  reward: { bg: colors.amber, fg: colors.onAccent, pressed: '#F0A433' },
  ghost: { bg: 'transparent', fg: colors.violetText, pressed: colors.surface },
};

const heights: Record<ButtonSize, number> = { L: sizes.buttonL, M: sizes.buttonM, S: sizes.buttonS };
const radiusFor: Record<ButtonSize, number> = { L: radii.lg, M: radii.md, S: radii.sm };

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'L',
  icon,
  loading = false,
  disabled = false,
  style,
  accessibilityLabel,
  accessibilityHint,
  testID,
  trailing,
}: ButtonProps) {
  const tone = palette[variant];
  const inactive = disabled || loading;
  const background = disabled ? colors.elevated : tone.bg;
  const foreground = disabled ? colors.textDisabled : tone.fg;

  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          height: heights[size],
          borderRadius: radiusFor[size],
          paddingHorizontal: size === 'S' ? 14 : 24,
          backgroundColor: pressed && !inactive ? tone.pressed : background,
          borderWidth: tone.border && !disabled ? 1 : 0,
          borderColor: tone.border,
        },
        style,
      ]}
    >
      {loading ? (
        <LoadingDots color={foreground} />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} size={size === 'S' ? 16 : 18} color={foreground} strokeWidth={2.4} /> : null}
          <Text
            variant={variant === 'reward' ? 'buttonSm' : size === 'L' ? 'button' : 'buttonSm'}
            color={foreground}
            style={variant === 'reward' ? styles.rewardLabel : undefined}
            numberOfLines={1}
          >
            {label}
          </Text>
          {trailing}
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rewardLabel: { fontFamily: 'Manrope_800ExtraBold' },
});
