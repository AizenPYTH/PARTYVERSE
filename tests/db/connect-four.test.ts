import vectorsFile from '../fixtures/connect-four-vectors.json';
import { admin, expectError, playMoves, rpc, startDuel, type MatchState } from './helpers';

type Expected =
  | { outcome: 'win'; winner: number; cells: number[][] }
  | { outcome: 'draw' }
  | { outcome: 'continue' }
  | { outcome: 'error'; error: string; atMove: number };

const vectors = vectorsFile.vectors as { name: string; moves: number[]; expected: Expected }[];
const sortCells = (cells: number[][]) => cells.map((c) => `${c[0]},${c[1]}`).sort();

describe('SQL Connect Four engine — shared vectors', () => {
  it.each(vectors)('$name', async ({ moves, expected }) => {
    const { matchId, seats } = await startDuel();

    if (expected.outcome === 'error') {
      await playMoves(matchId, seats, moves.slice(0, expected.atMove));
      await expectError(playMoves(matchId, seats, [moves[expected.atMove]!]), expected.error);
      return;
    }

    const state = await playMoves(matchId, seats, moves);
    if (expected.outcome === 'continue') {
      expect(state.match.status).toBe('active');
      return;
    }
    expect(state.match.status).toBe('finished');
    expect(state.match.outcome).toBe(expected.outcome);
    if (expected.outcome === 'win') {
      expect(state.match.winner_seat).toBe(expected.winner);
      expect(sortCells(state.match.state.winning_cells)).toEqual(sortCells(expected.cells));
    } else {
      expect(state.match.winner_seat).toBeNull();
    }
  });
});

describe('move validation', () => {
  it('rejects moves out of turn, stale versions and non-players', async () => {
    const { matchId, seats } = await startDuel();
    const outsider = (await startDuel()).host;
    const state = await rpc<MatchState>(seats[0], 'get_match_state', [matchId]);

    await expectError(rpc(seats[1], 'submit_connect_four_move', [matchId, 3, state.match.version]), 'PV_NOT_YOUR_TURN');
    await expectError(rpc(seats[0], 'submit_connect_four_move', [matchId, 3, state.match.version + 1]), 'PV_STALE_STATE');
    await expectError(rpc(outsider, 'submit_connect_four_move', [matchId, 3, state.match.version]), 'PV_MATCH_NOT_FOUND');

    const after = await rpc<MatchState>(seats[0], 'submit_connect_four_move', [matchId, 3, state.match.version]);
    expect(after.match.version).toBe(state.match.version + 1);
    expect(after.match.current_turn_seat).toBe(1);
    // Replaying the same version (double tap / retry) is rejected, not applied twice.
    await expectError(rpc(seats[0], 'submit_connect_four_move', [matchId, 3, state.match.version]), 'PV_STALE_STATE');

    const [{ count }] = await admin<{ count: string }>('select count(*) from public.match_moves where match_id = $1', [matchId]);
    expect(Number(count)).toBe(1);
  });

  it('enforces the server clock', async () => {
    const { matchId, seats } = await startDuel({ settings: { turn_seconds: 30 } });
    await expectError(rpc(seats[1], 'claim_match_timeout', [matchId]), 'PV_TURN_NOT_EXPIRED');

    await admin(`update public.matches set turn_deadline = now() - interval '1 second' where id = $1`, [matchId]);
    const state = await rpc<MatchState>(seats[0], 'get_match_state', [matchId]);
    await expectError(rpc(seats[0], 'submit_connect_four_move', [matchId, 0, state.match.version]), 'PV_TURN_EXPIRED');

    const final = await rpc<MatchState>(seats[1], 'claim_match_timeout', [matchId]);
    expect(final.match.outcome).toBe('timeout');
    expect(final.match.winner_seat).toBe(1);
  });

  it('lets a player resign', async () => {
    const { matchId, seats } = await startDuel();
    const final = await rpc<MatchState>(seats[0], 'resign_match', [matchId]);
    expect(final.match.outcome).toBe('resignation');
    expect(final.match.winner_seat).toBe(1);
    await expectError(rpc(seats[0], 'resign_match', [matchId]), 'PV_MATCH_NOT_ACTIVE');
  });
});

