import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { z } from 'zod';

import { legalSquares } from '@engines/reversi';
import { boardColors, ErrorState, PressableScale, Text, colors, tint } from '@/design-system';

import type { MatchState } from '../../matches/api';
import { MatchShell } from '../../matches/components/MatchShell';
import { seatStyle, turnStatus } from '../../matches/presentation';
import { canAct, useEngineAction } from '../../matches/useEngineAction';
import type { MatchController } from '../../matches/useMatch';

const disc = z.union([z.literal(0), z.literal(1), z.null()]);
export const stateSchema = z.object({
  board: z.array(disc).length(64),
  turn: z.number(),
  lastFlips: z.array(z.number()),
  history: z.array(z.object({ seat: z.number(), square: z.number().nullable() })),
  counts: z.tuple([z.number(), z.number()]),
});

type Action = { type: 'place'; square: number };

export const DISC_LABELS = ['Violets', 'Ambres'] as const;
const COLUMNS = 'abcdefgh';
const squareName = (square: number) => `${COLUMNS[square % 8]}${Math.floor(square / 8) + 1}`;

export function ReversiMatch({ state, match }: { state: MatchState; match: MatchController }) {
  const { width } = useWindowDimensions();
  const action = useEngineAction<Action>(state, match);
  const parsed = stateSchema.safeParse(state.match.state);
  if (!parsed.success) return <ErrorState message="État de partie illisible." onRetry={() => void match.query.refetch()} />;
  const game = parsed.data;
  const mySeat = state.my_seat;
  const playable = canAct(state) && !action.pending && mySeat !== null;
  // Hints are display only: the server re-validates every placement.
  const hints = new Set(playable ? legalSquares(game.board, mySeat) : []);
  const lastMove = [...game.history].reverse().find((entry) => entry.square !== null)?.square ?? null;
  const lastPass = game.history.at(-1)?.square === null ? game.history.at(-1)?.seat : undefined;
  const cell = Math.floor((Math.min(width, 480) - 40 - 16) / 8);
  const palette = tint(160);

  return (
    <MatchShell
      state={state}
      match={match}
      title="REVERSI"
      status={turnStatus(state, mySeat)}
      seatLabel={(seat) => DISC_LABELS[seat === 1 ? 1 : 0]}
      scoreOf={(player) => game.counts[player.seat === 1 ? 1 : 0]}
      reasons={{ board_complete: 'Plus aucun coup possible' }}
      footer={
        <View style={styles.footer}>
          <Text variant="captionBold" color={colors.textSecondary}>
            {lastPass !== undefined
              ? `${DISC_LABELS[lastPass === 1 ? 1 : 0]} passent : aucun coup possible`
              : playable
                ? `${hints.size} coup${hints.size > 1 ? 's' : ''} possible${hints.size > 1 ? 's' : ''}`
                : 'Encadre les pions adverses'}
          </Text>
          <Text variant="overline" color={colors.textSecondary}>{`${game.counts[0]} – ${game.counts[1]}`}</Text>
        </View>
      }
    >
      <View
        style={[styles.board, { backgroundColor: palette.deep, width: cell * 8 + 16, padding: 8 }]}
        accessibilityLabel={`Plateau de reversi, ${DISC_LABELS[0]} ${game.counts[0]}, ${DISC_LABELS[1]} ${game.counts[1]}`}
      >
        {game.board.map((value, square) => {
          const pending = action.pendingPayload?.square === square && mySeat !== null;
          const shown = value ?? (pending ? (mySeat as 0 | 1) : null);
          const hint = hints.has(square);
          return (
            <PressableScale
              key={square}
              testID={`reversi-${square}`}
              accessibilityRole="button"
              accessibilityLabel={`${squareName(square)}${value === null ? (hint ? ', coup possible' : ', libre') : `, ${DISC_LABELS[value]}`}`}
              disabled={!hint}
              onPress={() => action.send({ type: 'place', square })}
              style={[styles.cell, { width: cell, height: cell, borderColor: palette.card }]}
            >
              {square === lastMove ? <View style={[StyleSheet.absoluteFill, { backgroundColor: boardColors.lastMove }]} /> : null}
              {shown !== null ? (
                <View
                  style={[
                    styles.disc,
                    {
                      width: cell * 0.78,
                      height: cell * 0.78,
                      borderRadius: cell * 0.39,
                      backgroundColor: seatStyle(shown).color,
                      opacity: pending && value === null ? 0.5 : 1,
                    },
                    game.lastFlips.includes(square) && styles.flipped,
                  ]}
                />
              ) : hint ? (
                <View style={[styles.hint, { width: cell * 0.26, height: cell * 0.26, borderRadius: cell * 0.13 }]} />
              ) : null}
            </PressableScale>
          );
        })}
      </View>
    </MatchShell>
  );
}

const styles = StyleSheet.create({
  board: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center', borderRadius: 16 },
  cell: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  disc: { borderWidth: 2, borderColor: colors.midnight },
  flipped: { borderColor: colors.textPrimary },
  hint: { backgroundColor: boardColors.hint },
  footer: { flexDirection: 'row', justifyContent: 'space-between' },
});
