import { gameAction } from './engineDb';
import { admin, createLobby, createUser, expectError, rpc, type TestUser } from './helpers';

interface PartyState {
  session: { status: string; current_round: number; rounds_total: number; playlist: { game_id: string }[] };
  rounds: { round: number; game_id: string; status: string; winners: string[] }[];
  standings: { user_id: string; points: number; wins: number; rounds_played: number }[];
}

interface NextRound {
  finished: boolean;
  round?: number;
  game_id?: string;
  network_model?: string;
}

async function room(count: number, gameId = 'connect_four') {
  const players: TestUser[] = [];
  for (let i = 0; i < count; i++) players.push(await createUser());
  const lobby = await createLobby(players[0]!, { gameId, maxPlayers: Math.max(2, count) });
  for (const player of players.slice(1)) await rpc(player, 'join_lobby_by_code', [lobby.code, false]);
  return { lobby, players };
}

/** Starts the prepared round like the app does and makes `loser` resign it. */
async function playRound(lobbyId: string, host: TestUser, next: NextRound, loser: TestUser) {
  const matchId =
    next.network_model === 'turn_based_engine'
      ? (await gameAction(host, { op: 'start', lobbyId })).matchId!
      : await rpc<string>(host, 'start_lobby_match', [lobbyId]);
  await rpc(loser, 'resign_match', [matchId]);
  return matchId;
}

describe('party mode', () => {
  it('chains rounds in the same room and keeps overall standings', async () => {
    const { lobby, players } = await room(2);
    const [host, guest] = players as [TestUser, TestUser];
    await expectError(rpc(guest, 'start_party', [lobby.id, 'custom', null, ['tic_tac_toe', 'connect_four']]), 'PV_NOT_LOBBY_HOST');
    await rpc(host, 'start_party', [lobby.id, 'custom', null, ['tic_tac_toe', 'connect_four']]);
    await expectError(rpc(host, 'start_party', [lobby.id, 'quick', 3, null]), 'PV_PARTY_ACTIVE');
    await expectError(rpc(host, 'change_lobby_game', [lobby.id, 'reversi']), 'PV_PARTY_ACTIVE');

    const first = await rpc<NextRound>(host, 'party_next_round', [lobby.id]);
    expect(first).toMatchObject({ finished: false, round: 1, game_id: 'tic_tac_toe', network_model: 'turn_based_engine' });
    // Idempotent until played.
    expect(await rpc<NextRound>(host, 'party_next_round', [lobby.id])).toMatchObject({ round: 1 });
    const [lobbyRow] = await admin<{ game_id: string; status: string }>('select game_id, status from public.lobbies where id = $1', [lobby.id]);
    expect(lobbyRow).toEqual({ game_id: 'tic_tac_toe', status: 'ready' });
    await playRound(lobby.id, host, first, guest);

    let state = await rpc<PartyState>(guest, 'get_party_state', [lobby.id]);
    expect(state.session).toMatchObject({ status: 'active', current_round: 1, rounds_total: 2 });
    expect(state.rounds[0]).toMatchObject({ round: 1, status: 'done', winners: [host.id] });
    expect(state.standings.map((s) => [s.user_id, s.points, s.wins, s.rounds_played])).toEqual([
      [host.id, 10, 1, 1],
      [guest.id, 1, 0, 1],
    ]);

    const second = await rpc<NextRound>(host, 'party_next_round', [lobby.id]);
    expect(second).toMatchObject({ round: 2, game_id: 'connect_four', network_model: 'turn_based_sql' });
    await playRound(lobby.id, host, second, host);

    state = await rpc<PartyState>(host, 'get_party_state', [lobby.id]);
    expect(state.session).toMatchObject({ status: 'finished', current_round: 2 });
    // Host won round 1 (10 + 1), guest won round 2 (1 + 10).
    expect(state.standings.map((s) => s.points)).toEqual([11, 11]);
    expect(state.rounds.map((r) => r.winners)).toEqual([[host.id], [guest.id]]);
    await expectError(rpc(host, 'party_next_round', [lobby.id]), 'PV_PARTY_NOT_FOUND');
    // The room is free again once the party is over.
    await rpc(host, 'change_lobby_game', [lobby.id, 'reversi']);
  });

  it('draws formats from games that fit the headcount', async () => {
    const { lobby, players } = await room(3, 'memory_match');
    await rpc(players[0]!, 'start_party', [lobby.id, 'friends', 4, null]);
    const [row] = await admin<{ playlist: string[] }>('select playlist from public.party_sessions where lobby_id = $1', [lobby.id]);
    expect(row!.playlist).toHaveLength(4);
    const fitting = await admin<{ id: string }>(
      `select id from public.game_catalog where id = any($1) and 3 between min_players and max_players`,
      [row!.playlist],
    );
    expect(new Set(fitting.map((g) => g.id))).toEqual(new Set(row!.playlist));
    for (let i = 1; i < row!.playlist.length; i++) expect(row!.playlist[i]).not.toBe(row!.playlist[i - 1]);
  });

  it('lets the host end a party early and hides it from strangers', async () => {
    const { lobby, players } = await room(2);
    const stranger = await createUser();
    await rpc(players[0]!, 'start_party', [lobby.id, 'classic', 3, null]);
    await expectError(rpc(stranger, 'get_party_state', [lobby.id]), 'PV_LOBBY_NOT_FOUND');
    await rpc(players[0]!, 'end_party', [lobby.id]);
    const state = await rpc<PartyState>(players[1]!, 'get_party_state', [lobby.id]);
    expect(state.session.status).toBe('cancelled');
    await expectError(rpc(players[0]!, 'start_party', [lobby.id, 'custom', null, ['pocket_pool', 'connect_four']]), 'PV_GAME_UNAVAILABLE');
    await expectError(rpc(players[0]!, 'start_party', [lobby.id, 'nope', 3, null]), 'PV_INVALID_SETTINGS');
  });
});
