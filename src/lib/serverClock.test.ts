import { formatCountdown, msUntil, syncServerClock } from './serverClock';

describe('server clock', () => {
  it('corrects countdowns with the measured offset', () => {
    const now = Date.now();
    // Server is 10 s ahead of the device.
    syncServerClock(new Date(now + 10_000).toISOString(), now);
    const deadline = new Date(now + 40_000).toISOString();
    const remaining = msUntil(deadline)!;
    expect(remaining).toBeGreaterThan(29_000);
    expect(remaining).toBeLessThanOrEqual(30_000);
  });

  it('never returns negative durations', () => {
    expect(msUntil(new Date(0).toISOString())).toBe(0);
    expect(msUntil(null)).toBeNull();
  });

  it('formats m:ss', () => {
    expect(formatCountdown(48_000)).toBe('0:48');
    expect(formatCountdown(61_200)).toBe('1:02');
  });
});
