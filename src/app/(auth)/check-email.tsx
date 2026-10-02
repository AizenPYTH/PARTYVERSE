import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Icon, Screen, Text, colors, useToast } from '@/design-system';
import { authService } from '@/features/auth/service';
import { errorMessage } from '@/lib/errors';

export default function CheckEmailScreen() {
  const { email, reason } = useLocalSearchParams<{ email?: string; reason?: string }>();
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const isReset = reason === 'reset';

  const resend = async () => {
    if (!email) return;
    setSending(true);
    try {
      if (isReset) await authService.sendPasswordReset(email);
      else await authService.resendConfirmation(email);
      toast.show({ message: 'E-mail renvoyé', tone: 'success' });
    } catch (error) {
      toast.show({ message: errorMessage(error), tone: 'error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen gap={20} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.icon}>
        <Icon name="messages" size={34} color={colors.violetText} />
      </View>
      <Text variant="title" align="center">
        Vérifie ta boîte mail
      </Text>
      <Text variant="body" color={colors.textSecondary} align="center">
        {isReset
          ? `Si un compte existe pour ${email ?? 'cette adresse'}, un lien de réinitialisation vient d’être envoyé.`
          : `Un lien de confirmation a été envoyé à ${email ?? 'ton adresse'}. Ouvre-le sur ce téléphone pour activer ton compte.`}
      </Text>
      <Button label="Renvoyer l’e-mail" variant="secondary" onPress={resend} loading={sending} disabled={!email} />
      <Button label="Retour à la connexion" variant="ghost" onPress={() => router.replace('/sign-in')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  icon: {
    alignSelf: 'center',
    marginTop: 48,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.violetSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
