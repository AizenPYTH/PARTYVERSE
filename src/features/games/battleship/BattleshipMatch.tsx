import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { z } from 'zod';

import { FLEET, GRID, shipCells, type ShipId, type ShipPlacement } from '@engines/battleship';
import { Button, ErrorState, Tag, Text, colors, spacing } from '@/design-system';

import type { MatchState } from '../../matches/api';
import { MatchShell } from '../../matches/components/MatchShell';
import { playerName, turnStatus, type StatusLine } from '../../matches/presentation';
import { canAct, useEngineAction } from '../../matches/useEngineAction';
import type { MatchController } from '../../matches/useMatch';
import { Grid, type CellMark } from './Grid';
import { moveShip, randomPlacements, rotateShip, shipAt } from './placement';

const shipIds = FLEET.map((ship) => ship.id) as [ShipId, ...ShipId[]];
const ship = z.object({ id: z.enum(shipIds), cells: z.array(z.number()) });
const shot = z.object({ square: z.number(), hit: z.boolean(), sunk: z.enum(shipIds).optional() });

export const stateSchema = z.object({
  phase: z.enum(['placement', 'battle', 'finished']),
  turn: z.number(),
  placed: z.tuple([z.boolean(), z.boolean()]),
  autoPlaced: z.array(z.number()),
  shots: z.tuple([z.array(shot), z.array(shot)]),
  sunk: z.array(z.array(ship)),
});
const privateSchema = z.object({ fleet: z.array(ship) }).nullable();

type Action = { type: 'place'; ships: ShipPlacement[] } | { type: 'fire'; square: number };

const shipName = (id: ShipId) => FLEET.find((s) => s.id === id)?.name ?? id;
const newSeed = () => `${Date.now()}-${Math.random()}`;

