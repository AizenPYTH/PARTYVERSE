/** Remaining time for a seat, given the server's clock state and server time. */
export function remainingMs(
  state: { clocks: [number, number]; turnStartedAt: number; moves: unknown[] },
  seat: 0 | 1,
  serverNowMs: number,
  running: boolean,
): number {
  const turn = state.moves.length % 2;
  const base = state.clocks[seat];
  if (!running || turn !== seat) return Math.max(0, base);
  return Math.max(0, base - Math.max(0, serverNowMs - state.turnStartedAt));
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  if (ms < 10_000) return (Math.max(0, ms) / 1000).toFixed(1);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${(total % 60).toString().padStart(2, '0')}`;
}

/** "1. e4 e5 2. Cf3" pairs from SAN moves. */
export function movePairs(sans: string[]): { number: number; white: string; black?: string }[] {
  const pairs: { number: number; white: string; black?: string }[] = [];
  for (let i = 0; i < sans.length; i += 2) pairs.push({ number: i / 2 + 1, white: sans[i]!, black: sans[i + 1] });
  return pairs;
}
