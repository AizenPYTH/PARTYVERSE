import { Chess, type Square } from 'chess.js';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { z } from 'zod';

import { Avatar, Button, ErrorState, PressableScale, Sheet, Text, colors } from '@/design-system';
import { useInterval } from '@/hooks/useInterval';
import { serverNow } from '@/lib/serverClock';
import { toFrenchSan } from '@engines/chess';

import type { MatchPlayer, MatchState } from '../../matches/api';
import { MatchShell } from '../../matches/components/MatchShell';
import { playerName, seatStyle, turnStatus } from '../../matches/presentation';
import { canAct, useEngineAction } from '../../matches/useEngineAction';
import type { MatchController } from '../../matches/useMatch';
import { displayNameOf, initialsFor } from '../../profile/avatars';
import { ChessBoard } from './ChessBoard';
import { formatClock, movePairs, remainingMs } from './clock';

const moveSchema = z.object({ from: z.string(), to: z.string(), promotion: z.string().optional(), san: z.string(), by: z.number() });
const stateSchema = z.object({
  moves: z.array(moveSchema),
  fen: z.string(),
  clocks: z.tuple([z.number(), z.number()]),
  incrementMs: z.number(),
  turnStartedAt: z.number(),
  timeControl: z.string(),
  drawOffer: z.number().nullable(),
});
type ChessView = z.infer<typeof stateSchema>;

