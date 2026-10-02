import { dispatchPush, readTickets, safeEqual, toExpoMessage, type FetchLike, type PushJob, type PushResult } from './handler';

const job = (id: number): PushJob => ({ id, to: `ExponentPushToken[abcdefghij${id}]`, title: 'Léo', body: 'Nouveau message privé.', url: '/messages/x', badge: 2 });

function fakeDb(batches: PushJob[][]) {
  const completed: PushResult[][] = [];
  return {
    completed,
    db: {
      claim: async () => batches.shift() ?? [],
      complete: async (results: PushResult[]) => {
        completed.push(results);
        return results.length;
      },
    },
  };
}

describe('push dispatch', () => {
  it('builds Expo messages with the deep link in data', () => {
    expect(toExpoMessage(job(1))).toMatchObject({ to: job(1).to, title: 'Léo', data: { url: '/messages/x' }, badge: 2, sound: 'default' });
  });

  it('maps tickets, flagging unregistered devices', () => {
    const results = readTickets([job(1), job(2), job(3)], {
      data: [{ status: 'ok', id: 't1' }, { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }],
    });
    expect(results).toEqual([
      { id: 1, ok: true },
      { id: 2, ok: false, error: 'DeviceNotRegistered: gone', unregistered: true },
      { id: 3, ok: false, error: 'missing_ticket', unregistered: false },
    ]);
  });

  it('sends claimed batches and reports every result', async () => {
    const { db, completed } = fakeDb([[job(1), job(2)]]);
    const calls: { body: string; headers: Record<string, string> }[] = [];
    const fetchFn: FetchLike = async (_url, init) => {
      calls.push(init);
      return { ok: true, status: 200, json: async () => ({ data: [{ status: 'ok' }, { status: 'ok' }] }) };
    };
    expect(await dispatchPush(db, fetchFn, { accessToken: 'secret' })).toEqual({ sent: 2, failed: 0 });
    expect(JSON.parse(calls[0]!.body)).toHaveLength(2);
    expect(calls[0]!.headers.Authorization).toBe('Bearer secret');
    expect(completed[0]).toEqual([{ id: 1, ok: true }, { id: 2, ok: true }]);
  });

  it('marks the batch failed on HTTP or network errors (retried later)', async () => {
    const http = fakeDb([[job(1)]]);
    await dispatchPush(http.db, async () => ({ ok: false, status: 503, json: async () => ({}) }));
    expect(http.completed[0]).toEqual([{ id: 1, ok: false, error: 'http_503' }]);
    const network = fakeDb([[job(2)]]);
    await dispatchPush(network.db, async () => {
      throw new Error('offline');
    });
    expect(network.completed[0]![0]).toMatchObject({ id: 2, ok: false, error: 'network: offline' });
  });

  it('compares secrets safely', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
