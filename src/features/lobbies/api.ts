import { z } from 'zod';

import { callRpc, voidResult } from '@/lib/rpc';

const id = z.string();

export const lobbyStatusSchema = z.enum(['waiting', 'ready', 'in_progress', 'finished', 'cancelled', 'expired']);
export type LobbyStatus = z.infer<typeof lobbyStatusSchema>;

export const lobbyMemberSchema = z.object({
  user_id: id,
  username: z.string().nullable(),
  display_name: z.string(),
  avatar_id: z.string(),
  level: z.number(),
  role: z.enum(['player', 'spectator']),
  is_ready: z.boolean(),
  joined_at: z.string(),
  is_online: z.boolean(),
});
export type LobbyMember = z.infer<typeof lobbyMemberSchema>;

export const lobbyStateSchema = z.object({
  lobby: z.object({
    id,
    code: z.string().nullable(),
    host_id: id.nullable(),
    game_id: z.string(),
    name: z.string(),
    visibility: z.enum(['public', 'private']),
    max_players: z.number(),
    allow_spectators: z.boolean(),
    auto_start: z.boolean(),
    ranked: z.boolean(),
    source: z.enum(['custom', 'matchmaking']),
    settings: z.record(z.string(), z.unknown()),
    status: lobbyStatusSchema,
    current_match_id: id.nullable(),
    matches_played: z.number(),
    created_at: z.string(),
  }),
  members: z.array(lobbyMemberSchema),
  my_role: z.enum(['player', 'spectator']).nullable(),
  server_time: z.string(),
});
export type LobbyState = z.infer<typeof lobbyStateSchema>;

export const lobbyMessageSchema = z.object({
  id,
  lobby_id: id,
  sender_id: id.nullable(),
  sender_username: z.string().nullable(),
  sender_display_name: z.string().nullable(),
  sender_avatar_id: z.string().nullable(),
  kind: z.enum(['text', 'quick', 'system']),
  body: z.string(),
  meta: z.record(z.string(), z.unknown()),
  created_at: z.string(),
});
export type LobbyMessage = z.infer<typeof lobbyMessageSchema>;

const createdLobbySchema = z.object({ id, code: z.string() }).passthrough();

const publicLobbySchema = z.object({
  lobby_id: id,
  name: z.string(),
  game_id: z.string(),
  host_id: id,
  host_username: z.string().nullable(),
  host_avatar_id: z.string(),
  player_count: z.number(),
  max_players: z.number(),
  status: lobbyStatusSchema,
  created_at: z.string(),
});
export type PublicLobby = z.infer<typeof publicLobbySchema>;

export const invitationSchema = z.object({
  invitation_id: id,
  lobby_id: id,
  game_id: z.string(),
  lobby_status: lobbyStatusSchema,
  player_count: z.number(),
  max_players: z.number(),
  sender_id: id,
  sender_username: z.string().nullable(),
  sender_display_name: z.string(),
  sender_avatar_id: z.string(),
  created_at: z.string(),
  expires_at: z.string(),
});
export type Invitation = z.infer<typeof invitationSchema>;

export interface CreateLobbyInput {
  gameId: string;
  visibility: 'public' | 'private';
  maxPlayers?: number;
  allowSpectators: boolean;
  autoStart: boolean;
  settings: Record<string, unknown>;
  name?: string;
}

export const QUICK_MESSAGES = {
  gg: 'GG !',
  gl: 'Bonne chance !',
  nice: 'Bien joué !',
  wow: 'Waouh !',
  oops: 'Oups…',
  rematch: 'Revanche ?',
  thanks: 'Merci !',
  ready: 'Je suis prêt',
} as const;
export type QuickMessageId = keyof typeof QUICK_MESSAGES;

export const lobbiesApi = {
  create: (input: CreateLobbyInput) =>
    callRpc(
      'create_lobby',
      {
        p_game_id: input.gameId,
        p_visibility: input.visibility,
        p_max_players: input.maxPlayers ?? null,
        p_allow_spectators: input.allowSpectators,
        p_auto_start: input.autoStart,
        p_settings: input.settings,
        p_name: input.name ?? '',
      },
      createdLobbySchema,
    ),
  state: (lobbyId: string) => callRpc('get_lobby_state', { p_lobby: lobbyId }, lobbyStateSchema),
  join: (lobbyId: string, asSpectator = false) =>
    callRpc('join_lobby', { p_lobby: lobbyId, p_as_spectator: asSpectator }, id),
  joinByCode: (code: string, asSpectator = false) =>
    callRpc('join_lobby_by_code', { p_code: code, p_as_spectator: asSpectator }, id.nullable()),
  leave: (lobbyId: string) => callRpc('leave_lobby', { p_lobby: lobbyId }, voidResult),
  kick: (lobbyId: string, userId: string) => callRpc('kick_lobby_member', { p_lobby: lobbyId, p_user: userId }, voidResult),
  setReady: (lobbyId: string, ready: boolean) =>
    callRpc('set_lobby_ready', { p_lobby: lobbyId, p_ready: ready }, lobbyStatusSchema),
  updateSettings: (
    lobbyId: string,
    patch: { name?: string; visibility?: 'public' | 'private'; allowSpectators?: boolean; autoStart?: boolean; settings?: Record<string, unknown> },
  ) =>
    callRpc(
      'update_lobby_settings',
      {
        p_lobby: lobbyId,
        p_name: patch.name ?? null,
        p_visibility: patch.visibility ?? null,
        p_max_players: null,
        p_allow_spectators: patch.allowSpectators ?? null,
        p_auto_start: patch.autoStart ?? null,
        p_settings: patch.settings ?? null,
      },
      z.object({ id }).passthrough(),
    ),
  start: (lobbyId: string) => callRpc('start_lobby_match', { p_lobby: lobbyId }, id),
  publicLobbies: (gameId: string) =>
    callRpc('list_public_lobbies', { p_game_id: gameId, p_limit: 30 }, z.array(publicLobbySchema)),
  invite: (lobbyId: string, userId: string) => callRpc('invite_to_lobby', { p_lobby: lobbyId, p_user: userId }, id),
  invitations: () => callRpc('list_my_invitations', {}, z.array(invitationSchema)),
  respondInvitation: (invitationId: string, accept: boolean) =>
    callRpc('respond_lobby_invitation', { p_invitation: invitationId, p_accept: accept }, id.nullable()),
  cancelInvitation: (invitationId: string) => callRpc('cancel_lobby_invitation', { p_invitation: invitationId }, voidResult),
  messages: (lobbyId: string, before?: string) =>
    callRpc('list_lobby_messages', { p_lobby: lobbyId, p_before: before ?? null, p_limit: 50 }, z.array(lobbyMessageSchema)),
  sendMessage: (lobbyId: string, body: string, kind: 'text' | 'quick') =>
    callRpc('send_lobby_message', { p_lobby: lobbyId, p_body: body, p_kind: kind }, z.object({ id }).passthrough()),
};
