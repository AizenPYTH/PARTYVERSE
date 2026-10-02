import { z } from 'zod';

import { AppError, toAppError } from '@/lib/errors';
import { callRpc } from '@/lib/rpc';
import { requireSupabase } from '@/lib/supabase';

const id = z.string();
const timestamp = z.string();

export const presenceSchema = z.enum(['online', 'away', 'dnd', 'in_game', 'in_lobby', 'offline']);
export type Presence = z.infer<typeof presenceSchema>;

const progressSchema = z.object({ level_start_xp: z.number(), next_level_xp: z.number() });

const activeLobbySchema = z.object({
  lobby_id: id,
  game_id: z.string(),
  status: z.string(),
  role: z.string(),
  current_match_id: id.nullable(),
});

const activeMatchSchema = z.object({
  match_id: id,
  lobby_id: id.nullable(),
  game_id: z.string(),
  my_turn: z.boolean().nullable(),
  move_count: z.number(),
  opponent_username: z.string().nullable(),
});

export const homeOverviewSchema = z.object({
  profile: z.object({
    id,
    username: z.string().nullable(),
    display_name: z.string(),
    avatar_id: z.string(),
    title_id: z.string().nullable(),
    level: z.number(),
    xp: z.number(),
    onboarding_completed: z.boolean(),
  }),
  progress: progressSchema,
  unread_notifications: z.number(),
  pending_friend_requests: z.number(),
  active_lobby: activeLobbySchema.nullable(),
  active_match: activeMatchSchema.nullable(),
});
export type HomeOverview = z.infer<typeof homeOverviewSchema>;

const gameStatsSchema = z.object({
  game_id: z.string(),
  played: z.number(),
  wins: z.number(),
  losses: z.number(),
  draws: z.number(),
  current_win_streak: z.number(),
  best_win_streak: z.number(),
  rating: z.number().nullable(),
  friends_rank: z.number().nullable(),
});

export const statsSchema = z.object({
  played: z.number(),
  wins: z.number(),
  losses: z.number(),
  draws: z.number(),
  total_seconds: z.number(),
  best_win_streak: z.number(),
  games: z.array(gameStatsSchema),
});
export type PlayerStats = z.infer<typeof statsSchema>;

export const relationshipSchema = z.enum(['self', 'friend', 'incoming_request', 'outgoing_request', 'blocked', 'none']);
export type Relationship = z.infer<typeof relationshipSchema>;

export const playerProfileSchema = z.object({
  profile: z.object({
    id,
    username: z.string().nullable(),
    display_name: z.string(),
    avatar_id: z.string(),
    title_id: z.string().nullable(),
    level: z.number(),
    xp: z.number(),
    bio: z.string(),
    favorite_games: z.array(z.string()),
    created_at: timestamp,
  }),
  progress: progressSchema,
  relationship: relationshipSchema,
  mutual_friends: z.number(),
  friend_count: z.number(),
  presence: z
    .object({ presence: presenceSchema, game_id: z.string().optional(), lobby_id: id.nullable().optional() })
    .nullable(),
  stats_visible: z.boolean(),
  stats: statsSchema.nullable(),
});
export type PlayerProfile = z.infer<typeof playerProfileSchema>;

export const settingsSchema = z.object({
  user_id: id,
  profile_visibility: z.enum(['public', 'friends']),
  friend_requests_from: z.enum(['everyone', 'friends_of_friends', 'nobody']),
  invites_from: z.enum(['friends', 'nobody']),
  messages_from: z.enum(['everyone', 'friends', 'nobody']),
  allow_join_from_friends: z.boolean(),
  show_presence: z.boolean(),
  notification_prefs: z.record(z.string(), z.boolean()),
  push_prefs: z.record(z.string(), z.boolean()),
  streak_reminders: z.boolean(),
});
export type UserSettings = z.infer<typeof settingsSchema>;
export type SettingsPatch = Partial<Omit<UserSettings, 'user_id'>>;