describe('results', () => {
  it('awards XP, stats and series score, then returns the lobby for a rematch where the loser starts', async () => {
    const { lobby, matchId, seats, host, guest } = await startDuel();
    const final = await playMoves(matchId, seats, [0, 0, 1, 1, 2, 2, 3]);

    const winner = final.players.find((p) => p.seat === 0)!;
    const loser = final.players.find((p) => p.seat === 1)!;
    expect(winner).toMatchObject({ result: 'win', xp_awarded: 40, series_wins: 1, win_streak: 1 });
    expect(loser).toMatchObject({ result: 'loss', xp_awarded: 10, series_wins: 0, win_streak: 0 });
    // Friendly lobbies never touch ratings.
    expect(winner.rating_after).toBeNull();

    const [profile] = await admin<{ xp: string; level: number }>('select xp, level from public.profiles where id = $1', [seats[0].id]);
    expect(Number(profile!.xp)).toBe(40);

    const [lobbyRow] = await admin<{ status: string; matches_played: number }>(
      'select status, matches_played from public.lobbies where id = $1', [lobby.id]);
    expect(lobbyRow).toEqual({ status: 'waiting', matches_played: 1 });

    await rpc(host, 'set_lobby_ready', [lobby.id, true]);
    await rpc(guest, 'set_lobby_ready', [lobby.id, true]);
    const rematchId = await rpc<string>(host, 'start_lobby_match', [lobby.id]);
    const rematch = await rpc<MatchState>(host, 'get_match_state', [rematchId]);
    expect(rematch.match.round).toBe(2);
    expect(rematch.players.find((p) => p.seat === 0)!.user_id).toBe(seats[1].id);
    expect(rematch.players.find((p) => p.user_id === seats[0].id)!.series_wins).toBe(1);
  });

  it('gives no XP for matches abandoned before four moves', async () => {
    const { matchId, seats } = await startDuel();
    await playMoves(matchId, seats, [3]);
    const final = await rpc<MatchState>(seats[1], 'resign_match', [matchId]);
    expect(final.players.map((p) => p.xp_awarded)).toEqual([0, 0]);
  });

  it('caps XP against the same opponent per day', async () => {
    const { lobby, matchId, seats, host, guest } = await startDuel();
    await playMoves(matchId, seats, [0, 0, 1, 1, 2, 2, 3]);
    // Simulate ten earlier finished matches between the same players today.
    for (let i = 0; i < 10; i++) {
      const [m] = await admin<{ id: string }>(
        `insert into public.matches (lobby_id, game_id, status, state, turn_seconds, engine_version, outcome, ended_at)
         values ($1, 'connect_four', 'finished', '{}'::jsonb, 60, 1, 'draw', now()) returning id`, [lobby.id]);
      await admin(`insert into public.match_players (match_id, seat, user_id, result) values ($1, 0, $2, 'draw'), ($1, 1, $3, 'draw')`,
        [m!.id, host.id, guest.id]);
    }
    await rpc(host, 'set_lobby_ready', [lobby.id, true]);
    await rpc(guest, 'set_lobby_ready', [lobby.id, true]);
    const next = await rpc<string>(host, 'start_lobby_match', [lobby.id]);
    const state = await rpc<MatchState>(host, 'get_match_state', [next]);
    const order = [0, 1].map((seat) => state.players.find((p) => p.seat === seat)!.user_id === host.id ? host : guest);
    const final = await playMoves(next, [order[0]!, order[1]!], [0, 0, 1, 1, 2, 2, 3]);
    expect(final.players.map((p) => p.xp_awarded)).toEqual([0, 0]);
  });

  it('levels up and unlocks cosmetics from the server-side ledger only', async () => {
    const { matchId, seats } = await startDuel();
    await admin('update public.profiles set xp = 90 where id = $1', [seats[0].id]);
    await playMoves(matchId, seats, [0, 0, 1, 1, 2, 2, 3]);
    const [profile] = await admin<{ level: number }>('select level from public.profiles where id = $1', [seats[0].id]);
    expect(profile!.level).toBe(2);
    const notifications = await admin<{ type: string }>(
      `select type from public.notifications where user_id = $1 order by created_at`, [seats[0].id]);
    expect(notifications.map((n) => n.type)).toContain('level_up');
  });
});
