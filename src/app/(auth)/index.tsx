import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Logo, Screen, Text, colors, tint } from '@/design-system';

const PILLARS = [
  { overline: 'PLAY TOGETHER', text: 'Lance une partie avec tes amis en quelques secondes.', hue: 245 },
  { overline: 'COMPETE', text: 'Classements par jeu, coups validés par le serveur.', hue: 295 },
  { overline: 'CONNECT', text: 'Amis, salons, invitations et présence en temps réel.', hue: 145 },
];

export default function WelcomeScreen() {
  return (
    <Screen
      gap={28}
      edges={['top', 'left', 'right', 'bottom']}
      footer={
        <View style={styles.actions}>
          <Button label="Créer un compte" onPress={() => router.push('/sign-up')} testID="welcome-sign-up" />
          <Button label="J’ai déjà un compte" variant="secondary" onPress={() => router.push('/sign-in')} />
        </View>
      }
    >
      <View style={styles.hero}>
        <Logo size={88} />
        <Text variant="wordmark">PARTYVERSE</Text>
        <Text variant="overline" color={colors.textTertiary}>
          PLAY TOGETHER. COMPETE. CONNECT.
        </Text>
      </View>
      <View style={styles.pillars}>
        {PILLARS.map((pillar) => (
          <View key={pillar.overline} style={styles.pillar}>
            <View style={[styles.dot, { backgroundColor: tint(pillar.hue).accent }]} />
            <View style={styles.pillarText}>
              <Text variant="overline" color={colors.violetText}>
                {pillar.overline}
              </Text>
              <Text variant="body" color={colors.textSecondary}>
                {pillar.text}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 16, paddingTop: 48 },
  pillars: { gap: 18 },
  pillar: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  pillarText: { flex: 1, gap: 4 },
  actions: { gap: 10 },
});
