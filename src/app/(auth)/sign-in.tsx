import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Pressable, StyleSheet, View } from 'react-native';

import { ControlledTextField } from '@/components/ControlledTextField';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, ErrorState, Screen, Text, colors } from '@/design-system';
import { signInSchema, type SignInValues } from '@/features/auth/schemas';
import { authService } from '@/features/auth/service';
import { toAppError } from '@/lib/errors';

export default function SignInScreen() {
  const [submitError, setSubmitError] = useState<{ message: string; unconfirmed: boolean } | null>(null);
  const { control, handleSubmit, formState, getValues } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await authService.signIn(values.email, values.password);
      // The root guard switches to onboarding or the app once the session lands.
    } catch (error) {
      const appError = toAppError(error);
      setSubmitError({ message: appError.message, unconfirmed: appError.code === 'email_not_confirmed' });
    }
  });

  return (
    <Screen gap={20}>
      <ScreenHeader title="Connexion" />
      <Text variant="title">Bon retour !</Text>
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
          returnKeyType="next"
        />
        <ControlledTextField
          control={control}
          name="password"
          label="Mot de passe"
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
        />
        <Pressable accessibilityRole="link" onPress={() => router.push('/forgot-password')} hitSlop={8}>
          <Text variant="buttonSm" color={colors.violetText}>
            Mot de passe oublié ?
          </Text>
        </Pressable>
      </View>
      {submitError ? (
        <View style={styles.error}>
          <ErrorState message={submitError.message} />
          {submitError.unconfirmed ? (
            <Button
              label="Renvoyer l’e-mail de confirmation"
              variant="secondary"
              size="M"
              onPress={() =>
                authService
                  .resendConfirmation(getValues('email'))
                  .then(() => router.push({ pathname: '/check-email', params: { email: getValues('email') } }))
                  .catch((error: unknown) => setSubmitError({ message: toAppError(error).message, unconfirmed: false }))
              }
            />
          ) : null}
        </View>
      ) : null}
      <Button label="Se connecter" onPress={onSubmit} loading={formState.isSubmitting} testID="sign-in-submit" />
      <Pressable accessibilityRole="link" onPress={() => router.replace('/sign-up')} style={styles.switch}>
        <Text variant="caption" color={colors.textSecondary}>
          Pas encore de compte ? <Text variant="captionBold" color={colors.violetText}>Créer un compte</Text>
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
  error: { gap: 10 },
  switch: { alignItems: 'center', paddingVertical: 8 },
});
