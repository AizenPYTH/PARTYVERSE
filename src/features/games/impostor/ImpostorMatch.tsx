import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';

import { MAX_CLUE_LENGTH } from '@engines/impostor';
import { Button, Card, ErrorState, PressableScale, Tag, Text, TextField, colors, radii, spacing } from '@/design-system';

import type { MatchState } from '../../matches/api';
import { MatchShell } from '../../matches/components/MatchShell';
import { playerName, seatStyle, turnStatus } from '../../matches/presentation';
import { canAct, useEngineAction } from '../../matches/useEngineAction';
import type { MatchController } from '../../matches/useMatch';
import { impostorStatus } from './presentation';

const clue = z.object({ seat: z.number(), round: z.number(), text: z.string().nullable() });

export const stateSchema = z.object({
  phase: z.enum(['clues', 'discussion', 'vote', 'guess', 'finished']),
  mode: z.enum(['word', 'blank']),
  order: z.array(z.number()),
  rounds: z.number(),
  round: z.number(),
  clues: z.array(clue),
  ready: z.array(z.boolean()),
  voted: z.array(z.boolean()),
  eliminated: z.number().nullable(),
  reveal: z
    .object({
      impostor: z.number(),
      civilianWord: z.string(),
      impostorWord: z.string().nullable(),
      votes: z.array(z.number().nullable()),
      guess: z.string().nullable(),
      winner: z.enum(['civilians', 'impostor']).nullable(),
    })
    .optional(),
});
const privateSchema = z.object({ word: z.string().nullable(), impostor: z.boolean(), vote: z.number().nullable() }).nullable();

type Action = { type: 'clue'; text: string } | { type: 'ready' } | { type: 'vote'; target: number } | { type: 'guess'; text: string };

export const IMPOSTOR_REASONS: Record<string, string> = {
  impostor_caught: 'L’imposteur a été démasqué',
  impostor_guessed: 'Démasqué, l’imposteur a deviné le mot',
  wrong_vote: 'Un innocent a été éliminé',
  tie_vote: 'Égalité au vote : l’imposteur s’échappe',
  impostor_left: 'L’imposteur a quitté la partie',
};

