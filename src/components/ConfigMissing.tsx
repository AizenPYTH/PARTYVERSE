import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Logo, Text, colors } from '@/design-system';

/**
 * Displayed when the Supabase environment variables are missing. The app does
 * not simulate a backend: it explains exactly what to configure.
 */
export function ConfigMissing({ missing }: { missing: string[] }) {
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Logo size={64} />
        <Text variant="title">Configuration requise</Text>
        <Text variant="body" color={colors.textSecondary}>
          PARTYVERSE a besoin d’un projet Supabase. Ajoute ces variables dans un fichier .env à la racine du projet, puis
          relance Expo :
        </Text>
        <Card bordered style={styles.card}>
          {missing.map((name) => (
            <Text key={name} variant="overline" color={colors.violetText} style={styles.mono}>
              {name}
            </Text>
          ))}
        </Card>
        <View style={styles.steps}>
          <Text variant="caption" color={colors.textSecondary}>
            1. Copie .env.example vers .env
          </Text>
          <Text variant="caption" color={colors.textSecondary}>
            2. Renseigne l’URL et la clé « anon » du projet (Supabase › Project Settings › API)
          </Text>
          <Text variant="caption" color={colors.textSecondary}>
            3. Applique les migrations : supabase db push
          </Text>
          <Text variant="caption" color={colors.textSecondary}>
            Détails : docs/setup.md
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.midnight },
  content: { padding: 24, gap: 16 },
  card: { gap: 8 },
  mono: { textTransform: 'none' },
  steps: { gap: 6 },
});
