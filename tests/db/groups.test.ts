import { admin, asUser, createLobby, createUser, expectError, makeFriends, rpc, startDuel, type TestUser } from './helpers';

interface GroupView {
  my_role: string | null;
  member_count: number;
  members: { user_id: string; role: string; week_wins: number }[];
  challenge: { kind: string; target: number; progress: number; completed_at: string | null };
  activity: { kind: string }[];
  pending_invitations: { invitee_id: string }[];
}

async function groupWith(owner: TestUser, members: TestUser[], visibility = 'private') {
  const groupId = await rpc<string>(owner, 'create_group', ['Les Comètes', 'Soirées jeux du jeudi', visibility]);
  for (const member of members) {
    await makeFriends(owner, member);
    const invitation = await rpc<string>(owner, 'invite_to_group', [groupId, member.id]);
    await rpc(member, 'respond_group_invitation', [invitation, true]);
  }
  return groupId;
}

describe('groups', () => {
  it('runs invitations, roles, kicks and ownership transfer', async () => {
    const owner = await createUser();
    const [a, b] = [await createUser(), await createUser()];
    const groupId = await groupWith(owner, [a]);
    await makeFriends(owner, b);
    const invitation = await rpc<string>(owner, 'invite_to_group', [groupId, b.id]);
    expect((await rpc<GroupView>(owner, 'get_group', [groupId])).pending_invitations.map((i) => i.invitee_id)).toEqual([b.id]);
    // b can preview the group through the invitation, but not read members.
    expect(await asUser(b, 'select id from public.groups where id = $1', [groupId])).toEqual([{ id: groupId }]);
    expect(await asUser(b, 'select * from public.group_members where group_id = $1', [groupId])).toEqual([]);
    await rpc(b, 'respond_group_invitation', [invitation, true]);

    await expectError(rpc(a, 'kick_group_member', [groupId, b.id]), 'PV_GROUP_FORBIDDEN');
    await rpc(owner, 'set_group_role', [groupId, a.id, 'admin']);
    await rpc(a, 'kick_group_member', [groupId, b.id]);
    await expectError(rpc(a, 'kick_group_member', [groupId, owner.id]), 'PV_GROUP_FORBIDDEN');
    await expectError(rpc(b, 'get_group', [groupId]), 'PV_GROUP_NOT_FOUND');

    await rpc(owner, 'leave_group', [groupId]);
    const view = await rpc<GroupView>(a, 'get_group', [groupId]);
    expect(view.my_role).toBe('owner');
    expect(view.activity.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['created', 'member_joined', 'member_kicked', 'member_left', 'role_changed']),
    );
    await rpc(a, 'leave_group', [groupId]);
    expect(await admin('select id from public.groups where id = $1', [groupId])).toEqual([]);
  });

  it('only lets admins invite friends who accept invitations', async () => {
    const owner = await createUser();
    const member = await createUser();
    const stranger = await createUser();
    const groupId = await groupWith(owner, [member]);
    await expectError(rpc(owner, 'invite_to_group', [groupId, stranger.id]), 'PV_NOT_FRIENDS');
    await makeFriends(member, stranger);
    await expectError(rpc(member, 'invite_to_group', [groupId, stranger.id]), 'PV_GROUP_FORBIDDEN');
    await expectError(rpc(owner, 'invite_to_group', [groupId, member.id]), 'PV_ALREADY_IN_GROUP');
    await expectError(rpc(stranger, 'join_public_group', [groupId]), 'PV_GROUP_NOT_FOUND');
    await expectError(rpc(owner, 'create_group', ['ab', '', 'private']), 'PV_INVALID_INPUT');
  });

  it('keeps chat to members and lets anyone join a public group', async () => {
    const owner = await createUser();
    const visitor = await createUser();
    const groupId = await groupWith(owner, [], 'public');
    await rpc(owner, 'send_group_message', [groupId, 'Bienvenue !']);
    await expectError(rpc(visitor, 'list_group_messages', [groupId, null]), 'PV_GROUP_NOT_FOUND');
    const found = await rpc<{ id: string }[]>(visitor, 'search_public_groups', ['comètes']);
    expect(found.map((g) => g.id)).toContain(groupId);
    expect((await rpc<GroupView>(visitor, 'get_group', [groupId])).my_role).toBeNull();
    await rpc(visitor, 'join_public_group', [groupId]);
    const messages = await rpc<{ body: string }[]>(visitor, 'list_group_messages', [groupId, null]);
    expect(messages.map((m) => m.body)).toEqual(['Bienvenue !']);
  });

  it('tracks matches between members for activity and the weekly challenge', async () => {
    const { matchId, seats } = await startDuel();
    const [x, y] = seats;
    const groupId = await groupWith(x, [y]);
    await rpc(y, 'resign_match', [matchId]);
    const view = await rpc<GroupView>(x, 'get_group', [groupId]);
    expect(view.activity[0]).toMatchObject({ kind: 'match_played' });
    expect(view.members[0]).toMatchObject({ user_id: x.id, week_wins: 1 });
    expect(view.challenge.progress).toBeGreaterThanOrEqual(1);
    // Forcing completion awards XP once.
    await admin(`update public.group_challenges set target = 1, completed_at = null where group_id = $1`, [groupId]);
    await rpc(x, 'get_group', [groupId]);
    await rpc(x, 'get_group', [groupId]);
    const xp = await admin<{ n: string }>(`select count(*) as n from public.xp_events where reason = 'group_challenge' and user_id = $1`, [x.id]);
    expect(Number(xp[0]!.n)).toBe(1);
  });

  it('invites the whole group into a room', async () => {
    const owner = await createUser();
    const [a, b] = [await createUser(), await createUser()];
    const groupId = await groupWith(owner, [a, b]);
    await asUser(b, `update public.user_settings set invites_from = 'nobody' where user_id = $1`, [b.id]);
    const lobby = await createLobby(owner, { gameId: 'quiz_rush', maxPlayers: 4 });
    expect(await rpc<number>(owner, 'invite_group_to_lobby', [groupId, lobby.id])).toBe(1);
    const invites = await admin<{ recipient_id: string }>('select recipient_id from public.lobby_invitations where lobby_id = $1', [lobby.id]);
    expect(invites).toEqual([{ recipient_id: a.id }]);
  });
});
