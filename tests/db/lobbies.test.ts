import {
  admin,
  createLobby,
  createUser,
  expectError,
  makeFriends,
  playMoves,
  rpc,
  rpcRecord,
  rpcRows,
  startDuel,
  type MatchState,
} from './helpers';

interface LobbyState {
  lobby: { id: string; code: string | null; status: string; host_id: string; settings: { turn_seconds: number } };
  members: { user_id: string; role: string; is_ready: boolean }[];
  my_role: string | null;
}

describe('lobby lifecycle', () => {
  it('creates a lobby with validated settings and a code', async () => {
    const host = await createUser();
    const lobby = await createLobby(host, { settings: { turn_seconds: 30 } });
    expect(lobby.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const state = await rpc<LobbyState>(host, 'get_lobby_state', [lobby.id]);
    expect(state.lobby.settings).toEqual({ turn_seconds: 30 });
    expect(state.my_role).toBe('player');

    await expectError(createLobby(host, { settings: { turn_seconds: 7 } }), 'PV_INVALID_SETTINGS');
    await expectError(createLobby(host, { settings: { cheat: true } }), 'PV_INVALID_SETTINGS');
    await expectError(rpc(host, 'create_lobby', ['chess_arena']), 'PV_GAME_UNAVAILABLE');
  });

  it('joins by code (case-insensitive) and returns null for unknown codes', async () => {
    const host = await createUser();
    const guest = await createUser();
    const lobby = await createLobby(host);
    expect(await rpc(guest, 'join_lobby_by_code', [lobby.code.toLowerCase(), false])).toBe(lobby.id);
    expect(await rpc(guest, 'join_lobby_by_code', ['ZZZZZZ', false])).toBeNull();
  });

  it('rate limits code guessing even when codes are wrong', async () => {
    const guest = await createUser();
    for (let i = 0; i < 20; i++) {
      await rpc(guest, 'join_lobby_by_code', ['AAAAAA', false]);
    }
    await expectError(rpc(guest, 'join_lobby_by_code', ['AAAAAA', false]), 'PV_RATE_LIMITED');
  });

  it('refuses players beyond capacity but accepts spectators', async () => {
    const host = await createUser();
    const lobby = await createLobby(host);
    await rpc(await createUser(), 'join_lobby_by_code', [lobby.code, false]);
    const late = await createUser();
    await expectError(rpc(late, 'join_lobby_by_code', [lobby.code, false]), 'PV_LOBBY_FULL');
    expect(await rpc(late, 'join_lobby_by_code', [lobby.code, true])).toBe(lobby.id);
    const state = await rpc<LobbyState>(late, 'get_lobby_state', [lobby.id]);
    expect(state.my_role).toBe('spectator');
  });

  it('tracks readiness and only lets the host start a ready lobby', async () => {
    const host = await createUser();
    const guest = await createUser();
    const lobby = await createLobby(host);
    await rpc(guest, 'join_lobby_by_code', [lobby.code, false]);

    await expectError(rpc(host, 'start_lobby_match', [lobby.id]), 'PV_PLAYERS_NOT_READY');
    expect(await rpc(host, 'set_lobby_ready', [lobby.id, true])).toBe('waiting');
    expect(await rpc(guest, 'set_lobby_ready', [lobby.id, true])).toBe('ready');
    await expectError(rpc(guest, 'start_lobby_match', [lobby.id]), 'PV_NOT_LOBBY_HOST');

    // Changing settings resets readiness.
    await rpc(host, 'update_lobby_settings', [lobby.id, null, null, null, null, null, JSON.stringify({ turn_seconds: 120 })]);
    const state = await rpc<LobbyState>(host, 'get_lobby_state', [lobby.id]);
    expect(state.lobby.status).toBe('waiting');
    expect(state.members.every((m) => !m.is_ready)).toBe(true);
  });

  it('auto-starts when configured', async () => {
    const host = await createUser();
    const guest = await createUser();
    const created = await rpcRecord<{ id: string; code: string }>(host, 'create_lobby', ['connect_four', 'private', null, true, true, '{}', '']);
    await rpc(guest, 'join_lobby_by_code', [created.code, false]);
    await rpc(host, 'set_lobby_ready', [created.id, true]);
    expect(await rpc(guest, 'set_lobby_ready', [created.id, true])).toBe('in_progress');
  });

  it('transfers the host role, then closes the lobby when the last player leaves', async () => {
    const host = await createUser();
    const second = await createUser();
    const lobby = await createLobby(host);
    await rpc(second, 'join_lobby_by_code', [lobby.code, false]);

    await rpc(host, 'leave_lobby', [lobby.id]);
    let [row] = await admin<{ host_id: string; status: string }>('select host_id, status from public.lobbies where id = $1', [lobby.id]);
    expect(row).toEqual({ host_id: second.id, status: 'waiting' });

    await rpc(second, 'leave_lobby', [lobby.id]);
    [row] = await admin('select host_id, status from public.lobbies where id = $1', [lobby.id]);
    expect(row!.status).toBe('cancelled');
  });

  it('keeps a player in a single open lobby', async () => {
    const user = await createUser();
    const first = await createLobby(user);
    const second = await createLobby(user);
    const memberships = await admin<{ lobby_id: string }>('select lobby_id from public.lobby_members where user_id = $1', [user.id]);
    expect(memberships.map((m) => m.lobby_id)).toEqual([second.id]);
    const [old] = await admin<{ status: string }>('select status from public.lobbies where id = $1', [first.id]);
    expect(old!.status).toBe('cancelled');
  });

  it('refuses to leave for another lobby during a match', async () => {
    const { seats } = await startDuel();
    await expectError(rpc(seats[0], 'create_lobby', ['connect_four']), 'PV_ALREADY_IN_MATCH');
  });

  it('forfeits the match of a player who leaves mid-game', async () => {
    const { lobby, matchId, seats } = await startDuel();
    await playMoves(matchId, seats, [3, 3]);
    await rpc(seats[0], 'leave_lobby', [lobby.id]);
    const state = await rpc<MatchState>(seats[1], 'get_match_state', [matchId]);
    expect(state.match).toMatchObject({ status: 'finished', outcome: 'abandon', winner_seat: 1 });
  });

  it('lets the host kick and prevents rejoining', async () => {
    const host = await createUser();
    const guest = await createUser();
    const lobby = await createLobby(host);
    await rpc(guest, 'join_lobby_by_code', [lobby.code, false]);
    await rpc(host, 'kick_lobby_member', [lobby.id, guest.id]);
    await expectError(rpc(guest, 'join_lobby_by_code', [lobby.code, false]), 'PV_LOBBY_FORBIDDEN');
  });
});

describe('invitations', () => {
  it('requires friendship, notifies, and joins on accept', async () => {
    const host = await createUser();
    const friend = await createUser();
    const stranger = await createUser();
    const lobby = await createLobby(host);

    await expectError(rpc(host, 'invite_to_lobby', [lobby.id, stranger.id]), 'PV_NOT_FRIENDS');
    await makeFriends(host, friend);
    const invitationId = await rpc<string>(host, 'invite_to_lobby', [lobby.id, friend.id]);
    // Re-inviting refreshes the same invitation.
    expect(await rpc(host, 'invite_to_lobby', [lobby.id, friend.id])).toBe(invitationId);

    const invitations = await rpcRows<{ invitation_id: string; sender_id: string }>(friend, 'list_my_invitations');
    expect(invitations).toEqual([expect.objectContaining({ invitation_id: invitationId, sender_id: host.id })]);
    // The invitee can preview the private lobby.
    await rpc(friend, 'get_lobby_state', [lobby.id]);

    expect(await rpc(friend, 'respond_lobby_invitation', [invitationId, true])).toBe(lobby.id);
    const [inv] = await admin<{ status: string }>('select status from public.lobby_invitations where id = $1', [invitationId]);
    expect(inv!.status).toBe('accepted');
  });

  it('expires stale invitations', async () => {
    const host = await createUser();
    const friend = await createUser();
    await makeFriends(host, friend);
    const lobby = await createLobby(host);
    const invitationId = await rpc<string>(host, 'invite_to_lobby', [lobby.id, friend.id]);
    await admin(`update public.lobby_invitations set expires_at = now() - interval '1 second' where id = $1`, [invitationId]);
    expect(await rpc(friend, 'respond_lobby_invitation', [invitationId, true])).toBeNull();
    const [inv] = await admin<{ status: string }>('select status from public.lobby_invitations where id = $1', [invitationId]);
    expect(inv!.status).toBe('expired');
  });

  it('honours the invitee policy', async () => {
    const host = await createUser();
    const friend = await createUser();
    await makeFriends(host, friend);
    await admin(`update public.user_settings set invites_from = 'nobody' where user_id = $1`, [friend.id]);
    const lobby = await createLobby(host);
    await expectError(rpc(host, 'invite_to_lobby', [lobby.id, friend.id]), 'PV_INVITES_DISABLED');
  });

  it('reports a full lobby when accepting', async () => {
    const host = await createUser();
    const friend = await createUser();
    await makeFriends(host, friend);
    const lobby = await createLobby(host);
    const invitationId = await rpc<string>(host, 'invite_to_lobby', [lobby.id, friend.id]);
    await rpc(await createUser(), 'join_lobby_by_code', [lobby.code, false]);
    await expectError(rpc(friend, 'respond_lobby_invitation', [invitationId, true]), 'PV_LOBBY_FULL');
  });
});

describe('lobby chat', () => {
  it('masks profanity, rejects duplicates and rate limits', async () => {
    const host = await createUser();
    const lobby = await createLobby(host);
    const message = await rpcRecord<{ body: string }>(host, 'send_lobby_message', [lobby.id, 'oh merde alors', 'text']);
    expect(message.body).toBe('oh m**** alors');
    await expectError(rpc(host, 'send_lobby_message', [lobby.id, 'oh merde alors', 'text']), 'PV_MESSAGE_DUPLICATE');
    await expectError(rpc(host, 'send_lobby_message', [lobby.id, 'not-a-quick-id', 'quick']), 'PV_MESSAGE_INVALID');
    await rpc(host, 'send_lobby_message', [lobby.id, 'gg', 'quick']);
    for (let i = 0; i < 4; i++) {
      await rpc(host, 'send_lobby_message', [lobby.id, `message ${i}`, 'text']);
    }
    await expectError(rpc(host, 'send_lobby_message', [lobby.id, 'one too many', 'text']), 'PV_RATE_LIMITED');

    const history = await rpcRows<{ kind: string; body: string }>(host, 'list_lobby_messages', [lobby.id, null, 50]);
    expect(history[0]!.body).toBe('message 3');
    expect(history.some((m) => m.kind === 'system' && m.body === 'lobby_created')).toBe(true);
  });

  it('refuses muted players and non-members', async () => {
    const host = await createUser();
    const outsider = await createUser();
    const lobby = await createLobby(host);
    await expectError(rpc(outsider, 'send_lobby_message', [lobby.id, 'hi', 'text']), 'PV_NOT_LOBBY_MEMBER');
    await admin(`insert into app_private.moderation_actions (user_id, action, reason) values ($1, 'mute', 'spam')`, [host.id]);
    await expectError(rpc(host, 'send_lobby_message', [lobby.id, 'hi', 'text']), 'PV_MUTED');
  });

  it('captures chat evidence in reports', async () => {
    const host = await createUser();
    const guest = await createUser();
    const lobby = await createLobby(host);
    await rpc(guest, 'join_lobby_by_code', [lobby.code, false]);
    await rpc(guest, 'send_lobby_message', [lobby.id, 'you are bad', 'text']);
    const reportId = await rpc<string>(host, 'report_user', [guest.id, 'lobby_chat', 'harassment', '', lobby.id]);
    const [report] = await admin<{ evidence: { messages: { body: string }[] } }>('select evidence from public.reports where id = $1', [reportId]);
    expect(report!.evidence.messages.map((m) => m.body)).toEqual(['you are bad']);
  });
});
