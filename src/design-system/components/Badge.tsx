import { StyleSheet, View } from 'react-native';

import { withAlpha } from '../color';
import { colors, radii } from '../tokens';
import { Text } from './Text';

/** Coral counter badge (notifications, requests). */
export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={styles.count} accessibilityLabel={`${count}`}>
      <Text variant="tag" color={colors.onAccent} style={styles.countText}>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}

/** Uppercase label tag, accent at 14 % (ÉPIQUE, NOUVEAU). Solid when `solid`. */
export function Tag({ label, color, solid = false }: { label: string; color: string; solid?: boolean }) {
  return (
    <View style={[styles.tag, { backgroundColor: solid ? color : withAlpha(color, 0.14) }]}>
      <Text variant="tag" color={solid ? colors.onAccent : color}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

/** Pill shown on avatars (EN JEU, SALON, HÔTE). */
export function Pill({ label, color, textColor = colors.onAccent }: { label: string; color: string; textColor?: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: color }]}>
      <Text variant="tag" color={textColor} style={styles.pillText}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  count: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontSize: 10 },
  tag: { height: 24, borderRadius: radii.badge, paddingHorizontal: 8, justifyContent: 'center', alignSelf: 'flex-start' },
  pill: { height: 18, borderRadius: 9, paddingHorizontal: 7, justifyContent: 'center' },
  pillText: { fontSize: 9 },
});
