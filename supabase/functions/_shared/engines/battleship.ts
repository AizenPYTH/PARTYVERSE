import { createRng, type Rng } from './rng.ts';
import { numberSetting, type EngineContext, type GameEngine, type Seat, type SeatResult, type Transition } from './types.ts';

/**
 * Battleship on a 10×10 grid with the classic fleet.
 *
 * Hidden information: fleets live only in the server state and in each
 * player's private view. The public view holds shots and their results, the
 * ships already sunk, and every fleet once the game is over. Placements are
 * redacted from the move log.
 *
 * Phases: simultaneous placement (unplaced fleets are placed at random when
 * the placement clock runs out), then alternating shots.
 */
export const GRID = 10;

export const FLEET = [
  { id: 'carrier', size: 5, name: 'Porte-avions' },
  { id: 'battleship', size: 4, name: 'Cuirassé' },
  { id: 'cruiser', size: 3, name: 'Croiseur' },
  { id: 'submarine', size: 3, name: 'Sous-marin' },
  { id: 'destroyer', size: 2, name: 'Torpilleur' },
] as const;

export type ShipId = (typeof FLEET)[number]['id'];

export interface ShipPlacement {
  id: ShipId;
  row: number;
  col: number;
  vertical: boolean;
}

export interface Ship extends ShipPlacement {
  cells: number[];
}

export interface Shot {
  square: number;
  hit: boolean;
  /** Ship sunk by this shot. */
  sunk?: ShipId;
}

export interface BattleshipState {
  phase: 'placement' | 'battle' | 'finished';
  seed: string;
  fleets: [Ship[] | null, Ship[] | null];
  /** shots[seat] = shots fired BY seat at the other fleet. */
  shots: [Shot[], Shot[]];
  turn: Seat;
  placementEndsAt: number;
  placementSeconds: number;
  turnSeconds: number;
  autoPlaced: Seat[];
}

export type BattleshipAction = { type: 'place'; ships: ShipPlacement[] } | { type: 'fire'; square: number };

const TOTAL_CELLS = FLEET.reduce((sum, ship) => sum + ship.size, 0);
const sizeOf = (id: ShipId) => FLEET.find((ship) => ship.id === id)!.size;

export function shipCells(placement: ShipPlacement): number[] | null {
  const size = sizeOf(placement.id);
  const cells: number[] = [];
  for (let i = 0; i < size; i++) {
    const row = placement.row + (placement.vertical ? i : 0);
    const col = placement.col + (placement.vertical ? 0 : i);
    if (row < 0 || row >= GRID || col < 0 || col >= GRID) return null;
    cells.push(row * GRID + col);
  }
  return cells;
}

/** Validates a complete fleet: every ship exactly once, inside the grid, no overlap. */
export function buildFleet(placements: readonly ShipPlacement[]): Ship[] | null {
  if (placements.length !== FLEET.length) return null;
  const ids = new Set(placements.map((p) => p.id));
  if (ids.size !== FLEET.length || !FLEET.every((ship) => ids.has(ship.id))) return null;
  const used = new Set<number>();
  const ships: Ship[] = [];
  for (const placement of placements) {
    const cells = shipCells(placement);
    if (!cells || cells.some((cell) => used.has(cell))) return null;
    cells.forEach((cell) => used.add(cell));
    ships.push({ id: placement.id, row: placement.row, col: placement.col, vertical: placement.vertical, cells });
  }
  return ships;
}

/** Rng used for random fleets (exported so the app can offer the same shuffles). */
export const createFleetRng = (seed: string): Rng => createRng(seed);

export function randomFleet(rng: Rng): Ship[] {
  for (;;) {
    const placements: ShipPlacement[] = [];
    const used = new Set<number>();
    let ok = true;
    for (const { id } of FLEET) {
      let placed = false;
      for (let attempt = 0; attempt < 200 && !placed; attempt++) {
        const candidate = { id, row: rng.int(GRID), col: rng.int(GRID), vertical: rng.next() < 0.5 };
        const cells = shipCells(candidate);
        if (cells && !cells.some((cell) => used.has(cell))) {
          cells.forEach((cell) => used.add(cell));
          placements.push(candidate);
          placed = true;
        }
      }
      if (!placed) ok = false;
    }
    const fleet = ok ? buildFleet(placements) : null;
    if (fleet) return fleet;
  }
}

/** Ships of `fleet` fully hit by `shots`. */
export function sunkShips(fleet: readonly Ship[], shots: readonly Shot[]): Ship[] {
  const hits = new Set(shots.filter((shot) => shot.hit).map((shot) => shot.square));
  return fleet.filter((ship) => ship.cells.every((cell) => hits.has(cell)));
}

const hitsOf = (shots: readonly Shot[]) => shots.filter((shot) => shot.hit).length;

function placementStep(state: BattleshipState, now: number): Transition<BattleshipState> {
  const waiting = [0, 1].filter((seat) => state.fleets[seat as 0 | 1] === null);
  return { state, activeSeats: waiting, turnSeat: null, deadlineMs: Math.max(0, state.placementEndsAt - now) };
}

function battleStep(state: BattleshipState): Transition<BattleshipState> {
  return { state, activeSeats: [state.turn], turnSeat: state.turn, deadlineMs: state.turnSeconds * 1000 };
}

function results(state: BattleshipState, winner: Seat): SeatResult[] {
  return [0, 1].map((seat) => ({
    seat,
    result: seat === winner ? 'win' : 'loss',
    rank: seat === winner ? 1 : 2,
    score: hitsOf(state.shots[seat as 0 | 1]),
  }));
}

