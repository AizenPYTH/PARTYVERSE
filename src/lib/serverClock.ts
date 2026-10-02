/**
 * Server clock offset. Turn deadlines are authoritative on the server; the
 * client only *displays* a countdown, corrected by the offset measured from
 * the `server_time` field of RPC responses.
 */
let offsetMs = 0;

export function syncServerClock(serverTimeIso: string, receivedAt = Date.now()): void {
  const serverTime = Date.parse(serverTimeIso);
  if (Number.isFinite(serverTime)) offsetMs = serverTime - receivedAt;
}

export function serverNow(): number {
  return Date.now() + offsetMs;
}

export function msUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const target = Date.parse(iso);
  return Number.isFinite(target) ? Math.max(0, target - serverNow()) : null;
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
