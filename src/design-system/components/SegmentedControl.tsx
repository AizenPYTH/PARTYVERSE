import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii } from '../tokens';
import { CountBadge } from './Badge';
import { Text } from './Text';

export interface Segment<T extends string> {
  value: T;
  label: string;
  badge?: number;
}

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {segments.map((segment) => {
        const active = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={segment.badge ? `${segment.label}, ${segment.badge}` : segment.label}
            onPress={() => onChange(segment.value)}
            style={[styles.segment, active && styles.active]}
          >
            <Text variant="buttonSm" color={active ? colors.textPrimary : colors.textSecondary} numberOfLines={1}>
              {segment.label}
            </Text>
            {segment.badge ? <CountBadge count={segment.badge} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radii.md, padding: 4 },
  segment: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  active: { backgroundColor: colors.elevated },
});
