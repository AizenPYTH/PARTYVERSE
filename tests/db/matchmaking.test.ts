import { admin, createUser, expectError, playMoves, rpc, rpcRecord, type MatchState, type TestUser } from './helpers';

interface Ticket {
  status: string;
  match_id: string | null;
  lobby_id: string | null;
  window: number;
}

// Tickets from other tests would otherwise pair with these users.
beforeEach(async () => {
  await admin(`update public.matchmaking_tickets set status = 'cancelled' where status = 'searching'`);
});

async function setRating(user: TestUser, rating: number) {
  await admin(
    `insert into public.player_ratings (user_id, game_id, mode, rating, games_played) values ($1, 'connect_four', 'classic', $2, 5)
     on conflict (user_id, game_id, mode) do update set rating = excluded.rating`,
    [user.id, rating],
  );
}

describe('ranked matchmaking', () => {
  it('pairs two searching players into one ranked match and updates ratings', async () => {
    const a = await createUser();
    const b = await createUser();
    expect((await rpc<Ticket>(a, 'enqueue_matchmaking', ['connect_four', 'classic'])).status).toBe('searching');
    const ticketB = await rpc<Ticket>(b, 'enqueue_matchmaking', ['connect_four', 'classic']);
    expect(ticketB.status).toBe('matched');
    const ticketA = await rpc<Ticket>(a, 'poll_matchmaking');
    expect(ticketA.match_id).toBe(ticketB.match_id);

    const state = await rpc<MatchState>(a, 'get_match_state', [ticketA.match_id]);
    expect(state.match.ranked).toBe(true);
    const seats = [0, 1].map((seat) => (state.players.find((p) => p.seat === seat)!.user_id === a.id ? a : b));
    const final = await playMoves(ticketA.match_id!, [seats[0]!, seats[1]!], [0, 0, 1, 1, 2, 2, 3]);

    const winner = final.players.find((p) => p.seat === 0)!;
    const loser = final.players.find((p) => p.seat === 1)!;
    expect(winner.rating_before).toBe(1200);
    expect(winner.rating_after).toBe(1220);
    expect(loser.rating_after).toBe(1180);

    // The rematch in the same room is casual.
    const [lobby] = await admin<{ ranked: boolean }>('select ranked from public.lobbies where id = $1', [ticketA.lobby_id]);
    expect(lobby!.ranked).toBe(false);
  });

  it('respects the rating window and widens it over time', async () => {
    const low = await createUser();
    const high = await createUser();
    await setRating(low, 1000);
    await setRating(high, 1500);
    await rpc(low, 'enqueue_matchmaking', ['connect_four', 'classic']);
    expect((await rpc<Ticket>(high, 'enqueue_matchmaking', ['connect_four', 'classic'])).status).toBe('searching');

    await admin(`update public.matchmaking_tickets set created_at = now() - interval '90 seconds' where user_id = $1`, [low.id]);
    const ticket = await rpc<Ticket>(low, 'poll_matchmaking');
    expect(ticket.window).toBe(550);
    expect(ticket.status).toBe('matched');
  });

  it('never pairs players who blocked each other, nor offline players', async () => {
    const a = await createUser();
    const b = await createUser();
    await rpc(a, 'block_user', [b.id]);
    await rpc(a, 'enqueue_matchmaking', ['connect_four', 'classic']);
    expect((await rpc<Ticket>(b, 'enqueue_matchmaking', ['connect_four', 'classic'])).status).toBe('searching');
    await rpc(a, 'cancel_matchmaking');
    await rpc(b, 'cancel_matchmaking');

    const c = await createUser();
    const d = await createUser();
    await rpc(c, 'enqueue_matchmaking', ['connect_four', 'classic']);
    await admin(`update public.presence set heartbeat_at = now() - interval '5 minutes' where user_id = $1`, [c.id]);
    expect((await rpc<Ticket>(d, 'enqueue_matchmaking', ['connect_four', 'classic'])).status).toBe('searching');
  });

  it('cancels, expires and refuses unsupported modes', async () => {
    const a = await createUser();
    await rpc(a, 'enqueue_matchmaking', ['connect_four', 'classic']);
    expect((await rpc<Ticket>(a, 'cancel_matchmaking')).status).toBe('cancelled');

    await rpc(a, 'enqueue_matchmaking', ['connect_four', 'classic']);
    await admin(`update public.matchmaking_tickets set expires_at = now() - interval '1 second' where user_id = $1`, [a.id]);
    expect((await rpc<Ticket>(a, 'poll_matchmaking')).status).toBe('expired');

    await expectError(rpc(a, 'enqueue_matchmaking', ['connect_four', 'blitz']), 'PV_RANKED_UNAVAILABLE');
    await expectError(rpc(a, 'enqueue_matchmaking', ['pocket_pool', 'eight_ball']), 'PV_GAME_UNAVAILABLE');
  });
});

describe('maintenance', () => {
  it('enforces abandoned turn clocks, removes disconnected members and expires invitations', async () => {
    const host = await createUser();
    const guest = await createUser();
    const lobby = await rpcRecord<{ id: string; code: string }>(host, 'create_lobby', ['connect_four', 'private', null, true, false, '{}', '']);
    await rpc(guest, 'join_lobby_by_code', [lobby.code, false]);
    await rpc(host, 'set_lobby_ready', [lobby.id, true]);
    await rpc(guest, 'set_lobby_ready', [lobby.id, true]);
    const matchId = await rpc<string>(host, 'start_lobby_match', [lobby.id]);
    await admin(`update public.matches set turn_deadline = now() - interval '1 minute' where id = $1`, [matchId]);

    const idle = await createUser();
    const idleLobby = await rpcRecord<{ id: string }>(idle, 'create_lobby', ['connect_four', 'private', null, true, false, '{}', '']);
    await admin(`update public.lobby_members set joined_at = now() - interval '10 minutes' where user_id = $1`, [idle.id]);
    await admin(`update public.presence set heartbeat_at = now() - interval '10 minutes' where user_id = $1`, [idle.id]);

    const [{ result }] = (await admin<{ result: Record<string, number> }>('select app_private.run_maintenance() as result')) as [
      { result: Record<string, number> },
    ];
    expect(result.timeouts).toBeGreaterThanOrEqual(1);
    expect(result.disconnected_members).toBeGreaterThanOrEqual(1);

    const [match] = await admin<{ outcome: string; winner_seat: number }>('select outcome, winner_seat from public.matches where id = $1', [matchId]);
    expect(match).toEqual({ outcome: 'timeout', winner_seat: 1 });
    const [closed] = await admin<{ status: string }>('select status from public.lobbies where id = $1', [idleLobby.id]);
    expect(closed!.status).toBe('cancelled');
  });
});
