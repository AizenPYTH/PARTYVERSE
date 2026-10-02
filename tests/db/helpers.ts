import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Run the database tests with `npm run test:db`.');
}

export const pool = new Pool({ connectionString, max: 8 });

afterAll(async () => {
  await pool.end();
});

export interface TestUser {
  id: string;
  username: string;
}

/** Runs SQL as the database owner (bypasses RLS) for setup and time travel. */
export async function admin<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

async function withRole<T>(
  role: 'authenticated' | 'anon',
  userId: string | null,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${role}`);
    const claims = JSON.stringify(userId ? { sub: userId, role } : { role });
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    const result = await run(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/** Runs SQL as a signed-in user, exactly as PostgREST would. */
export function asUser<T = Record<string, unknown>>(
  user: TestUser | string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const id = typeof user === 'string' ? user : user.id;
  return withRole('authenticated', id, async (client) => (await client.query(sql, params)).rows as T[]);
}

export function asAnon<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withRole('anon', null, async (client) => (await client.query(sql, params)).rows as T[]);
}

/** Calls an RPC returning a scalar/json/composite value and returns it. */
export async function rpc<T = unknown>(user: TestUser, fn: string, args: unknown[] = []): Promise<T> {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(', ');
  const rows = await asUser<{ value: T }>(user, `select public.${fn}(${placeholders}) as value`, args);
  return rows[0]!.value;
}

/** Calls an RPC returning a table row type (composite) and returns the row. */
export async function rpcRecord<T = Record<string, unknown>>(user: TestUser, fn: string, args: unknown[] = []) {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(', ');
  const rows = await asUser<T>(user, `select * from public.${fn}(${placeholders})`, args);
  return rows[0]!;
}

/** Calls a set-returning RPC. */
export async function rpcRows<T = Record<string, unknown>>(user: TestUser, fn: string, args: unknown[] = []) {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(', ');
  return asUser<T>(user, `select * from public.${fn}(${placeholders})`, args);
}

let counter = 0;

/** Creates an auth user (profile created by trigger) and completes onboarding. */
export async function createUser(options: { onboard?: boolean; prefix?: string } = {}): Promise<TestUser> {
  const id = randomUUID();
  counter += 1;
  const username = `${options.prefix ?? 'p'}${id.replace(/-/g, '').slice(0, 10)}${counter}`.slice(0, 20);
  await admin('insert into auth.users (id, email) values ($1, $2)', [id, `${username}@example.test`]);
  if (options.onboard !== false) {
    await rpc({ id, username }, 'complete_onboarding', [username, null, 'nova-cyan', ['connect_four']]);
    await rpc({ id, username }, 'presence_heartbeat', [null]);
  }
  return { id, username };
}

export async function makeFriends(a: TestUser, b: TestUser): Promise<void> {
  await rpc(a, 'send_friend_request', [b.id]);
  const [request] = await admin<{ id: string }>(
    `select id from public.friend_requests where sender_id = $1 and receiver_id = $2 and status = 'pending'`,
    [a.id, b.id],
  );
  await rpc(b, 'respond_friend_request', [request!.id, true]);
}

export interface LobbyRow {
  id: string;
  code: string;
  status: string;
  host_id: string;
}

export async function createLobby(
  host: TestUser,
  overrides: { visibility?: string; settings?: object; gameId?: string; maxPlayers?: number } = {},
) {
  const rows = await asUser<LobbyRow>(
    host,
    `select * from public.create_lobby($1, $2, $4, true, false, $3::jsonb, 'Test')`,
    [overrides.gameId ?? 'connect_four', overrides.visibility ?? 'private', JSON.stringify(overrides.settings ?? {}), overrides.maxPlayers ?? null],
  );
  return rows[0]!;
}

/** A full room of `count` ready players for `gameId` (host first). */
export async function readyRoom(gameId: string, count: number, settings: object = {}) {
  const players: TestUser[] = [];
  for (let i = 0; i < count; i++) players.push(await createUser());
  const lobby = await createLobby(players[0]!, { gameId, settings, maxPlayers: count });
  for (const player of players.slice(1)) await rpc(player, 'join_lobby_by_code', [lobby.code, false]);
  for (const player of players) await rpc(player, 'set_lobby_ready', [lobby.id, true]);
  return { lobby, players };
}

export interface MatchState {
  match: {
    id: string;
    status: string;
    version: number;
    current_turn_seat: number | null;
    outcome: string | null;
    winner_seat: number | null;
    round: number;
    ranked: boolean;
    state: { columns: number[][]; move_count: number; winning_cells: number[][] };
    turn_deadline: string | null;
  };
  players: {
    seat: number;
    user_id: string;
    result: string | null;
    xp_awarded: number;
    rating_before: number | null;
    rating_after: number | null;
    series_wins: number;
    win_streak: number;
  }[];
  my_seat: number | null;
}

/** Host + guest in a fresh lobby, both ready, match started. Returns players by seat. */
export async function startDuel(options: { settings?: object } = {}) {
  const host = await createUser();
  const guest = await createUser();
  const lobby = await createLobby(host, { settings: options.settings });
  await rpc(guest, 'join_lobby_by_code', [lobby.code, false]);
  await rpc(host, 'set_lobby_ready', [lobby.id, true]);
  await rpc(guest, 'set_lobby_ready', [lobby.id, true]);
  const matchId = await rpc<string>(host, 'start_lobby_match', [lobby.id]);
  const state = await rpc<MatchState>(host, 'get_match_state', [matchId]);
  const seat0 = state.players[0]!.user_id === host.id ? host : guest;
  const seat1 = seat0 === host ? guest : host;
  return { host, guest, lobby, matchId, seats: [seat0, seat1] as const };
}

/** Plays columns alternately from seat 0; returns the final state. */
export async function playMoves(matchId: string, seats: readonly [TestUser, TestUser], moves: number[]) {
  let state = await rpc<MatchState>(seats[0], 'get_match_state', [matchId]);
  for (const column of moves) {
    const seat = state.match.current_turn_seat!;
    state = await rpc<MatchState>(seats[seat]!, 'submit_connect_four_move', [matchId, column, state.match.version]);
  }
  return state;
}

/** Asserts that a promise rejects with a PV_* error code. */
export async function expectError(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ message: expect.stringContaining(code) });
}
