import { StyleSheet, View } from 'react-native';

import { colors, radii, sizes } from '../tokens';
import { CountBadge } from './Badge';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

export interface IconButtonProps {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  size?: number;
  tone?: 'elevated' | 'surface';
  badgeCount?: number;
  disabled?: boolean;
  testID?: string;
}

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  size = sizes.iconButton,
  tone = 'elevated',
  badgeCount,
  disabled,
  testID,
}: IconButtonProps) {
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={badgeCount ? `${accessibilityLabel}, ${badgeCount} non lus` : accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      hitSlop={size < 44 ? (44 - size) / 2 : undefined}
      style={[
        styles.base,
        { width: size, height: size, backgroundColor: tone === 'elevated' ? colors.elevated : colors.surface },
      ]}
    >
      <Icon name={icon} size={22} color={disabled ? colors.textDisabled : colors.textPrimary} />
      {badgeCount ? (
        <View style={styles.badge}>
          <CountBadge count={badgeCount} />
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 6, right: 6 },
});
