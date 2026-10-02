import { StyleSheet, View } from 'react-native';

import { Button, LoadingDots, Logo, Text, colors } from '@/design-system';

/** Shown while the session and profile load, or when that load failed. */
export function BootScreen({
  error,
  onRetry,
  retryLabel = 'Réessayer',
  onSignOut,
}: {
  error?: string;
  onRetry?: () => void;
  retryLabel?: string;
  onSignOut?: () => void;
}) {
  return (
    <View style={styles.root}>
      <Logo size={72} />
      <Text variant="wordmark">PARTYVERSE</Text>
      {error ? (
        <View style={styles.error}>
          <Text variant="body" color={colors.coral} align="center">
            {error}
          </Text>
          {onRetry ? <Button label={retryLabel} onPress={onRetry} size="M" /> : null}
          {onSignOut ? <Button label="Se déconnecter" variant="ghost" size="M" onPress={onSignOut} /> : null}
        </View>
      ) : (
        <LoadingDots color={colors.violetText} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: colors.midnight, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32 },
  error: { gap: 12, alignItems: 'center' },
});
