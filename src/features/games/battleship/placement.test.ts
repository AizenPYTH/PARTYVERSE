import { buildFleet } from '@engines/battleship';

import { moveShip, randomPlacements, rotateShip, shipAt } from './placement';

describe('battleship placement editing', () => {
  const fleet = [
    { id: 'carrier', row: 0, col: 0, vertical: false },
    { id: 'battleship', row: 1, col: 0, vertical: false },
    { id: 'cruiser', row: 2, col: 0, vertical: false },
    { id: 'submarine', row: 3, col: 0, vertical: false },
    { id: 'destroyer', row: 4, col: 0, vertical: false },
  ] as const;

  it('generates valid random fleets', () => {
    expect(buildFleet(randomPlacements('x'))).not.toBeNull();
    expect(randomPlacements('x')).toEqual(randomPlacements('x'));
  });

  it('moves and rotates ships only to valid spots', () => {
    const moved = moveShip([...fleet], 'destroyer', 99 - 1);
    expect(moved?.find((p) => p.id === 'destroyer')).toMatchObject({ row: 9, col: 8 });
    expect(moveShip([...fleet], 'destroyer', 99)).toBeNull();
    expect(moveShip([...fleet], 'destroyer', 1)).toBeNull();
    expect(rotateShip([...fleet], 'carrier')).toBeNull();
    expect(rotateShip([...fleet], 'destroyer')?.find((p) => p.id === 'destroyer')?.vertical).toBe(true);
    expect(shipAt([...fleet], 22)).toBe('cruiser');
    expect(shipAt([...fleet], 55)).toBeNull();
  });
});