export function ImpostorMatch({ state, match }: { state: MatchState; match: MatchController }) {
  const action = useEngineAction<Action>(state, match);
  const [text, setText] = useState('');
  const [wordHidden, setWordHidden] = useState(false);
  const parsed = stateSchema.safeParse(state.match.state);
  const mine = privateSchema.safeParse(state.private_state ?? null);
  if (!parsed.success || !mine.success) return <ErrorState message="État de partie illisible." onRetry={() => void match.query.refetch()} />;

  const game = parsed.data;
  const secret = mine.data;
  const mySeat = state.my_seat;
  const active = state.match.status === 'active';
  const myTurn = canAct(state) && !action.pending;
  const present = state.players.filter((p) => !p.left);
  const name = (seat: number | null | undefined) => (seat === mySeat ? 'Toi' : playerName(state, seat));

  const submitText = (type: 'clue' | 'guess') => {
    const value = text.trim();
    if (!value) return;
    action.send({ type, text: value });
    setText('');
  };

  const status = active
    ? impostorStatus(game.phase, { myTurn, turnName: name(state.match.current_turn_seat), eliminatedName: name(game.eliminated) })
    : turnStatus(state, mySeat);

  return (
    <MatchShell
      state={state}
      match={match}
      title="IMPOSTOR"
      status={status}
      showTimer
      reasons={IMPOSTOR_REASONS}
    >
      <View style={styles.column}>
        {mySeat !== null && secret ? (
          <Card style={styles.secret}>
            <Text variant="overline" color={colors.textSecondary}>
              Ton mot secret
            </Text>
            {wordHidden ? (
              <Text variant="title" color={colors.textTertiary}>
                ••••••
              </Text>
            ) : secret.word ? (
              <Text variant="title" testID="impostor-word">
                {secret.word}
              </Text>
            ) : (
              <Text variant="titleSm" color={colors.coral} testID="impostor-word">
                Tu es l’imposteur : tu n’as pas de mot.
              </Text>
            )}
            <Button label={wordHidden ? 'Afficher' : 'Masquer'} variant="ghost" size="S" onPress={() => setWordHidden((v) => !v)} />
          </Card>
        ) : null}

        {game.reveal ? (
          <Card style={styles.reveal}>
            <Text variant="overline" color={colors.textSecondary}>
              Révélation
            </Text>
            <Text variant="titleSm">{`L’imposteur était ${name(game.reveal.impostor)}`}</Text>
            <Text variant="body" color={colors.textSecondary}>
              {`Mot des civils : ${game.reveal.civilianWord}`}
              {game.reveal.impostorWord ? ` · Mot de l’imposteur : ${game.reveal.impostorWord}` : ' · L’imposteur n’avait pas de mot'}
            </Text>
            {game.reveal.guess ? (
              <Text variant="body" color={colors.textSecondary}>{`Proposition de l’imposteur : « ${game.reveal.guess} »`}</Text>
            ) : null}
            {present.map((player) => {
              const target = game.reveal?.votes[player.seat];
              return (
                <Text key={player.seat} variant="caption" color={colors.textSecondary}>
                  {`${name(player.seat)} a voté ${target === null || target === undefined ? 'blanc' : `contre ${name(target)}`}`}
                </Text>
              );
            })}
          </Card>
        ) : null}

        <View style={styles.section}>
          <Text variant="overline" color={colors.textSecondary}>{`Indices · tour ${game.round}/${game.rounds}`}</Text>
          {game.clues.length === 0 ? (
            <Text variant="caption" color={colors.textTertiary}>
              Aucun indice pour l’instant.
            </Text>
          ) : (
            game.clues.map((entry, index) => (
              <View key={index} style={styles.clue}>
                <View style={[styles.dot, { backgroundColor: seatStyle(entry.seat).color }]} />
                <Text variant="itemSm" style={styles.clueName}>
                  {name(entry.seat)}
                </Text>
                <Text variant="body" color={entry.text ? colors.textPrimary : colors.textTertiary}>
                  {entry.text ?? 'Pas d’indice'}
                </Text>
              </View>
            ))
          )}
        </View>

        {active && game.phase === 'clues' && myTurn ? (
          <View style={styles.section}>
            <TextField
              label="Ton indice"
              value={text}
              onChangeText={setText}
              maxLength={MAX_CLUE_LENGTH}
              hint="Un mot ou deux, sans dire ton mot."
              testID="impostor-input"
              onSubmitEditing={() => submitText('clue')}
            />
            <Button testID="impostor-submit" label="Donner l’indice" disabled={!text.trim()} loading={action.pending} onPress={() => submitText('clue')} />
          </View>
        ) : null}

        {active && game.phase === 'discussion' && mySeat !== null ? (
          <View style={styles.section}>
            <Text variant="caption" color={colors.textSecondary}>
              Débattez dans le chat, puis passez au vote.
            </Text>
            <Button
              testID="impostor-ready"
              label={game.ready[mySeat] ? 'Prêt à voter' : 'Passer au vote'}
              variant={game.ready[mySeat] ? 'secondary' : 'primary'}
              disabled={!myTurn || game.ready[mySeat] === true}
              onPress={() => action.send({ type: 'ready' })}
            />
            <Text variant="caption" color={colors.textTertiary}>{`${game.ready.filter(Boolean).length}/${present.length} prêts`}</Text>
          </View>
        ) : null}

        {active && game.phase === 'vote' ? (
          <View style={styles.section}>
            <Text variant="caption" color={colors.textSecondary}>
              {secret?.vote !== null && secret?.vote !== undefined
                ? `Vote envoyé contre ${name(secret.vote)}. ${game.voted.filter(Boolean).length}/${present.length} votes.`
                : 'Qui est l’imposteur ? Ton vote reste secret jusqu’à la fin.'}
            </Text>
            {present
              .filter((player) => player.seat !== mySeat)
              .map((player) => {
                const chosen = secret?.vote === player.seat;
                return (
                  <PressableScale
                    key={player.seat}
                    testID={`impostor-vote-${player.seat}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: chosen }}
                    accessibilityLabel={`Voter contre ${name(player.seat)}`}
                    disabled={!myTurn || (secret?.vote ?? null) !== null}
                    onPress={() => action.send({ type: 'vote', target: player.seat })}
                    style={[styles.voteRow, chosen && styles.voteChosen]}
                  >
                    <View style={[styles.dot, { backgroundColor: seatStyle(player.seat).color }]} />
                    <Text variant="item" style={styles.clueName}>
                      {name(player.seat)}
                    </Text>
                    {game.voted[player.seat] ? <Tag label="A voté" color={colors.mint} /> : null}
                  </PressableScale>
                );
              })}
          </View>
        ) : null}

        {active && game.phase === 'guess' && myTurn ? (
          <View style={styles.section}>
            <TextField
              label="Devine le mot des civils"
              value={text}
              onChangeText={setText}
              maxLength={MAX_CLUE_LENGTH}
              testID="impostor-input"
              onSubmitEditing={() => submitText('guess')}
            />
            <Button testID="impostor-submit" label="Proposer" disabled={!text.trim()} loading={action.pending} onPress={() => submitText('guess')} />
          </View>
        ) : null}
      </View>
    </MatchShell>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: spacing.lg },
  secret: { alignItems: 'center', gap: spacing.xs },
  reveal: { gap: spacing.xs },
  section: { gap: spacing.sm },
  clue: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  clueName: { minWidth: 72 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  voteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
  },
  voteChosen: { borderColor: colors.violet, backgroundColor: colors.violetSoft },
});
