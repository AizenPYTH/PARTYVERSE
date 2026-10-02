import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '../tokens';
import { Text } from './Text';

export function SectionHeader({
  title,
  accent,
  actionLabel,
  onAction,
}: {
  title: string;
  /** Highlighted suffix, e.g. the online count in mint. */
  accent?: { text: string; color: string };
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.row}>
      <Text variant="section" accessibilityRole="header">
        {title}
        {accent ? <Text variant="section" color={accent.color}>{` · ${accent.text}`}</Text> : null}
      </Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={10}>
          <Text variant="buttonSm" color={colors.textSecondary}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
});
