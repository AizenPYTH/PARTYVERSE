import { z } from 'zod';

import { callRpc } from '@/lib/rpc';

export const questSchema = z.object({
  id: z.string(),
  period: z.enum(['daily', 'weekly']),
  name: z.string(),
  target: z.number(),
  reward_xp: z.number(),
  progress: z.number(),
  claimed: z.boolean(),
  resets_at: z.string(),
});
export type Quest = z.infer<typeof questSchema>;

export const achievementSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(['games', 'mastery', 'social', 'party']),
  threshold: z.number(),
  reward_xp: z.number(),
  progress: z.number(),
  unlocked_at: z.string().nullable(),
});
export type Achievement = z.infer<typeof achievementSchema>;

export const progressionSchema = z.object({
  level: z.number(),
  xp: z.number(),
  level_xp: z.number(),
  next_level_xp: z.number(),
  play_streak: z.number(),
  quests: z.array(questSchema),
  achievements: z.array(achievementSchema),
});
export type Progression = z.infer<typeof progressionSchema>;

const xpRowSchema = z.object({
  rank: z.coerce.number(),
  user_id: z.string().uuid(),
  username: z.string().nullable(),
  display_name: z.string().nullable(),
  avatar_id: z.string().nullable(),
  level: z.number(),
  xp: z.coerce.number(),
  is_me: z.boolean(),
});
export type XpRow = z.infer<typeof xpRowSchema>;

export const progressionApi = {
  mine: () => callRpc('get_my_progression', {}, progressionSchema),
  claim: (questId: string) => callRpc('claim_quest', { p_quest: questId }, z.number()),
  xpLeaderboard: (scope: 'global' | 'friends', period: 'week' | 'all') =>
    callRpc('get_xp_leaderboard', { p_scope: scope, p_period: period, p_limit: 50 }, z.array(xpRowSchema)),
  playerAchievements: (userId: string) =>
    callRpc(
      'get_player_achievements',
      { p_user: userId },
      z.array(z.object({ id: z.string(), name: z.string(), category: z.string(), unlocked_at: z.string() })),
    ),
};
