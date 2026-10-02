import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, Screen, Text, TextField, colors } from '@/design-system';
import { useLobbyNavigation } from '@/features/lobbies/useLobbyNavigation';

const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

export default function JoinLobbyScreen() {
  const [code, setCode] = useState('');
  const lobbyNav = useLobbyNavigation();
  const normalized = code.trim().toUpperCase();
  const valid = CODE_PATTERN.test(normalized);

  return (
    <Screen gap={20}>
      <ScreenHeader title="Rejoindre un salon" />
      <View style={styles.intro}>
        <Text variant="title">Entre le code</Text>
        <Text variant="body" color={colors.textSecondary}>
          Le code de 6 caractères est affiché dans le salon de ton ami.
        </Text>
      </View>
      <TextField
        label="Code du salon"
        value={code}
        onChangeText={(value) => setCode(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
        placeholder="K7Q2XM"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={6}
        error={normalized.length === 6 && !valid ? 'Ce code contient des caractères impossibles (0, O, 1, I).' : undefined}
        onSubmitEditing={() => valid && void lobbyNav.joinByCode(normalized)}
        testID="join-code"
      />
      <Button
        label="Rejoindre"
        disabled={!valid}
        loading={lobbyNav.pending === `code:${normalized}`}
        onPress={() => void lobbyNav.joinByCode(normalized)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({ intro: { gap: 8 } });
