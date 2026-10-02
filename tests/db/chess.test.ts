import { Chess } from 'chess.js';

import { gameAction } from './engineDb';
import { admin, createUser, expectError, readyRoom, rpc, type MatchState, type TestUser } from './helpers';

interface ChessMatchState extends MatchState {
  match: MatchState['match'] & { state: { fen: string; moves: { san: string }[]; clocks: [number, number]; drawOffer: number | null } };
}

beforeEach(async () => {
  await admin(`update public.matchmaking_tickets set status = 'cancelled' where status = 'searching'`);
});

async function seatsOf(matchId: string, players: TestUser[]) {
  const state = await rpc<ChessMatchState>(players[0]!, 'get_match_state', [matchId]);
  const bySeat = (seat: number) => players.find((p) => p.id === state.players.find((x) => x.seat === seat)!.user_id)!;
  return [bySeat(0), bySeat(1)] as [TestUser, TestUser];
}

async function san(matchId: string, user: TestUser, move: string) {
  const state = await rpc<ChessMatchState>(user, 'get_match_state', [matchId]);
  const game = new Chess();
  for (const played of state.match.state.moves) game.move(played.san);
  const verbose = game.moves({ verbose: true }).find((m) => m.san === move)!;
  return gameAction(user, {
    op: 'action',
    matchId,
    version: state.match.version,
    action: { type: 'move', from: verbose.from, to: verbose.to, promotion: verbose.promotion },
  });
}

describe('chess through the game-action handler', () => {
  it('plays a checkmate and finalizes', async () => {
    const { lobby, players } = await readyRoom('chess_arena', 2, { time_control: 'bullet' });
    const { matchId } = await gameAction(players[0]!, { op: 'start', lobbyId: lobby.id });
    const [white, black] = await seatsOf(matchId!, players);
    const initial = await rpc<ChessMatchState>(white, 'get_match_state', [matchId]);
    expect(initial.match.state.clocks).toEqual([60_000, 60_000]);

    await expectError(
      gameAction(black, { op: 'action', matchId: matchId!, version: initial.match.version, action: { type: 'move', from: 'e7', to: 'e5' } }),
      'PV_NOT_YOUR_TURN',
    );
    for (const [user, move] of [[white, 'f3'], [black, 'e5'], [white, 'g4'], [black, 'Qh4#']] as const) await san(matchId!, user, move);

    const final = await rpc<ChessMatchState>(white, 'get_match_state', [matchId]);
    expect(final.match).toMatchObject({ status: 'finished', outcome: 'win', winner_seat: 1, result_detail: { reason: 'checkmate' } });
    expect(final.match.state.moves.map((m) => m.san)).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
  });

  it('lets the side not to move offer a draw that the opponent accepts', async () => {
    const { lobby, players } = await readyRoom('chess_arena', 2);
    const { matchId } = await gameAction(players[0]!, { op: 'start', lobbyId: lobby.id });
    const [white, black] = await seatsOf(matchId!, players);
    let state = await rpc<ChessMatchState>(black, 'get_match_state', [matchId]);
    await gameAction(black, { op: 'action', matchId: matchId!, version: state.match.version, action: { type: 'offer_draw' } });
    state = await rpc<ChessMatchState>(white, 'get_match_state', [matchId]);
    expect(state.match.state.drawOffer).toBe(1);
    await gameAction(white, { op: 'action', matchId: matchId!, version: state.match.version, action: { type: 'accept_draw' } });
    const final = await rpc<ChessMatchState>(white, 'get_match_state', [matchId]);
    expect(final.match).toMatchObject({ outcome: 'draw', result_detail: { reason: 'agreement' } });
  });

  it('flags on the server clock', async () => {
    const { lobby, players } = await readyRoom('chess_arena', 2, { time_control: 'bullet' });
    const { matchId } = await gameAction(players[0]!, { op: 'start', lobbyId: lobby.id });
    const [white, black] = await seatsOf(matchId!, players);
    await san(matchId!, white, 'e4');
    await admin(`update public.matches set turn_deadline = now() - interval '1 second' where id = $1`, [matchId]);
    await gameAction(white, { op: 'timeout', matchId: matchId! });
    const final = await rpc<ChessMatchState>(black, 'get_match_state', [matchId]);
    expect(final.match).toMatchObject({ outcome: 'timeout', winner_seat: 0 });
  });

  it('matches ranked players per time control and rates that ladder only', async () => {
    const a = await createUser();
    const b = await createUser();
    await rpc(a, 'enqueue_matchmaking', ['chess_arena', 'blitz']);
    const ticket = await rpc<{ status: string; lobby_id: string; match_id: string | null }>(b, 'enqueue_matchmaking', ['chess_arena', 'blitz']);
    expect(ticket).toMatchObject({ status: 'matched', match_id: null });

    const [room] = await admin<{ settings: { time_control: string }; status: string; host_id: string }>(
      'select settings, status, host_id from public.lobbies where id = $1', [ticket.lobby_id]);
    expect(room).toMatchObject({ settings: { time_control: 'blitz' }, status: 'ready' });

    // Any matched player may start the room (it re-validates readiness).
    const starter = room!.host_id === a.id ? b : a;
    const { matchId } = await gameAction(starter, { op: 'start', lobbyId: ticket.lobby_id });
    await expectError(gameAction(room!.host_id === a.id ? a : b, { op: 'start', lobbyId: ticket.lobby_id }), 'PV_LOBBY_IN_GAME');
    const [white, black] = await seatsOf(matchId!, [a, b]);
    for (const [user, move] of [[white, 'f3'], [black, 'e5'], [white, 'g4'], [black, 'Qh4#']] as const) await san(matchId!, user, move);

    const ratings = await admin<{ user_id: string; mode: string; rating: number }>(
      `select user_id, mode, rating from public.player_ratings where game_id = 'chess_arena' and user_id = any($1) order by rating`,
      [[a.id, b.id]]);
    expect(ratings.map((r) => [r.mode, r.rating])).toEqual([['blitz', 1180], ['blitz', 1220]]);
  });
});
