import { z } from 'zod';

import { AppError, toAppError } from '@/lib/errors';
import { callRpc } from '@/lib/rpc';
import { requireSupabase } from '@/lib/supabase';

export const notificationSchema = z.object({
  id: z.string(),
  type: z.enum([
    'friend_request',
    'friend_accepted',
    'lobby_invite',
    'level_up',
    'item_unlocked',
    'system',
    'direct_message',
    'group_invite',
    'group_challenge',
    'achievement',
    'quest',
  ]),
  actor_id: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  read_at: z.string().nullable(),
  created_at: z.string(),
  actor: z
    .object({ username: z.string().nullable(), display_name: z.string(), avatar_id: z.string() })
    .nullable(),
});
export type AppNotification = z.infer<typeof notificationSchema>;

export const notificationsApi = {
  async list(): Promise<AppNotification[]> {
    const { data, error } = await requireSupabase()
      .from('notifications')
      .select('id,type,actor_id,payload,read_at,created_at,actor:profiles!notifications_actor_id_fkey(username,display_name,avatar_id)')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw toAppError(error);
    const parsed = z.array(notificationSchema).safeParse(data);
    if (!parsed.success) throw new AppError('PV_BAD_RESPONSE', { cause: parsed.error });
    return parsed.data;
  },
  markRead: (ids?: string[]) => callRpc('mark_notifications_read', { p_ids: ids ?? null }, z.number()),
};
