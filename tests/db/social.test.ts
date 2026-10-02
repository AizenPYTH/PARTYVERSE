import { admin, createLobby, createUser, expectError, makeFriends, rpc, rpcRows, startDuel } from './helpers';

interface FriendRow {
  user_id: string;
  presence: string;
  lobby_id: string | null;
  game_id: string | null;
}

describe('friend requests', () => {
  it('sends, accepts and notifies', async () => {
    const a = await createUser();
    const b = await createUser();
    expect(await rpc(a, 'send_friend_request', [b.id])).toBe('pending');
    // Idempotent while pending.
    expect(await rpc(a, 'send_friend_request', [b.id])).toBe('pending');

    const requests = await rpcRows<{ request_id: string; direction: string }>(b, 'list_friend_requests');
    expect(requests).toHaveLength(1);
    expect(requests[0]!.direction).toBe('incoming');

    const notes = await admin<{ type: string }>('select type from public.notifications where user_id = $1', [b.id]);
    expect(notes.map((n) => n.type)).toEqual(['friend_request']);

    expect(await rpc(b, 'respond_friend_request', [requests[0]!.request_id, true])).toBe('accepted');
    const friends = await rpcRows<FriendRow>(a, 'list_friends');
    expect(friends.map((f) => f.user_id)).toEqual([b.id]);
    await expectError(rpc(a, 'send_friend_request', [b.id]), 'PV_ALREADY_FRIENDS');
  });

  it('auto-accepts crossing requests', async () => {
    const a = await createUser();
    const b = await createUser();
    await rpc(a, 'send_friend_request', [b.id]);
    expect(await rpc(b, 'send_friend_request', [a.id])).toBe('accepted');
  });

  it('honours the recipient policy', async () => {
    const a = await createUser();
    const b = await createUser();
    await admin(`update public.user_settings set friend_requests_from = 'nobody' where user_id = $1`, [b.id]);
    await expectError(rpc(a, 'send_friend_request', [b.id]), 'PV_FRIEND_REQUESTS_DISABLED');

    const c = await createUser();
    const mutual = await createUser();
    await makeFriends(mutual, c);
    await admin(`update public.user_settings set friend_requests_from = 'friends_of_friends' where user_id = $1`, [c.id]);
    await expectError(rpc(a, 'send_friend_request', [c.id]), 'PV_FRIEND_REQUESTS_DISABLED');
    await makeFriends(a, mutual);
    expect(await rpc(a, 'send_friend_request', [c.id])).toBe('pending');
  });

  it('allows cancel and decline', async () => {
    const a = await createUser();
    const b = await createUser();
    await rpc(a, 'send_friend_request', [b.id]);
    const [req] = await rpcRows<{ request_id: string }>(a, 'list_friend_requests');
    await expectError(rpc(b, 'cancel_friend_request', [req!.request_id]), 'PV_REQUEST_NOT_FOUND');
    await rpc(a, 'cancel_friend_request', [req!.request_id]);
    await expectError(rpc(b, 'respond_friend_request', [req!.request_id, true]), 'PV_REQUEST_NOT_FOUND');
  });
});

describe('blocking', () => {
  it('removes the friendship and prevents contact and discovery', async () => {
    const a = await createUser();
    const b = await createUser();
    await makeFriends(a, b);
    await rpc(a, 'block_user', [b.id]);

    expect(await rpcRows(a, 'list_friends')).toEqual([]);
    await expectError(rpc(b, 'send_friend_request', [a.id]), 'PV_USER_UNAVAILABLE');
    expect(await rpcRows(b, 'search_players', [a.username])).toEqual([]);

    const lobby = await createLobby(a, { visibility: 'public' });
    await expectError(rpc(b, 'join_lobby', [lobby.id, false]), 'PV_LOBBY_FORBIDDEN');
    expect((await rpcRows<{ lobby_id: string }>(b, 'list_public_lobbies', ['connect_four'])).map((l) => l.lobby_id))
      .not.toContain(lobby.id);

    await rpc(a, 'unblock_user', [b.id]);
    expect(await rpc(b, 'send_friend_request', [a.id])).toBe('pending');
  });
});

describe('search', () => {
  it('finds onboarded players by handle prefix and treats wildcards literally', async () => {
    const a = await createUser();
    const b = await createUser();
    const found = await rpcRows<{ user_id: string; relationship: string }>(a, 'search_players', [b.username.slice(0, 8)]);
    expect(found.map((f) => f.user_id)).toContain(b.id);
    expect(await rpcRows(a, 'search_players', ['%%'])).toEqual([]);
    await expectError(rpcRows(a, 'search_players', ['x']), 'PV_INVALID_INPUT');
  });
});

describe('presence', () => {
  it('derives activity from real membership and respects privacy', async () => {
    const viewer = await createUser();
    const friend = await createUser();
    await makeFriends(viewer, friend);

    let [row] = await rpcRows<FriendRow>(viewer, 'list_friends');
    expect(row!.presence).toBe('online');

    const lobby = await createLobby(friend);
    [row] = await rpcRows<FriendRow>(viewer, 'list_friends');
    expect(row).toMatchObject({ presence: 'in_lobby', lobby_id: lobby.id, game_id: 'connect_four' });
    // Friends can join through presence when allowed.
    expect(await rpc(viewer, 'join_lobby', [lobby.id, false])).toBe(lobby.id);
    await rpc(viewer, 'leave_lobby', [lobby.id]);

    await admin('update public.user_settings set allow_join_from_friends = false where user_id = $1', [friend.id]);
    [row] = await rpcRows<FriendRow>(viewer, 'list_friends');
    expect(row!.lobby_id).toBeNull();

    await rpc(friend, 'presence_heartbeat', ['invisible']);
    [row] = await rpcRows<FriendRow>(viewer, 'list_friends');
    expect(row!.presence).toBe('offline');

    await rpc(friend, 'presence_heartbeat', ['online']);
    await admin(`update public.presence set heartbeat_at = now() - interval '2 minutes' where user_id = $1`, [friend.id]);
    [row] = await rpcRows<FriendRow>(viewer, 'list_friends');
    expect(row!.presence).toBe('offline');
  });

  it('shows friends in a match as in_game', async () => {
    const { seats } = await startDuel();
    const viewer = await createUser();
    await makeFriends(viewer, seats[0]);
    const [row] = await rpcRows<FriendRow>(viewer, 'list_friends');
    expect(row!.presence).toBe('in_game');
  });
});

describe('profiles', () => {
  it('hides stats of friends-only profiles from strangers', async () => {
    const owner = await createUser();
    const stranger = await createUser();
    await admin(`update public.user_settings set profile_visibility = 'friends' where user_id = $1`, [owner.id]);
    const view = await rpc<{ stats_visible: boolean; stats: unknown }>(stranger, 'get_player_profile', [owner.id]);
    expect(view).toMatchObject({ stats_visible: false, stats: null });
    await expectError(rpcRows(stranger, 'list_match_history', [owner.id, 10]), 'PV_PROFILE_PRIVATE');

    await makeFriends(owner, stranger);
    const asFriend = await rpc<{ stats_visible: boolean }>(stranger, 'get_player_profile', [owner.id]);
    expect(asFriend.stats_visible).toBe(true);
  });

  it('returns a home overview with progress', async () => {
    const user = await createUser();
    const overview = await rpc<{ progress: { level_start_xp: number; next_level_xp: number }; active_lobby: unknown }>(
      user, 'get_home_overview');
    expect(overview.progress).toEqual({ level_start_xp: 0, next_level_xp: 100 });
    expect(overview.active_lobby).toBeNull();
  });
});
