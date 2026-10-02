/**
 * push-dispatch — runtime-independent core. Claims pending pushes from the
 * outbox, sends them to the Expo push service in chunks of 100 and reports
 * the result of each one (tokens Expo reports as unregistered get disabled).
 */
export interface PushJob {
  id: number;
  to: string;
  title: string;
  body: string;
  url: string;
  badge: number;
}

export interface PushResult {
  id: number;
  ok: boolean;
  error?: string;
  unregistered?: boolean;
}

export interface PushDatabase {
  claim(limit: number): Promise<PushJob[]>;
  complete(results: PushResult[]): Promise<number>;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK = 100;

export function toExpoMessage(job: PushJob) {
  return {
    to: job.to,
    title: job.title,
    body: job.body,
    data: { url: job.url },
    sound: 'default',
    badge: job.badge,
    channelId: 'default',
    priority: 'high',
  };
}

interface Ticket {
  status?: string;
  message?: string;
  details?: { error?: string };
}

/** Maps Expo tickets (same order as the request) to per-job results. */
export function readTickets(jobs: readonly PushJob[], response: unknown): PushResult[] {
  const tickets = (response as { data?: unknown } | null)?.data;
  return jobs.map((job, index) => {
    const ticket = (Array.isArray(tickets) ? tickets[index] : undefined) as Ticket | undefined;
    if (ticket?.status === 'ok') return { id: job.id, ok: true };
    const code = ticket?.details?.error ?? (ticket ? 'error' : 'missing_ticket');
    return { id: job.id, ok: false, error: `${code}${ticket?.message ? `: ${ticket.message}` : ''}`, unregistered: code === 'DeviceNotRegistered' };
  });
}

export async function dispatchPush(
  db: PushDatabase,
  fetchFn: FetchLike,
  options: { accessToken?: string; maxBatches?: number; endpoint?: string } = {},
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (let batch = 0; batch < (options.maxBatches ?? 5); batch++) {
    const jobs = await db.claim(CHUNK);
    if (jobs.length === 0) break;
    let results: PushResult[];
    try {
      const response = await fetchFn(options.endpoint ?? EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
        },
        body: JSON.stringify(jobs.map(toExpoMessage)),
      });
      results = response.ok ? readTickets(jobs, await response.json()) : jobs.map((job) => ({ id: job.id, ok: false, error: `http_${response.status}` }));
    } catch (error) {
      results = jobs.map((job) => ({ id: job.id, ok: false, error: `network: ${String((error as Error)?.message ?? error).slice(0, 120)}` }));
    }
    await db.complete(results);
    sent += results.filter((r) => r.ok).length;
    failed += results.filter((r) => !r.ok).length;
    if (jobs.length < CHUNK) break;
  }
  return { sent, failed };
}

/** Constant-time comparison for the dispatch secret. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
