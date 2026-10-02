import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, PressableScale, Sheet, Text, colors, radii, spacing } from '@/design-system';

import { isPlayable, type Game } from '../../games/catalog';
import { PARTY_FORMATS, type PartyFormat } from '../api';
import { FORMAT_INFO, ROUND_OPTIONS } from '../formats';

export interface PartySetupSheetProps {
  visible: boolean;
  onClose: () => void;
  games: Game[];
  players: number;
  busy: boolean;
  onStart: (format: PartyFormat, rounds: number, games: string[] | null) => void;
}

export function PartySetupSheet({ visible, onClose, games, players, busy, onStart }: PartySetupSheetProps) {
  const [format, setFormat] = useState<PartyFormat>('classic');
  const [rounds, setRounds] = useState<number>(5);
  const [picked, setPicked] = useState<string[]>([]);
  const fitting = games.filter((g) => isPlayable(g) && players >= g.min_players && players <= g.max_players);
  const custom = format === 'custom';
  const valid = custom ? picked.length >= 2 && picked.length <= 10 : true;

  return (
    <Sheet visible={visible} onClose={onClose} title="Nouvelle Party">
      <View style={styles.section}>
        {PARTY_FORMATS.map((id) => (
          <PressableScale
            key={id}
            testID={`party-format-${id}`}
            accessibilityRole="radio"
            accessibilityState={{ checked: format === id }}
            accessibilityLabel={FORMAT_INFO[id].name}
            onPress={() => setFormat(id)}
            style={[styles.option, format === id && styles.optionActive]}
          >
            <Text variant="item">{FORMAT_INFO[id].name}</Text>
            <Text variant="caption" color={colors.textSecondary}>
              {FORMAT_INFO[id].description}
            </Text>
          </PressableScale>
        ))}
      </View>

      {custom ? (
        <View style={styles.section}>
          <Text variant="caption" color={colors.textSecondary}>{`Jeux dans l’ordre (${picked.length}/10) — adaptés à ${players} joueurs`}</Text>
          <View style={styles.row}>
            {fitting.map((game) => (
              <Button
                key={game.id}
                label={game.name}
                size="S"
                variant="secondary"
                disabled={picked.length >= 10}
                onPress={() => setPicked((list) => [...list, game.id])}
              />
            ))}
          </View>
          {picked.length ? (
            <View style={styles.row}>
              {picked.map((id, index) => (
                <Button
                  key={`${id}-${index}`}
                  label={`${index + 1}. ${games.find((g) => g.id === id)?.name ?? id} ✕`}
                  size="S"
                  variant="primary"
                  accessibilityLabel={`Retirer ${games.find((g) => g.id === id)?.name ?? id}`}
                  onPress={() => setPicked((list) => list.filter((_, i) => i !== index))}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.section}>
          <Text variant="caption" color={colors.textSecondary}>
            Manches
          </Text>
          <View style={styles.row}>
            {ROUND_OPTIONS.map((count) => (
              <Button key={count} label={String(count)} size="S" variant={rounds === count ? 'primary' : 'secondary'} onPress={() => setRounds(count)} />
            ))}
          </View>
        </View>
      )}

      <Button
        testID="party-start"
        label="Lancer la Party"
        loading={busy}
        disabled={!valid}
        onPress={() => onStart(format, custom ? picked.length : rounds, custom ? picked : null)}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  option: { padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.elevated, borderWidth: 2, borderColor: 'transparent', gap: 2 },
  optionActive: { borderColor: colors.violet },
});
