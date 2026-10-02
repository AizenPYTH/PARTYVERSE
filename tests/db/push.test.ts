import { pool, admin, asUser, createUser, expectError, makeFriends, rpc, type TestUser } from './helpers';

const token = (n: string) => `ExponentPushToken[device${n}xxxxxxxx]`;

async function asService<T>(sql: string, params: unknown[] = []): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('set local role service_role');
    const result = await client.query(sql, params);
    await client.query('commit');
    return result.rows[0]?.value as T;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

interface Job {
  id: number;
  to: string;
  title: string;
  body: string;
  url: string;
}

const claim = () => asService<Job[]>('select public.push_claim_batch(100) as value');
const pendingFor = (user: TestUser) =>
  admin<{ title: string; body: string; url: string }>('select title, body, url from app_private.push_outbox where user_id = $1 and sent_at is null', [user.id]);

describe('push notifications', () => {
  beforeEach(async () => {
    await admin('delete from app_private.push_outbox');
  });

  it('registers devices and enqueues pushes without message bodies', async () => {
    const a = await createUser();
    const b = await createUser();
    await makeFriends(a, b);
    await rpc(b, 'register_push_token', [token('b1'), 'ios', 'iPhone']);
    await expectError(rpc(b, 'register_push_token', ['not-a-token', 'ios', '']), 'PV_INVALID_INPUT');
    await rpc(a, 'send_direct_message', [b.id, 'mon code secret est 1234']);
    const pending = await pendingFor(b);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.url).toBe(`/messages/${a.id}`);
    expect(JSON.stringify(pending)).not.toContain('1234');
    // Tokens are not readable, even by their owner.
    await expect(asUser(b, 'select token from public.push_tokens')).rejects.toThrow(/permission denied/);
  });

  it('respects per-type push opt-out', async () => {
    const a = await createUser();
    const b = await createUser();
    await rpc(b, 'register_push_token', [token('b2'), 'android', 'Pixel']);
    await asUser(b, `update public.user_settings set push_prefs = '{"friend_request": false}' where user_id = $1`, [b.id]);
    await rpc(a, 'send_friend_request', [b.id]);
    expect(await pendingFor(b)).toEqual([]);
    // The in-app notification still exists.
    const inApp = await admin('select id from public.notifications where user_id = $1 and type = $2', [b.id, 'friend_request']);
    expect(inApp).toHaveLength(1);
  });

  it('lets only the service role claim and complete batches, and disables dead tokens', async () => {
    const a = await createUser();
    const b = await createUser();
    await rpc(b, 'register_push_token', [token('b3'), 'ios', '']);
    await rpc(a, 'send_friend_request', [b.id]);
    await expect(asUser(b, 'select public.push_claim_batch(10)')).rejects.toThrow(/permission denied/);

    const jobs = await claim();
    const mine = jobs.filter((j) => j.to === token('b3'));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ title: 'Nouvelle demande d’ami', url: '/friends' });
    // A claimed job is not handed out twice while in flight.
    expect((await claim()).filter((j) => j.to === token('b3'))).toEqual([]);

    await asService('select public.push_complete_batch($1::jsonb) as value', [
      JSON.stringify([{ id: mine[0]!.id, ok: false, error: 'DeviceNotRegistered', unregistered: true }]),
    ]);
    const [device] = await admin<{ disabled_at: string | null }>('select disabled_at from public.push_tokens where token = $1', [token('b3')]);
    expect(device!.disabled_at).not.toBeNull();
  });

  it('moves a token to the account signed in on the device and unregisters on sign-out', async () => {
    const a = await createUser();
    const b = await createUser();
    await rpc(a, 'register_push_token', [token('shared'), 'ios', '']);
    await rpc(b, 'register_push_token', [token('shared'), 'ios', '']);
    const [row] = await admin<{ user_id: string }>('select user_id from public.push_tokens where token = $1', [token('shared')]);
    expect(row!.user_id).toBe(b.id);
    await rpc(b, 'unregister_push_token', [token('shared')]);
    const [after] = await admin<{ disabled_at: string | null }>('select disabled_at from public.push_tokens where token = $1', [token('shared')]);
    expect(after!.disabled_at).not.toBeNull();
  });
});
