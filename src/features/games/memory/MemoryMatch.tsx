import { StyleSheet, Text as RNText, View, useWindowDimensions } from 'react-native';
import { z } from 'zod';

import { ErrorState, PressableScale, Text, colors, radii, spacing, tint } from '@/design-system';

import type { MatchState } from '../../matches/api';
import { MatchShell } from '../../matches/components/MatchShell';
import { seatStyle, turnStatus } from '../../matches/presentation';
import { canAct, useEngineAction } from '../../matches/useEngineAction';
import type { MatchController } from '../../matches/useMatch';

export const stateSchema = z.object({
  cards: z.array(z.number().nullable()),
  matchedBy: z.array(z.number().nullable()),
  flipped: z.array(z.number()),
  lastMismatch: z.array(z.number()).nullable(),
  turn: z.number(),
  scores: z.array(z.number()),
  pairs: z.number(),
  moves: z.number(),
});

type Action = { type: 'flip'; card: number };

/** One glyph and hue per symbol (text presentation, never emoji). */
const SYMBOLS = ['★', '♦', '♣', '♠', '♥', '●', '▲', '■', '✚', '☾', '☀', '✿', '♪', '⚑', '✦', '❖', '⬟', '⬢'];
const SYMBOL_HUES = [295, 75, 160, 220, 10, 350, 50, 245, 120, 185, 30, 320, 270, 140, 95, 200, 5, 60];
const SYMBOL_NAMES = ['étoile', 'carreau', 'trèfle', 'pique', 'cœur', 'rond', 'triangle', 'carré', 'croix', 'lune', 'soleil', 'fleur', 'note', 'drapeau', 'éclat', 'losange', 'pentagone', 'hexagone'];

export function columnsFor(cards: number): number {
  return cards <= 24 ? 4 : 6;
}

export function MemoryMatch({ state, match }: { state: MatchState; match: MatchController }) {
  const { width } = useWindowDimensions();
  const action = useEngineAction<Action>(state, match);
  const parsed = stateSchema.safeParse(state.match.state);
  if (!parsed.success) return <ErrorState message="État de partie illisible." onRetry={() => void match.query.refetch()} />;
  const game = parsed.data;
  const playable = canAct(state) && !action.pending;
  const columns = columnsFor(game.cards.length);
  const gap = spacing.sm;
  const size = Math.floor((Math.min(width, 480) - 40 - gap * (columns - 1)) / columns);
  const found = game.matchedBy.filter((owner) => owner !== null).length / 2;

  return (
    <MatchShell
      state={state}
      match={match}
      title="MEMORY"
      status={turnStatus(state, state.my_seat)}
      scoreOf={(player) => game.scores[player.seat] ?? 0}
      reasons={{ all_pairs: 'Toutes les paires trouvées' }}
      footer={
        <View style={styles.footer}>
          <Text variant="captionBold" color={colors.textSecondary}>{`${found}/${game.pairs} paires trouvées`}</Text>
          <Text variant="overline" color={colors.textSecondary}>{`${game.moves} essais`}</Text>
        </View>
      }
    >
      <View style={[styles.grid, { gap, width: size * columns + gap * (columns - 1) }]} accessibilityLabel="Cartes du Memory">
        {game.cards.map((symbol, index) => {
          const pending = action.pendingPayload?.card === index;
          const owner = game.matchedBy[index] ?? null;
          const faceUp = symbol !== null;
          const palette = tint(SYMBOL_HUES[symbol ?? 0] ?? 270);
          const disabled = !playable || faceUp || game.flipped.includes(index);
          return (
            <PressableScale
              key={index}
              testID={`memory-card-${index}`}
              accessibilityRole="button"
              accessibilityLabel={`Carte ${index + 1}${faceUp ? `, ${SYMBOL_NAMES[symbol] ?? 'symbole'}` : ', face cachée'}${owner !== null ? ', paire trouvée' : ''}`}
              disabled={disabled}
              onPress={() => action.send({ type: 'flip', card: index })}
              style={[
                styles.card,
                { width: size, height: size * 1.2 },
                faceUp ? { backgroundColor: palette.card } : styles.back,
                owner !== null && { borderColor: seatStyle(owner).color },
                pending && styles.pending,
              ]}
            >
              {faceUp ? (
                <RNText allowFontScaling={false} style={[styles.symbol, { color: palette.emblem, fontSize: size * 0.48 }]}>
                  {`${SYMBOLS[symbol] ?? '?'}︎`}
                </RNText>
              ) : null}
            </PressableScale>
          );
        })}
      </View>
    </MatchShell>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center' },
  card: { borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  back: { backgroundColor: colors.elevated, borderColor: colors.border },
  pending: { borderColor: colors.violet },
  symbol: { textAlign: 'center', includeFontPadding: false },
  footer: { flexDirection: 'row', justifyContent: 'space-between' },
});
