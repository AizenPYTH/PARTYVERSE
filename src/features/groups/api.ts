import { z } from 'zod';

import { callRpc, voidResult } from '@/lib/rpc';

const id = z.string().uuid();
export const GROUP_ROLES = ['owner', 'admin', 'member'] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

const groupInfo = z.object({
  id,
  name: z.string(),
  description: z.string(),
  visibility: z.enum(['private', 'public']),
  hue: z.number(),
  created_at: z.string(),
});

export const myGroupSchema = z.object({
  id,
  name: z.string(),
  description: z.string(),
  visibility: z.enum(['private', 'public']),
  hue: z.number(),
  role: z.enum(GROUP_ROLES),
  members: z.number(),
  online: z.number(),
  last_message_at: z.string().nullable(),
});
export type MyGroup = z.infer<typeof myGroupSchema>;

const memberSchema = z.object({
  user_id: id,
  username: z.string().nullable(),
  display_name: z.string().nullable(),
  avatar_id: z.string().nullable(),
  level: z.number().nullable(),
  role: z.enum(GROUP_ROLES),
  joined_at: z.string(),
  presence: z.string().nullable(),
  week_wins: z.number(),
  week_matches: z.number(),
});
export type GroupMember = z.infer<typeof memberSchema>;

const activitySchema = z.object({
  id: z.number(),
  kind: z.enum(['created', 'member_joined', 'member_left', 'member_kicked', 'role_changed', 'match_played', 'challenge_completed']),
  payload: z.record(z.string(), z.unknown()),
  created_at: z.string(),
  actor: z.object({ id, username: z.string().nullable(), display_name: z.string().nullable() }).nullable(),
});
export type GroupActivity = z.infer<typeof activitySchema>;

export const challengeSchema = z.object({
  id,
  kind: z.enum(['matches_together', 'member_wins', 'variety']),
  target: z.number(),
  progress: z.number(),
  week_start: z.string(),
  completed_at: z.string().nullable(),
});
export type GroupChallenge = z.infer<typeof challengeSchema>;

export const groupSchema = z.union([
  z.object({
    group: groupInfo,
    my_role: z.enum(GROUP_ROLES),
    member_count: z.number(),
    members: z.array(memberSchema),
    challenge: challengeSchema,
    activity: z.array(activitySchema),
    pending_invitations: z.array(z.object({ id, invitee_id: id, username: z.string().nullable(), display_name: z.string().nullable() })),
  }),
  z.object({ group: groupInfo, my_role: z.null(), member_count: z.number() }),
]);
export type GroupState = z.infer<typeof groupSchema>;

const groupMessageSchema = z.object({
  id,
  sender_id: id.nullable(),
  body: z.string(),
  created_at: z.string(),
  username: z.string().nullable(),
  display_name: z.string().nullable(),
  avatar_id: z.string().nullable(),
});
export type GroupMessage = z.infer<typeof groupMessageSchema>;

export const groupInvitationSchema = z.object({
  id,
  group_id: id,
  group_name: z.string(),
  hue: z.number(),
  created_at: z.string(),
  inviter: z.object({ id, username: z.string().nullable(), display_name: z.string().nullable(), avatar_id: z.string().nullable() }),
});
export type GroupInvitation = z.infer<typeof groupInvitationSchema>;

const publicGroupSchema = z.object({ id, name: z.string(), description: z.string(), hue: z.number(), members: z.number(), is_member: z.boolean() });

export const groupsApi = {
  mine: () => callRpc('list_my_groups', {}, z.array(myGroupSchema)),
  get: (groupId: string) => callRpc('get_group', { p_group: groupId }, groupSchema),
  create: (name: string, description: string, visibility: 'private' | 'public') =>
    callRpc('create_group', { p_name: name, p_description: description, p_visibility: visibility }, id),
  update: (groupId: string, patch: { name?: string; description?: string; visibility?: 'private' | 'public' }) =>
    callRpc(
      'update_group',
      { p_group: groupId, p_name: patch.name ?? null, p_description: patch.description ?? null, p_visibility: patch.visibility ?? null },
      voidResult,
    ),
  invite: (groupId: string, userId: string) => callRpc('invite_to_group', { p_group: groupId, p_user: userId }, id),
  respond: (invitationId: string, accept: boolean) =>
    callRpc('respond_group_invitation', { p_invitation: invitationId, p_accept: accept }, id),
  invitations: () => callRpc('list_my_group_invitations', {}, z.array(groupInvitationSchema)),
  joinPublic: (groupId: string) => callRpc('join_public_group', { p_group: groupId }, voidResult),
  leave: (groupId: string) => callRpc('leave_group', { p_group: groupId }, voidResult),
  kick: (groupId: string, userId: string) => callRpc('kick_group_member', { p_group: groupId, p_user: userId }, voidResult),
  setRole: (groupId: string, userId: string, role: GroupRole) =>
    callRpc('set_group_role', { p_group: groupId, p_user: userId, p_role: role }, voidResult),
  messages: (groupId: string) => callRpc('list_group_messages', { p_group: groupId, p_before: null }, z.array(groupMessageSchema)),
  send: (groupId: string, body: string) => callRpc('send_group_message', { p_group: groupId, p_body: body }, z.object({ id }).passthrough()),
  search: (query: string) => callRpc('search_public_groups', { p_query: query }, z.array(publicGroupSchema)),
  inviteToLobby: (groupId: string, lobbyId: string) =>
    callRpc('invite_group_to_lobby', { p_group: groupId, p_lobby: lobbyId }, z.number()),
};
