import { buildFleet, createFleetRng, GRID, randomFleet, shipCells, type ShipId, type ShipPlacement } from '@engines/battleship';

/** Fleet editing during the placement phase (display only; the server re-validates). */
export function randomPlacements(seed: string): ShipPlacement[] {
  return randomFleet(createFleetRng(seed)).map(({ id, row, col, vertical }) => ({ id, row, col, vertical }));
}

function replace(placements: readonly ShipPlacement[], next: ShipPlacement): ShipPlacement[] | null {
  const updated = placements.map((p) => (p.id === next.id ? next : p));
  return buildFleet(updated) ? updated : null;
}

/** Moves a ship so that its first cell is `square`; null when it would leave the grid or overlap. */
export function moveShip(placements: readonly ShipPlacement[], id: ShipId, square: number): ShipPlacement[] | null {
  const current = placements.find((p) => p.id === id);
  if (!current) return null;
  return replace(placements, { ...current, row: Math.floor(square / GRID), col: square % GRID });
}

/** Rotates a ship around its first cell; null when the rotated ship does not fit. */
export function rotateShip(placements: readonly ShipPlacement[], id: ShipId): ShipPlacement[] | null {
  const current = placements.find((p) => p.id === id);
  if (!current) return null;
  return replace(placements, { ...current, vertical: !current.vertical });
}

/** The ship occupying `square`, if any. */
export function shipAt(placements: readonly ShipPlacement[], square: number): ShipId | null {
  return placements.find((p) => shipCells(p)?.includes(square))?.id ?? null;
}
