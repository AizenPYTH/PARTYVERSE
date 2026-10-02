import { gameAction } from './engineDb';
import { admin, asUser, createUser, expectError, readyRoom, rpc, type MatchState, type TestUser } from './helpers';

interface EngineMatchState extends MatchState {
  match: MatchState['match'] & { active_seats: number[]; result_detail: { reason?: string } };
  private_state: unknown;
}

async function startTicTacToe() {
  const { lobby, players } = await readyRoom('tic_tac_toe', 2);
  const { matchId } = await gameAction(players[0]!, { op: 'start', lobbyId: lobby.id });
  const state = await rpc<EngineMatchState>(players[0]!, 'get_match_state', [matchId]);
  const bySeat = (seat: number) => players.find((p) => p.id === state.players.find((x) => x.seat === seat)!.user_id)!;
  return { lobby, players, matchId: matchId!, seats: [bySeat(0), bySeat(1)] as [TestUser, TestUser] };
}

async function place(matchId: string, user: TestUser, cell: number) {
  const state = await rpc<EngineMatchState>(user, 'get_match_state', [matchId]);
  return gameAction(user, { op: 'action', matchId, version: state.match.version, action: { type: 'place', cell } });
}

describe('engine framework (tic-tac-toe through the game-action handler)', () => {
  it('starts only for the host of a ready room and creates server-side state', async () => {
    const { lobby, players } = await readyRoom('tic_tac_toe', 2);
    await expectError(gameAction(players[1]!, { op: 'start', lobbyId: lobby.id }), 'PV_NOT_LOBBY_HOST');
    const { matchId } = await gameAction(players[0]!, { op: 'start', lobbyId: lobby.id });
    await expectError(gameAction(players[0]!, { op: 'start', lobbyId: lobby.id }), 'PV_LOBBY_IN_GAME');

    const [server] = await admin<{ state: { board: unknown[] } }>('select state from public.match_server_state where match_id = $1', [matchId]);
    expect(server!.state.board).toHaveLength(9);
    const state = await rpc<EngineMatchState>(players[0]!, 'get_match_state', [matchId]);
    expect(state.match).toMatchObject({ network_model: 'turn_based_engine', active_seats: [0], current_turn_seat: 0 });
  });

  it('refuses SQL start and SQL timeouts for engine games', async () => {
    const { lobby, players } = await readyRoom('tic_tac_toe', 2);
    await expectError(rpc(players[0]!, 'start_lobby_match', [lobby.id]), 'PV_WRONG_GAME');
    const { matchId } = await gameAction(players[0]!, { op: 'start', lobbyId: lobby.id });
    await expectError(rpc(players[0]!, 'claim_match_timeout', [matchId]), 'PV_WRONG_GAME');
  });

  it('plays a full game, validates turns and versions, and finalizes results', async () => {
    const { matchId, seats, lobby } = await startTicTacToe();
    await expectError(place(matchId, seats[1], 4), 'PV_NOT_YOUR_TURN');
    await place(matchId, seats[0], 0);
    await expectError(place(matchId, seats[1], 0), 'PV_INVALID_MOVE');
    const stale = await rpc<EngineMatchState>(seats[1], 'get_match_state', [matchId]);
    await place(matchId, seats[1], 4);
    await expectError(
      gameAction(seats[0], { op: 'action', matchId, version: stale.match.version, action: { type: 'place', cell: 1 } }),
      'PV_STALE_STATE',
    );
    await place(matchId, seats[0], 1);
    await place(matchId, seats[1], 8);
    await place(matchId, seats[0], 2);

    const final = await rpc<EngineMatchState>(seats[0], 'get_match_state', [matchId]);
    expect(final.match).toMatchObject({ status: 'finished', outcome: 'win', winner_seat: 0, result_detail: { reason: 'line' } });
    expect(final.players.map((p) => [p.seat, p.result, p.xp_awarded])).toEqual([[0, 'win', 40], [1, 'loss', 10]]);
    const [room] = await admin<{ status: string }>('select status from public.lobbies where id = $1', [lobby.id]);
    expect(room!.status).toBe('waiting');
    const moves = await admin('select * from public.match_moves where match_id = $1', [matchId]);
    expect(moves).toHaveLength(5);
  });

  it('rejects malformed actions and outsiders', async () => {
    const { matchId, seats } = await startTicTacToe();
    const outsider = await createUser();
    const state = await rpc<EngineMatchState>(seats[0], 'get_match_state', [matchId]);
    await expectError(gameAction(seats[0], { op: 'action', matchId, version: state.match.version, action: { type: 'place', cell: 'x' } }), 'PV_INVALID_MOVE');
    await expectError(gameAction(seats[0], { op: 'action', matchId, version: state.match.version, action: { type: 'place', cell: 12 } }), 'PV_INVALID_MOVE');
    await expectError(gameAction(outsider, { op: 'action', matchId, version: state.match.version, action: { type: 'place', cell: 1 } }), 'PV_MATCH_NOT_FOUND');
  });

  it('enforces the server clock through the engine', async () => {
    const { matchId, seats } = await startTicTacToe();
    await expectError(gameAction(seats[1], { op: 'timeout', matchId }), 'PV_TURN_NOT_EXPIRED');
    await admin(`update public.matches set turn_deadline = now() - interval '1 second' where id = $1`, [matchId]);
    await expectError(place(matchId, seats[0], 0), 'PV_TURN_EXPIRED');
    await gameAction(seats[1], { op: 'timeout', matchId });
    const final = await rpc<EngineMatchState>(seats[1], 'get_match_state', [matchId]);
    expect(final.match).toMatchObject({ outcome: 'timeout', winner_seat: 1 });
  });

  it('keeps engine RPCs and server state out of reach of clients', async () => {
    const { matchId, seats } = await startTicTacToe();
    await expect(asUser(seats[0], 'select public.engine_load($1, $2)', [matchId, seats[0].id])).rejects.toThrow(/permission denied/);
    await expect(
      asUser(seats[0], `select public.engine_commit($1, $2, 0, 'action', '{}'::jsonb, '{}'::jsonb)`, [matchId, seats[0].id]),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(seats[0], 'select * from public.match_server_state')).rejects.toThrow(/permission denied/);
  });

  it('lets the opponent win when a player leaves mid-game', async () => {
    const { matchId, seats, lobby } = await startTicTacToe();
    await place(matchId, seats[0], 4);
    await rpc(seats[0], 'leave_lobby', [lobby.id]);
    const final = await rpc<EngineMatchState>(seats[1], 'get_match_state', [matchId]);
    expect(final.match).toMatchObject({ status: 'finished', outcome: 'abandon', winner_seat: 1 });
  });

  it('aborts abandoned engine matches in maintenance when nobody enforces the clock', async () => {
    const { matchId } = await startTicTacToe();
    await admin(`update public.matches set turn_deadline = now() - interval '3 minutes' where id = $1`, [matchId]);
    await admin('select app_private.run_maintenance()');
    const [row] = await admin<{ outcome: string; winner_seat: number }>('select outcome, winner_seat from public.matches where id = $1', [matchId]);
    expect(row).toEqual({ outcome: 'timeout', winner_seat: 1 });
  });
});
