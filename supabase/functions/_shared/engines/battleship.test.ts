import { battleship, buildFleet, FLEET, GRID, randomFleet, shipCells, type BattleshipState, type ShipPlacement } from './battleship';
import { createRng } from './rng';
import { attempt, ctx, play } from './testing';
import type { Transition } from './types';

// One ship per row, from column 0.
const ROWS: ShipPlacement[] = FLEET.map((ship, row) => ({ id: ship.id, row, col: 0, vertical: false }));
const COLUMNS: ShipPlacement[] = FLEET.map((ship, col) => ({ id: ship.id, row: 0, col, vertical: true }));

function placed(): Transition<BattleshipState> {
  let t = battleship.init(ctx({ settings: { placement_seconds: 60, turn_seconds: 20 } }));
  t = play(battleship, t, 0, { type: 'place', ships: ROWS });
  return play(battleship, t, 1, { type: 'place', ships: COLUMNS });
}

describe('battleship engine', () => {
  it('validates fleets', () => {
    expect(buildFleet(ROWS)).toHaveLength(5);
    expect(shipCells({ id: 'carrier', row: 0, col: 6, vertical: false })).toBeNull();
    expect(buildFleet(ROWS.slice(1))).toBeNull();
    expect(buildFleet([...ROWS.slice(0, 4), { ...ROWS[0]!, row: 9 }])).toBeNull();
    // Overlap: the destroyer crosses the carrier.
    expect(buildFleet([...ROWS.slice(0, 4), { id: 'destroyer', row: 0, col: 1, vertical: true }])).toBeNull();
    for (const seed of ['a', 'b', 'c', 'd']) expect(buildFleet(randomFleet(createRng(seed)))).not.toBeNull();
  });

  it('places simultaneously, keeping the shared placement deadline', () => {
    const t0 = battleship.init(ctx({ settings: { placement_seconds: 60 } }));
    expect(t0).toMatchObject({ activeSeats: [0, 1], turnSeat: null, deadlineMs: 60_000 });
    const t1 = play(battleship, t0, 1, { type: 'place', ships: COLUMNS }, ctx({ now: 1_010_000 }));
    expect(t1).toMatchObject({ activeSeats: [0], deadlineMs: 50_000 });
    expect(attempt(battleship, t1, 1, { type: 'place', ships: COLUMNS })).toBe('PV_ALREADY_DONE');
    expect(attempt(battleship, t1, 0, { type: 'fire', square: 0 })).toBe('PV_INVALID_MOVE');
    const t2 = play(battleship, t1, 0, { type: 'place', ships: ROWS });
    expect(t2).toMatchObject({ activeSeats: [0], turnSeat: 0, deadlineMs: 30_000 });
    expect(t2.state.phase).toBe('battle');
  });

  it('never exposes an unsunk fleet publicly, nor placements in the log', () => {
    const t = placed();
    const view = JSON.stringify(battleship.publicView(t.state));
    expect(view).not.toContain('cells');
    expect(battleship.privateView(t.state, 0)).toEqual({ fleet: buildFleet(ROWS) });
    expect(battleship.redactAction!({ type: 'place', ships: ROWS })).toEqual({ type: 'place' });
  });

  it('alternates shots, reports hits and sinks, and wins when the fleet is gone', () => {
    let t = placed();
    expect(attempt(battleship, t, 1, { type: 'fire', square: 0 })).toBe('PV_NOT_YOUR_TURN');
    // Seat 1's destroyer is vertical at column 4: squares 4 and 14.
    t = play(battleship, t, 0, { type: 'fire', square: 4 });
    expect(t.log).toEqual({ square: 4, hit: true });
    expect(attempt(battleship, t, 1, { type: 'fire', square: GRID * GRID })).toBe('PV_INVALID_MOVE');
    t = play(battleship, t, 1, { type: 'fire', square: 99 });
    expect(t.log).toEqual({ square: 99, hit: false });
    expect(attempt(battleship, t, 0, { type: 'fire', square: 4 })).toBe('PV_INVALID_MOVE');
    t = play(battleship, t, 0, { type: 'fire', square: 14 });
    expect(t.log).toEqual({ square: 14, hit: true, sunk: 'destroyer' });
    const view = battleship.publicView(t.state) as { sunk: { id: string }[][] };
    expect(view.sunk[1]!.map((ship) => ship.id)).toEqual(['destroyer']);

    const targets = buildFleet(COLUMNS)!.flatMap((ship) => ship.cells).filter((cell) => cell !== 4 && cell !== 14);
    const misses = Array.from({ length: 30 }, (_, i) => 99 - i);
    targets.forEach((square, index) => {
      t = play(battleship, t, 1, { type: 'fire', square: misses[index + 1]! });
      t = play(battleship, t, 0, { type: 'fire', square });
    });
    expect(t.outcome).toMatchObject({ outcome: 'win', reason: 'fleet_sunk' });
    expect(t.outcome?.results[0]).toMatchObject({ seat: 0, result: 'win', score: 17 });
    const final = battleship.publicView(t.state) as { sunk: unknown[][] };
    expect(final.sunk[0]).toHaveLength(5);
  });

  it('places missing fleets at random when the placement clock expires', () => {
    let t = battleship.init(ctx({ seed: 'match-seed' }));
    t = play(battleship, t, 0, { type: 'place', ships: ROWS });
    const timedOut = battleship.onTimeout(t.state, ctx());
    expect(timedOut.state.phase).toBe('battle');
    expect(timedOut.state.autoPlaced).toEqual([1]);
    expect(buildFleet(timedOut.state.fleets[1]!)).not.toBeNull();
    // Deterministic from the seed.
    expect(battleship.onTimeout(t.state, ctx()).state.fleets[1]).toEqual(timedOut.state.fleets[1]);
  });

  it('gives the win to the opponent when the shooter times out', () => {
    const t = battleship.onTimeout(placed().state, ctx());
    expect(t.outcome).toMatchObject({ outcome: 'timeout' });
    expect(t.outcome?.results.find((r) => r.result === 'win')?.seat).toBe(1);
  });
});
