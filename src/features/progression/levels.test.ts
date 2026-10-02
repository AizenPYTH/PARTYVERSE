import { levelForXp, levelProgress, xpForLevel } from './levels';

describe('level curve (mirrors app_private.xp_for_level)', () => {
  it('matches the server formula', () => {
    expect([1, 2, 3, 4, 5, 10].map(xpForLevel)).toEqual([0, 100, 250, 450, 700, 2700]);
  });

  it('computes levels and progress', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(130)).toBe(2);
    expect(levelProgress(130)).toEqual({ level: 2, current: 30, span: 150, remaining: 120, ratio: 0.2 });
  });
});