export function BattleshipMatch({ state, match }: { state: MatchState; match: MatchController }) {
  const { width } = useWindowDimensions();
  const action = useEngineAction<Action>(state, match);
  const [placements, setPlacements] = useState<ShipPlacement[]>(() => randomPlacements(newSeed()));
  const [selectedShip, setSelectedShip] = useState<ShipId | null>(null);
  const parsed = stateSchema.safeParse(state.match.state);
  const mine = privateSchema.safeParse(state.private_state ?? null);
  if (!parsed.success || !mine.success) return <ErrorState message="État de partie illisible." onRetry={() => void match.query.refetch()} />;

  const game = parsed.data;
  const mySeat = state.my_seat;
  const me = mySeat === 1 ? 1 : 0;
  const other = 1 - me;
  const myFleet = mine.data?.fleet ?? null;
  const playable = canAct(state) && !action.pending;
  const big = Math.min(width - 40, 420);
  const small = Math.min(Math.floor(big * 0.62), 260);

  const status: StatusLine =
    game.phase === 'placement' && state.match.status === 'active'
      ? mySeat !== null && !game.placed[me]
        ? { text: 'Place ta flotte', color: colors.violetText }
        : { text: `${playerName(state, other)} place sa flotte…`, color: colors.textSecondary }
      : turnStatus(state, mySeat);

  // `sunk[seat]` lists the ships of `seat` that are public: the sunk ones,
  // or the whole fleet once the game is over.
  const marksFor = (defender: number, ownShips: ReadonlySet<number>) => {
    const shots = game.shots[1 - defender] ?? [];
    const hits = new Set(shots.filter((s) => s.hit).map((s) => s.square));
    const marks: CellMark[] = Array.from({ length: GRID * GRID }, () => null);
    for (const s of shots) marks[s.square] = s.hit ? 'hit' : 'miss';
    for (const revealed of game.sunk[defender] ?? []) {
      const down = revealed.cells.every((cell) => hits.has(cell));
      for (const cell of revealed.cells) if (down) marks[cell] = 'sunk';
      else if (!hits.has(cell) && !ownShips.has(cell)) marks[cell] = 'ship';
    }
    return marks;
  };
  const sunkCount = (defender: number) => {
    const hits = new Set((game.shots[1 - defender] ?? []).filter((s) => s.hit).map((s) => s.square));
    return (game.sunk[defender] ?? []).filter((revealed) => revealed.cells.every((cell) => hits.has(cell))).length;
  };
  const isSunk = (defender: number, id: ShipId) => {
    const hits = new Set((game.shots[1 - defender] ?? []).filter((s) => s.hit).map((s) => s.square));
    return (game.sunk[defender] ?? []).some((revealed) => revealed.id === id && revealed.cells.every((cell) => hits.has(cell)));
  };

  const ownCells = new Set((myFleet ?? []).flatMap((s) => s.cells));
  const enemyMarks = marksFor(other, new Set());
  const ownMarks = marksFor(me, ownCells);
  const fired = new Set(game.shots[me].map((s) => s.square));
  const remaining = (seat: number) => FLEET.length - sunkCount(seat);

  // ---------- Placement ----------
  if (game.phase === 'placement' && mySeat !== null && !game.placed[me] && state.match.status === 'active') {
    const marks: CellMark[] = Array.from({ length: GRID * GRID }, () => null);
    for (const placement of placements) {
      for (const cell of shipCells(placement) ?? []) marks[cell] = placement.id === selectedShip ? 'selected' : 'ship';
    }
    const onCell = (square: number) => {
      const occupant = shipAt(placements, square);
      if (selectedShip === null || (occupant !== null && occupant !== selectedShip)) {
        setSelectedShip(occupant);
        return;
      }
      if (occupant === selectedShip) {
        setSelectedShip(null);
        return;
      }
      const moved = moveShip(placements, selectedShip, square);
      if (moved) setPlacements(moved);
    };
    return (
      <MatchShell state={state} match={match} title="BATAILLE NAVALE" status={status}>
        <View style={styles.column}>
          <Text variant="caption" color={colors.textSecondary} style={styles.center}>
            {selectedShip
              ? `${shipName(selectedShip)} sélectionné : touche une case pour le déplacer.`
              : 'Touche un navire pour le déplacer ou le pivoter.'}
          </Text>
          <Grid
            size={big}
            marks={marks}
            onPress={playable ? onCell : undefined}
            label="Ta grille de placement"
            testPrefix="bs-place"
            describe={(square) => {
              const id = shipAt(placements, square);
              return id ? shipName(id) : 'eau';
            }}
          />
          <View style={styles.row}>
            <Button
              label="Pivoter"
              variant="secondary"
              size="M"
              disabled={selectedShip === null}
              onPress={() => {
                const rotated = selectedShip ? rotateShip(placements, selectedShip) : null;
                if (rotated) setPlacements(rotated);
              }}
            />
            <Button
              label="Aléatoire"
              variant="secondary"
              size="M"
              onPress={() => {
                setSelectedShip(null);
                setPlacements(randomPlacements(newSeed()));
              }}
            />
          </View>
          <Button
            testID="bs-confirm"
            label="Valider ma flotte"
            loading={action.pending}
            disabled={!playable}
            onPress={() => action.send({ type: 'place', ships: placements })}
          />
        </View>
      </MatchShell>
    );
  }

  // ---------- Waiting / battle / result ----------
  const myTurn = playable && game.phase === 'battle' && game.turn === me;
  return (
    <MatchShell
      state={state}
      match={match}
      title="BATAILLE NAVALE"
      status={status}
      seatLabel={(seat) => `${remaining(seat)} navire${remaining(seat) > 1 ? 's' : ''} à flot`}
      reasons={{ fleet_sunk: 'Flotte entièrement coulée' }}
      footer={
        game.autoPlaced.length > 0 ? (
          <Text variant="caption" color={colors.textSecondary}>
            {game.autoPlaced.includes(me) && mySeat !== null
              ? 'Ta flotte a été placée au hasard (temps écoulé).'
              : `Flotte de ${playerName(state, game.autoPlaced[0])} placée au hasard (temps écoulé).`}
          </Text>
        ) : null
      }
    >
      <View style={styles.column}>
        {game.phase === 'placement' ? (
          <Text variant="captionBold" color={colors.textSecondary} style={styles.center}>
            Flotte validée. La bataille commence dès que ton adversaire a placé la sienne.
          </Text>
        ) : (
          <>
            <Text variant="overline" color={colors.textSecondary}>
              {mySeat === null ? `Tirs de ${playerName(state, 0)}` : 'Flotte adverse'}
            </Text>
            <Grid
              size={big}
              marks={enemyMarks}
              onPress={myTurn ? (square) => action.send({ type: 'fire', square }) : undefined}
              disabled={(square) => fired.has(square)}
              label="Grille adverse"
              testPrefix="bs-fire"
              describe={(square) => {
                const mark = enemyMarks[square];
                if (mark === 'hit') return 'touché';
                if (mark === 'sunk') return 'coulé';
                if (mark === 'miss') return 'à l’eau';
                return myTurn ? 'tirer ici' : 'inconnue';
              }}
            />
            <View style={styles.chips}>
              {FLEET.map((s) => {
                const sunk = isSunk(other, s.id);
                return <Tag key={s.id} label={sunk ? `${s.name} coulé` : `${s.name} ${s.size}`} color={sunk ? colors.coral : colors.mint} />;
              })}
            </View>
          </>
        )}
        <Text variant="overline" color={colors.textSecondary}>
          {mySeat === null ? `Tirs de ${playerName(state, 1)}` : 'Ma flotte'}
        </Text>
        <Grid
          size={game.phase === 'placement' ? big : small}
          marks={ownMarks}
          ships={ownCells}
          label="Ma flotte"
          testPrefix="bs-own"
          describe={(square) => {
            const mark = ownMarks[square];
            if (mark === 'hit' || mark === 'sunk') return 'navire touché';
            if (mark === 'miss') return 'tir adverse à l’eau';
            return ownCells.has(square) ? 'navire' : 'eau';
          }}
        />
      </View>
    </MatchShell>
  );
}

const styles = StyleSheet.create({
  column: { gap: spacing.md, alignItems: 'center', width: '100%' },
  row: { flexDirection: 'row', gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'center' },
  center: { textAlign: 'center' },
});
