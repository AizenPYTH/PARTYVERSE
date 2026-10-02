import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CountBadge, Icon, PressableScale, Text, colors, type IconName } from '@/design-system';

export interface TabBarItem {
  name: string;
  label: string;
  icon: IconName;
  badge?: number;
}

/**
 * Bottom navigation (design handoff): 5 items of 64 px, active = filled
 * violet icon + primary label, inactive = tertiary.
 */
export function TabBar({
  items,
  activeIndex,
  onSelect,
}: {
  items: TabBarItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]} accessibilityRole="tablist">
      {items.map((item, index) => {
        const active = index === activeIndex;
        return (
          <PressableScale
            key={item.name}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.badge ? `${item.label}, ${item.badge} nouveaux` : item.label}
            onPress={() => onSelect(index)}
            style={styles.item}
          >
            <View>
              <Icon name={item.icon} filled={active} color={active ? colors.violet : colors.textTertiary} />
              {item.badge ? (
                <View style={styles.badge}>
                  <CountBadge count={item.badge} />
                </View>
              ) : null}
            </View>
            <Text variant="metaBold" color={active ? colors.textPrimary : colors.textTertiary}>
              {item.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 10,
    paddingHorizontal: 8,
    backgroundColor: colors.navBackground,
    borderTopWidth: 1,
    borderTopColor: colors.elevated,
  },
  item: { width: 64, alignItems: 'center', gap: 4 },
  badge: { position: 'absolute', top: -4, right: -10 },
});
