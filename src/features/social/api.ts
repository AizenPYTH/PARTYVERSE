import { z } from 'zod';

import { callRpc, voidResult } from '@/lib/rpc';

import { presenceSchema, relationshipSchema } from '../profile/api';

const id = z.string();

export const friendSchema = z.object({
  user_id: id,
  username: z.string().nullable(),
  display_name: z.string(),
  avatar_id: z.string(),
  level: z.number(),
  presence: presenceSchema,
  game_id: z.string().nullable(),
  lobby_id: id.nullable(),
  lobby_player_count: z.number().nullable(),
  lobby_max_players: z.number().nullable(),
  friends_since: z.string(),
});
export type Friend = z.infer<typeof friendSchema>;

export const friendRequestSchema = z.object({
  request_id: id,
  direction: z.enum(['incoming', 'outgoing']),
  user_id: id,
  username: z.string().nullable(),
  display_name: z.string(),
  avatar_id: z.string(),
  level: z.number(),
  mutual_friends: z.number(),
  last_game_together: z.string().nullable(),
  created_at: z.string(),
});
export type FriendRequest = z.infer<typeof friendRequestSchema>;

export const playerSearchSchema = z.object({
  user_id: id,
  username: z.string().nullable(),
  display_name: z.string(),
  avatar_id: z.string(),
  level: z.number(),
  relationship: relationshipSchema,
});
export type PlayerSearchResult = z.infer<typeof playerSearchSchema>;

const recentPlayerSchema = playerSearchSchema.extend({ game_id: z.string(), last_played_at: z.string() });
export type RecentPlayer = z.infer<typeof recentPlayerSchema>;

const blockedSchema = z.object({
  user_id: id,
  username: z.string().nullable(),
  display_name: z.string(),
  avatar_id: z.string(),
  blocked_at: z.string(),
});
export type BlockedUser = z.infer<typeof blockedSchema>;

export type PresenceStatus = 'online' | 'away' | 'dnd' | 'invisible';
export type ReportReason = 'spam' | 'harassment' | 'hate' | 'cheating' | 'inappropriate_name' | 'other';
export type ReportContext = 'profile' | 'username' | 'lobby_chat' | 'match' | 'direct_message' | 'group_chat';

export const socialApi = {
  friends: () => callRpc('list_friends', {}, z.array(friendSchema)),
  friendRequests: () => callRpc('list_friend_requests', {}, z.array(friendRequestSchema)),
  recentPlayers: () => callRpc('list_recent_players', { p_limit: 20 }, z.array(recentPlayerSchema)),
  blocked: () => callRpc('list_blocked_users', {}, z.array(blockedSchema)),
  search: (query: string) => callRpc('search_players', { p_query: query, p_limit: 20 }, z.array(playerSearchSchema)),
  sendRequest: (userId: string) =>
    callRpc('send_friend_request', { p_target: userId }, z.enum(['pending', 'accepted'])),
  respond: (requestId: string, accept: boolean) =>
    callRpc('respond_friend_request', { p_request: requestId, p_accept: accept }, z.enum(['accepted', 'declined'])),
  cancelRequest: (requestId: string) => callRpc('cancel_friend_request', { p_request: requestId }, voidResult),
  removeFriend: (userId: string) => callRpc('remove_friend', { p_user: userId }, voidResult),
  block: (userId: string) => callRpc('block_user', { p_user: userId }, voidResult),
  unblock: (userId: string) => callRpc('unblock_user', { p_user: userId }, voidResult),
  report: (input: { userId: string; context: ReportContext; reason: ReportReason; details?: string; contextRef?: string }) =>
    callRpc(
      'report_user',
      {
        p_target: input.userId,
        p_context: input.context,
        p_reason: input.reason,
        p_details: input.details ?? '',
        p_context_ref: input.contextRef ?? null,
      },
      id,
    ),
  heartbeat: (status?: PresenceStatus) => callRpc('presence_heartbeat', { p_status: status ?? null }, voidResult),
  signOutPresence: () => callRpc('presence_sign_out', {}, voidResult),
  myPresenceStatus: () => callRpc('get_my_presence_status', {}, z.enum(['online', 'away', 'dnd', 'invisible'])),
};