export const battleship: GameEngine<BattleshipState, BattleshipAction> = {
  id: 'battleship',
  minPlayers: 2,
  maxPlayers: 2,

  init(ctx: EngineContext) {
    const placementSeconds = numberSetting(ctx.settings, 'placement_seconds', 90);
    return placementStep(
      {
        phase: 'placement',
        seed: ctx.seed,
        fleets: [null, null],
        shots: [[], []],
        turn: 0,
        placementEndsAt: ctx.now + placementSeconds * 1000,
        placementSeconds,
        turnSeconds: numberSetting(ctx.settings, 'turn_seconds', 30),
        autoPlaced: [],
      },
      ctx.now,
    );
  },

  parseAction(raw) {
    if (typeof raw !== 'object' || raw === null) return null;
    const value = raw as Record<string, unknown>;
    if (value.type === 'fire') {
      return typeof value.square === 'number' && Number.isInteger(value.square) ? { type: 'fire', square: value.square } : null;
    }
    if (value.type !== 'place' || !Array.isArray(value.ships) || value.ships.length !== FLEET.length) return null;
    const ships: ShipPlacement[] = [];
    for (const item of value.ships as unknown[]) {
      if (typeof item !== 'object' || item === null) return null;
      const { id, row, col, vertical } = item as Record<string, unknown>;
      if (!FLEET.some((ship) => ship.id === id)) return null;
      if (!Number.isInteger(row) || !Number.isInteger(col) || typeof vertical !== 'boolean') return null;
      ships.push({ id: id as ShipId, row: row as number, col: col as number, vertical });
    }
    return { type: 'place', ships };
  },

  apply(state, seat, action, ctx) {
    if (seat !== 0 && seat !== 1) return { error: 'PV_NOT_A_PLAYER' };
    if (action.type === 'place') {
      if (state.phase !== 'placement') return { error: 'PV_INVALID_MOVE' };
      if (state.fleets[seat] !== null) return { error: 'PV_ALREADY_DONE' };
      const fleet = buildFleet(action.ships);
      if (!fleet) return { error: 'PV_INVALID_MOVE' };
      const fleets: BattleshipState['fleets'] = [state.fleets[0], state.fleets[1]];
      fleets[seat] = fleet;
      const log = { placed: seat };
      if (fleets[0] && fleets[1]) return { ...battleStep({ ...state, fleets, phase: 'battle' }), log };
      return { ...placementStep({ ...state, fleets }, ctx.now), log };
    }

    if (state.phase !== 'battle') return { error: 'PV_INVALID_MOVE' };
    if (seat !== state.turn) return { error: 'PV_NOT_YOUR_TURN' };
    if (action.square < 0 || action.square >= GRID * GRID) return { error: 'PV_INVALID_MOVE' };
    const mine = state.shots[seat];
    if (mine.some((shot) => shot.square === action.square)) return { error: 'PV_INVALID_MOVE' };
    const target = state.fleets[(1 - seat) as 0 | 1]!;
    const hitShip = target.find((ship) => ship.cells.includes(action.square));
    const shot: Shot = { square: action.square, hit: Boolean(hitShip) };
    const nextShots = [...mine, shot];
    if (hitShip && hitShip.cells.every((cell) => nextShots.some((s) => s.hit && s.square === cell))) shot.sunk = hitShip.id;
    const shots: BattleshipState['shots'] = seat === 0 ? [nextShots, state.shots[1]] : [state.shots[0], nextShots];
    const log = { square: action.square, hit: shot.hit, ...(shot.sunk ? { sunk: shot.sunk } : {}) };

    if (hitsOf(nextShots) === TOTAL_CELLS) {
      const finished: BattleshipState = { ...state, shots, phase: 'finished' };
      return {
        state: finished,
        activeSeats: [],
        turnSeat: null,
        deadlineMs: null,
        log,
        outcome: { outcome: 'win', reason: 'fleet_sunk', results: results(finished, seat) },
      };
    }
    return { ...battleStep({ ...state, shots, turn: 1 - seat }), log };
  },

  onTimeout(state) {
    if (state.phase === 'placement') {
      // Unplaced fleets are placed at random from the match seed, then the battle starts.
      const fleets: BattleshipState['fleets'] = [state.fleets[0], state.fleets[1]];
      const autoPlaced: Seat[] = [...state.autoPlaced];
      for (const seat of [0, 1] as const) {
        if (fleets[seat] === null) {
          fleets[seat] = randomFleet(createRng(`${state.seed}:fleet:${seat}`));
          autoPlaced.push(seat);
        }
      }
      return { ...battleStep({ ...state, fleets, autoPlaced, phase: 'battle' }), log: { auto_placed: autoPlaced } };
    }
    const finished: BattleshipState = { ...state, phase: 'finished' };
    return {
      state: finished,
      activeSeats: [],
      turnSeat: null,
      deadlineMs: null,
      outcome: { outcome: 'timeout', reason: 'timeout', results: results(finished, 1 - state.turn) },
    };
  },

  publicView(state) {
    const reveal = state.phase === 'finished';
    return {
      phase: state.phase,
      turn: state.turn,
      placed: [state.fleets[0] !== null, state.fleets[1] !== null],
      autoPlaced: state.autoPlaced,
      shots: state.shots,
      // sunk[seat] = ships of `seat` that are sunk (positions become public).
      sunk: [0, 1].map((seat) => {
        const fleet = state.fleets[seat as 0 | 1];
        if (!fleet) return [];
        return reveal ? fleet : sunkShips(fleet, state.shots[(1 - seat) as 0 | 1]);
      }),
      fleetSizes: FLEET.map((ship) => ship.size),
    };
  },

  privateView(state, seat) {
    const fleet = state.fleets[seat as 0 | 1];
    return fleet ? { fleet } : null;
  },

  redactAction(action) {
    return action.type === 'place' ? { type: 'place' } : action;
  },
};
