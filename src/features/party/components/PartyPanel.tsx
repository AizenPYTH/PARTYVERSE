import { StyleSheet, View } from 'react-native';

import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Button, Card, Tag, Text, colors, spacing } from '@/design-system';

import { displayNameOf } from '../../profile/avatars';
import type { PartyState } from '../api';
import { FORMAT_INFO, partyPhase, standingRanks, upcomingRound } from '../formats';

export interface PartyPanelProps {
  party: PartyState | undefined;
  isHost: boolean;
  userId: string | null;
  canStart: boolean;
  onSetup: () => void;
}

/** Party status in the room: standings, rounds played and what comes next. */
export function PartyPanel({ party, isHost, userId, canStart, onSetup }: PartyPanelProps) {
  const phase = partyPhase(party);
  if (phase === 'none' || !party) {
    if (!isHost) return null;
    return (
      <Card style={styles.card}>
        <Text variant="section">Mode Party</Text>
        <Text variant="caption" color={colors.textSecondary}>
          Enchaîne plusieurs jeux dans ce salon, avec un classement général.
        </Text>
        <Button label="Lancer une Party" variant="secondary" icon="play" testID="party-setup" disabled={!canStart} onPress={onSetup} />
      </Card>
    );
  }

  const next = upcomingRound(party);
  const ranks = standingRanks(party.standings.map((s) => s.points));
  const finished = phase === 'finished';
  return (
    <Card style={styles.card} testID="party-panel">
      <View style={styles.header}>
        <Text variant="section">{finished ? 'Party terminée' : `Party · manche ${Math.min(party.session.current_round + 1, party.session.rounds_total)}/${party.session.rounds_total}`}</Text>
        <Tag label={FORMAT_INFO[party.session.format].name} color={colors.violetText} />
      </View>
      {!finished && next ? (
        <Text variant="caption" color={colors.textSecondary}>{`Prochain jeu : ${next.name}`}</Text>
      ) : null}

      <View style={styles.list}>
        {party.standings.map((standing, index) => (
          <View key={standing.user_id} style={styles.row} accessibilityLabel={`${ranks[index]}e, ${displayNameOf(standing)}, ${standing.points} points`}>
            <Text variant="numeric" style={styles.rank} color={ranks[index] === 1 ? colors.amber : colors.textSecondary}>
              {ranks[index]}
            </Text>
            <PlayerAvatar player={standing} size={28} />
            <Text variant="itemSm" style={styles.flex} color={standing.user_id === userId ? colors.violetText : colors.textPrimary}>
              {displayNameOf(standing)}
            </Text>
            <Text variant="caption" color={colors.textSecondary}>{`${standing.wins} V`}</Text>
            <Text variant="itemSm">{`${standing.points} pts`}</Text>
          </View>
        ))}
      </View>

      {party.rounds.length ? (
        <View style={styles.rounds}>
          {party.rounds.map((round) => (
            <Text key={round.round} variant="caption" color={colors.textSecondary}>
              {`${round.round}. ${round.name} · ${
                round.status === 'skipped'
                  ? 'passée (nombre de joueurs)'
                  : round.status === 'pending'
                    ? 'à jouer'
                    : round.winners.length === 0
                      ? 'terminée'
                      : `gagnée par ${round.winners.map((id) => displayNameOf(party.standings.find((s) => s.user_id === id) ?? { username: null, display_name: null })).join(', ')}`
              }`}
            </Text>
          ))}
        </View>
      ) : null}

      {finished && isHost ? <Button label="Nouvelle Party" variant="secondary" disabled={!canStart} onPress={onSetup} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  list: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rank: { width: 20, textAlign: 'center' },
  flex: { flex: 1 },
  rounds: { gap: 2 },
});