export const cosmeticSchema = z.object({
  id: z.string(),
  kind: z.enum(['avatar', 'frame', 'badge', 'title', 'theme', 'victory_effect']),
  name: z.string(),
  rarity: z.enum(['common', 'rare', 'epic', 'legendary']),
  unlock_rule: z.object({ type: z.string(), level: z.number().optional() }),
  sort_order: z.number(),
});
export type Cosmetic = z.infer<typeof cosmeticSchema>;

const historySchema = z.object({
  match_id: id,
  game_id: z.string(),
  outcome: z.string().nullable(),
  result: z.enum(['win', 'loss', 'draw']).nullable(),
  ranked: z.boolean(),
  rating_before: z.number().nullable(),
  rating_after: z.number().nullable(),
  xp_awarded: z.number(),
  opponent_id: id.nullable(),
  opponent_username: z.string().nullable(),
  opponent_avatar_id: z.string().nullable(),
  ended_at: timestamp,
});
export type MatchHistoryEntry = z.infer<typeof historySchema>;

const leaderboardSchema = z.object({
  rank: z.number(),
  user_id: id,
  username: z.string().nullable(),
  display_name: z.string(),
  avatar_id: z.string(),
  level: z.number(),
  rating: z.number(),
  games_played: z.number(),
  is_me: z.boolean(),
});
export type LeaderboardEntry = z.infer<typeof leaderboardSchema>;

export const profileApi = {
  homeOverview: () => callRpc('get_home_overview', {}, homeOverviewSchema),
  playerProfile: (userId: string) => callRpc('get_player_profile', { p_user: userId }, playerProfileSchema),
  matchHistory: (userId: string | null) =>
    callRpc('list_match_history', { p_user: userId, p_limit: 20 }, z.array(historySchema)),
  leaderboard: (gameId: string, scope: 'global' | 'friends', mode = 'classic') =>
    callRpc('get_leaderboard', { p_game_id: gameId, p_scope: scope, p_mode: mode, p_limit: 50 }, z.array(leaderboardSchema)),
  isUsernameAvailable: (username: string) =>
    callRpc('is_username_available', { p_username: username }, z.boolean()),
  completeOnboarding: (input: { username: string; displayName: string; avatarId: string; favoriteGames: string[] }) =>
    callRpc(
      'complete_onboarding',
      {
        p_username: input.username,
        p_display_name: input.displayName,
        p_avatar_id: input.avatarId,
        p_favorite_games: input.favoriteGames,
      },
      z.object({ id, username: z.string() }).passthrough(),
    ),

  async updateProfile(userId: string, patch: { display_name?: string; bio?: string; avatar_id?: string; title_id?: string | null; favorite_games?: string[] }) {
    const { error } = await requireSupabase().from('profiles').update(patch).eq('id', userId);
    if (error) throw toAppError(error);
  },

  async settings(): Promise<UserSettings> {
    const { data, error } = await requireSupabase().from('user_settings').select('*').single();
    if (error) throw toAppError(error);
    const parsed = settingsSchema.safeParse(data);
    if (!parsed.success) throw new AppError('PV_BAD_RESPONSE', { cause: parsed.error });
    return parsed.data;
  },

  async updateSettings(userId: string, patch: SettingsPatch) {
    const { error } = await requireSupabase().from('user_settings').update(patch).eq('user_id', userId);
    if (error) throw toAppError(error);
  },

  async cosmetics(): Promise<Cosmetic[]> {
    const { data, error } = await requireSupabase().from('cosmetic_items').select('id,kind,name,rarity,unlock_rule,sort_order').order('sort_order');
    if (error) throw toAppError(error);
    const parsed = z.array(cosmeticSchema).safeParse(data);
    if (!parsed.success) throw new AppError('PV_BAD_RESPONSE', { cause: parsed.error });
    return parsed.data;
  },

  async inventory(): Promise<string[]> {
    const { data, error } = await requireSupabase().from('player_inventory').select('item_id');
    if (error) throw toAppError(error);
    return z.array(z.object({ item_id: z.string() })).parse(data).map((row) => row.item_id);
  },
};

export function ownsCosmetic(item: Cosmetic, inventory: readonly string[]): boolean {
  return item.unlock_rule.type === 'starter' || inventory.includes(item.id);
}