type Action =
  | { type: 'move'; from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' }
  | { type: 'offer_draw' }
  | { type: 'accept_draw' }
  | { type: 'decline_draw' };

export const CHESS_REASONS: Record<string, string> = {
  checkmate: 'Échec et mat',
  stalemate: 'Pat',
  threefold_repetition: 'Triple répétition',
  fifty_moves: 'Règle des 50 coups',
  insufficient_material: 'Matériel insuffisant',
  agreement: 'Nulle par accord',
  timeout_vs_insufficient: 'Temps écoulé, mais matériel insuffisant pour mater',
};

const PROMOTIONS = [
  { piece: 'q', label: 'Dame' },
  { piece: 'r', label: 'Tour' },
  { piece: 'b', label: 'Fou' },
  { piece: 'n', label: 'Cavalier' },
] as const;

export function ChessMatch({ state, match }: { state: MatchState; match: MatchController }) {
  const action = useEngineAction<Action>(state, match);
  const [selected, setSelected] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [, tick] = useState(0);
  const active = state.match.status === 'active';
  useInterval(() => tick((n) => n + 1), active ? 200 : null);

  const parsed = stateSchema.safeParse(state.match.state);
  if (!parsed.success) return <ErrorState message="État de partie illisible." onRetry={() => void match.query.refetch()} />;
  const view = parsed.data;
  const mySeat = state.my_seat;
  const myColor = mySeat === 1 ? 'b' : 'w';
  const turn = view.moves.length % 2;
  const myTurn = canAct(state) && mySeat === turn && !action.pending;

  // Optimistic position while the server validates the move.
  const pending = action.pendingPayload?.type === 'move' ? action.pendingPayload : null;
  const display = new Chess(view.fen);
  if (pending) {
    try {
      display.move({ from: pending.from, to: pending.to, promotion: pending.promotion });
    } catch {
      // The server will reject it; keep the authoritative position.
    }
  }
  const lastMove = pending ?? view.moves.at(-1) ?? null;
  const targets: string[] = selected && myTurn ? new Chess(view.fen).moves({ square: selected as Square, verbose: true }).map((m) => m.to) : [];

  const press = (square: string) => {
    const game = new Chess(view.fen);
    const piece = game.get(square as Square);
    if (selected && targets.includes(square)) {
      const move = game.moves({ square: selected as Square, verbose: true }).find((m) => m.to === square);
      setSelected(null);
      if (move?.promotion) setPromotion({ from: selected, to: square });
      else action.send({ type: 'move', from: selected, to: square });
      return;
    }
    setSelected(piece && piece.color === myColor ? square : null);
  };

  const status = (() => {
    if (!active) return turnStatus(state, mySeat);
    if (view.drawOffer !== null && view.drawOffer !== mySeat && mySeat !== null) return { text: `${playerName(state, view.drawOffer)} propose la nulle`, color: colors.amber };
    const inCheck = new Chess(view.fen).inCheck();
    if (turn === mySeat) return { text: inCheck ? 'Échec ! À toi de jouer' : 'À toi de jouer', color: inCheck ? colors.coral : colors.violetText };
    return { text: `Trait aux ${turn === 0 ? 'Blancs' : 'Noirs'}${inCheck ? ' · échec' : ''}`, color: seatStyle(turn).text };
  })();

  const now = serverNow();
  const bySeat = (seat: number) => state.players.find((p) => p.seat === seat);
  const topSeat = (mySeat === 1 ? 0 : 1) as 0 | 1;
  const bottomSeat = (1 - topSeat) as 0 | 1;
  const sans = view.moves.map((m) => toFrenchSan(m.san));

  return (
    <MatchShell
      state={state}
      match={match}
      title={`ÉCHECS · ${view.timeControl.toUpperCase()}`}
      status={status}
      showTimer={false}
      hideHeader
      reasons={CHESS_REASONS}
      footer={
        <View style={styles.footer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moves}>
            {sans.length === 0 ? (
              <Text variant="caption" color={colors.textTertiary}>
                Les Blancs commencent.
              </Text>
            ) : (
              movePairs(sans).map((pair) => (
                <Text key={pair.number} variant="captionBold" color={colors.textSecondary}>
                  {`${pair.number}. ${pair.white}${pair.black ? ` ${pair.black}` : ''}`}
                </Text>
              ))
            )}
          </ScrollView>
          <View style={styles.actions}>
            <Button label="Historique" size="S" variant="secondary" onPress={() => setHistoryOpen(true)} />
            {active && mySeat !== null ? (
              view.drawOffer === null ? (
                <Button label="Proposer nulle" size="S" variant="secondary" onPress={() => action.send({ type: 'offer_draw' })} />
              ) : view.drawOffer === mySeat ? (
                <Text variant="caption" color={colors.textSecondary}>
                  Nulle proposée
                </Text>
              ) : (
                <>
                  <Button label="Refuser" size="S" variant="secondary" onPress={() => action.send({ type: 'decline_draw' })} />
                  <Button label="Accepter la nulle" size="S" onPress={() => action.send({ type: 'accept_draw' })} />
                </>
              )
            ) : null}
          </View>
        </View>
      }
    >
      <PlayerBar player={bySeat(topSeat)} seat={topSeat} view={view} now={now} running={active} you={mySeat === topSeat} />
      <ChessBoard
        fen={display.fen()}
        orientation={myColor}
        selected={selected}
        targets={targets}
        lastMove={lastMove}
        interactive={myTurn}
        onSquarePress={press}
      />
      <PlayerBar player={bySeat(bottomSeat)} seat={bottomSeat} view={view} now={now} running={active} you={mySeat === bottomSeat} />

      <Sheet visible={!!promotion} onClose={() => setPromotion(null)} title="Promotion">
        <View style={styles.promotions}>
          {PROMOTIONS.map((option) => (
            <Button
              key={option.piece}
              label={option.label}
              variant={option.piece === 'q' ? 'primary' : 'secondary'}
              size="M"
              onPress={() => {
                if (promotion) action.send({ type: 'move', from: promotion.from, to: promotion.to, promotion: option.piece });
                setPromotion(null);
              }}
            />
          ))}
        </View>
      </Sheet>
      <HistorySheet visible={historyOpen} onClose={() => setHistoryOpen(false)} view={view} orientation={myColor} />
    </MatchShell>
  );
}

function PlayerBar({ player, seat, view, now, running, you }: { player?: MatchPlayer; seat: 0 | 1; view: ChessView; now: number; running: boolean; you: boolean }) {
  const ms = remainingMs(view, seat, now, running);
  const onTurn = running && view.moves.length % 2 === seat;
  const name = player ? (you ? 'Toi' : displayNameOf(player)) : '—';
  return (
    <View style={[styles.bar, onTurn && { backgroundColor: seatStyle(seat).soft }]} accessibilityLabel={`${name}, ${seat === 0 ? 'Blancs' : 'Noirs'}, ${formatClock(ms)}`}>
      <Avatar size={32} hue={seat === 0 ? 260 : 75} initials={initialsFor(player ? displayNameOf(player) : '?')} />
      <View style={styles.flex}>
        <Text variant="itemSm" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="meta" color={colors.textSecondary}>
          {seat === 0 ? 'Blancs' : 'Noirs'}
          {player && !player.is_online ? ' · hors ligne' : ''}
        </Text>
      </View>
      <View style={[styles.clock, onTurn && styles.clockActive]}>
        <Text variant="score" color={ms < 10_000 ? colors.coral : onTurn ? colors.midnight : colors.textPrimary} style={styles.clockText}>
          {formatClock(ms)}
        </Text>
      </View>
    </View>
  );
}

function HistorySheet({ visible, onClose, view, orientation }: { visible: boolean; onClose: () => void; view: ChessView; orientation: 'w' | 'b' }) {
  const [ply, setPly] = useState<number | null>(null);
  const shown = ply ?? view.moves.length;
  const game = new Chess();
  for (const move of view.moves.slice(0, shown)) game.move({ from: move.from, to: move.to, promotion: move.promotion });
  const last = shown > 0 ? view.moves[shown - 1] : null;
  return (
    <Sheet visible={visible} onClose={onClose} title={`Historique · coup ${Math.ceil(shown / 2)}`}>
      <ChessBoard fen={game.fen()} orientation={orientation} lastMove={last} size={260} />
      <ScrollView style={styles.historyList} contentContainerStyle={styles.historyContent}>
        {view.moves.map((move, index) => (
          <PressableScale
            key={index}
            accessibilityRole="button"
            accessibilityLabel={`Coup ${index + 1} : ${toFrenchSan(move.san)}`}
            onPress={() => setPly(index + 1)}
            style={[styles.historyMove, index + 1 === shown && styles.historyMoveActive]}
          >
            <Text variant="captionBold" color={index + 1 === shown ? colors.midnight : colors.textPrimary}>
              {`${index % 2 === 0 ? `${index / 2 + 1}. ` : ''}${toFrenchSan(move.san)}`}
            </Text>
          </PressableScale>
        ))}
      </ScrollView>
      <View style={styles.actions}>
        <Button label="Début" size="S" variant="secondary" onPress={() => setPly(0)} />
        <Button label="◀" size="S" variant="secondary" onPress={() => setPly(Math.max(0, shown - 1))} />
        <Button label="▶" size="S" variant="secondary" onPress={() => setPly(Math.min(view.moves.length, shown + 1))} />
        <Button label="Position actuelle" size="S" onPress={() => setPly(null)} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  footer: { gap: 10 },
  moves: { gap: 12, alignItems: 'center', minHeight: 20 },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  promotions: { gap: 10 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 14 },
  flex: { flex: 1 },
  clock: { minWidth: 92, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: colors.surface },
  clockActive: { backgroundColor: colors.textPrimary },
  clockText: { fontVariant: ['tabular-nums'], fontSize: 20, lineHeight: 26 },
  historyList: { maxHeight: 140 },
  historyContent: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  historyMove: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.surface },
  historyMoveActive: { backgroundColor: colors.textPrimary },
});
