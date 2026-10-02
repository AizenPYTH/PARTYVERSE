import { formatClock, movePairs, remainingMs } from './clock';

describe('chess clock display', () => {
  const state = { clocks: [180_000, 175_000] as [number, number], turnStartedAt: 10_000, moves: ['e4'] };

  it('counts down only the side to move', () => {
    expect(remainingMs(state, 1, 15_000, true)).toBe(170_000);
    expect(remainingMs(state, 0, 15_000, true)).toBe(180_000);
    expect(remainingMs(state, 1, 15_000, false)).toBe(175_000);
    expect(remainingMs(state, 1, 999_999, true)).toBe(0);
  });

  it('formats clocks with tenths under ten seconds', () => {
    expect(formatClock(183_000)).toBe('3:03');
    expect(formatClock(9_440)).toBe('9.4');
  });

  it('groups moves in pairs', () => {
    expect(movePairs(['e4', 'e5', 'Cf3'])).toEqual([
      { number: 1, white: 'e4', black: 'e5' },
      { number: 2, white: 'Cf3', black: undefined },
    ]);
  });
});
