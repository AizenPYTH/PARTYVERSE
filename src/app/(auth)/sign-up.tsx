import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Pressable, StyleSheet, View } from 'react-native';

import { ControlledTextField } from '@/components/ControlledTextField';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, ErrorState, Screen, Text, colors } from '@/design-system';
import { signUpSchema, type SignUpValues } from '@/features/auth/schemas';
import { authService } from '@/features/auth/service';
import { errorMessage } from '@/lib/errors';

export default function SignUpScreen() {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: '', password: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      const { needsConfirmation } = await authService.signUp(values.email, values.password);
      if (needsConfirmation) router.replace({ pathname: '/check-email', params: { email: values.email } });
    } catch (error) {
      setSubmitError(errorMessage(error));
    }
  });

  return (
    <Screen gap={20}>
      <ScreenHeader title="Créer un compte" />
      <View style={styles.intro}>
        <Text variant="title">Rejoins l’univers</Text>
        <Text variant="body" color={colors.textSecondary}>
          Ton e-mail sert uniquement à te connecter et à récupérer ton compte. Il n’est jamais affiché.
        </Text>
      </View>
      <View style={styles.form}>
        <ControlledTextField
          control={control}
          name="email"
          label="E-mail"
          placeholder="nova@exemple.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
        />
        <ControlledTextField
          control={control}
          name="password"
          label="Mot de passe"
          hint="8 caractères minimum, avec une lettre et un chiffre"
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <ControlledTextField
          control={control}
          name="confirm"
          label="Confirmer le mot de passe"
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          onSubmitEditing={onSubmit}
        />
      </View>
      {submitError ? <ErrorState message={submitError} /> : null}
      <Button label="Créer mon compte" onPress={onSubmit} loading={formState.isSubmitting} testID="sign-up-submit" />
      <Pressable accessibilityRole="link" onPress={() => router.replace('/sign-in')} style={styles.switch}>
        <Text variant="caption" color={colors.textSecondary}>
          Déjà inscrit ? <Text variant="captionBold" color={colors.violetText}>Se connecter</Text>
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 8 },
  form: { gap: 16 },
  switch: { alignItems: 'center', paddingVertical: 8 },
});
