import { StyleSheet } from 'react-native';

import { colors } from '../tokens';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.chip, active ? styles.active : styles.inactive]}
    >
      <Text variant="buttonSm" color={active ? colors.onAccent : colors.textSecondary}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: { height: 34, borderRadius: 17, paddingHorizontal: 14, justifyContent: 'center' },
  active: { backgroundColor: colors.textPrimary },
  inactive: { borderWidth: 1, borderColor: colors.border },
});
