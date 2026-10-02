import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { ControlledTextField } from '@/components/ControlledTextField';
import { Button, ErrorState, Screen, Text, colors, useToast } from '@/design-system';
import { resetPasswordSchema, type ResetPasswordValues } from '@/features/auth/schemas';
import { authService } from '@/features/auth/service';
import { errorMessage } from '@/lib/errors';

export default function ResetPasswordScreen() {
  const toast = useToast();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async ({ password }) => {
    setSubmitError(null);
    try {
      await authService.updatePassword(password);
      toast.show({ message: 'Mot de passe mis à jour', tone: 'success' });
    } catch (error) {
      setSubmitError(errorMessage(error));
    }
  });

  return (
    <Screen gap={20}>
      <View style={styles.intro}>
        <Text variant="title">Nouveau mot de passe</Text>
        <Text variant="body" color={colors.textSecondary}>
          Choisis un mot de passe que tu n’utilises nulle part ailleurs.
        </Text>
      </View>
      <ControlledTextField control={control} name="password" label="Nouveau mot de passe" secureTextEntry autoComplete="new-password" />
      <ControlledTextField control={control} name="confirm" label="Confirmer" secureTextEntry autoComplete="new-password" onSubmitEditing={onSubmit} />
      {submitError ? <ErrorState message={submitError} /> : null}
      <Button label="Enregistrer" onPress={onSubmit} loading={formState.isSubmitting} />
      <Button label="Annuler et me déconnecter" variant="ghost" onPress={() => void authService.signOut().catch(() => undefined)} />
    </Screen>
  );
}

const styles = StyleSheet.create({ intro: { gap: 8 } });
