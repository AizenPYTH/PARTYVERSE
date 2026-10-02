import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { ControlledTextField } from '@/components/ControlledTextField';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, ErrorState, Screen, Text, colors } from '@/design-system';
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/features/auth/schemas';
import { authService } from '@/features/auth/service';
import { errorMessage } from '@/lib/errors';

export default function ForgotPasswordScreen() {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setSubmitError(null);
    try {
      await authService.sendPasswordReset(email);
      router.replace({ pathname: '/check-email', params: { email, reason: 'reset' } });
    } catch (error) {
      setSubmitError(errorMessage(error));
    }
  });

  return (
    <Screen gap={20}>
      <ScreenHeader title="Mot de passe oublié" />
      <View style={styles.intro}>
        <Text variant="title">Pas de panique</Text>
        <Text variant="body" color={colors.textSecondary}>
          Indique l’e-mail de ton compte : tu recevras un lien pour choisir un nouveau mot de passe.
        </Text>
      </View>
      <ControlledTextField
        control={control}
        name="email"
        label="E-mail"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        onSubmitEditing={onSubmit}
      />
      {submitError ? <ErrorState message={submitError} /> : null}
      <Button label="Envoyer le lien" onPress={onSubmit} loading={formState.isSubmitting} />
    </Screen>
  );
}

const styles = StyleSheet.create({ intro: { gap: 8 } });
