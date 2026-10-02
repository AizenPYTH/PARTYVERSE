import { StyleSheet, View } from 'react-native';

import { colors } from '../tokens';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Skeleton } from './Skeleton';
import { Text } from './Text';

export function EmptyState({
  icon = 'search',
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.container} accessibilityRole="summary">
      <View style={styles.iconWrap}>
        <Icon name={icon} size={26} color={colors.textSecondary} />
      </View>
      <Text variant="section" align="center">
        {title}
      </Text>
      {message ? (
        <Text variant="body" color={colors.textSecondary} align="center">
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} size="M" /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={[styles.container, styles.error]} accessibilityRole="alert">
      <Text variant="item" color={colors.coral} align="center">
        {message}
      </Text>
      {onRetry ? <Button label="Réessayer" variant="secondary" size="M" onPress={onRetry} /> : null}
    </View>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <View style={styles.skeletonList} accessibilityLabel="Chargement">
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={styles.skeletonRow}>
          <Skeleton width={48} height={48} radius={24} />
          <View style={styles.skeletonText}>
            <Skeleton width="60%" height={14} />
            <Skeleton width="35%" height={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 12, paddingVertical: 28, paddingHorizontal: 16 },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { backgroundColor: colors.coralSoft, borderRadius: 18 },
  skeletonList: { gap: 16 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skeletonText: { flex: 1, gap: 8 },
});
