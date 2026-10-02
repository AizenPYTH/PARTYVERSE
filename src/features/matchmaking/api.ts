import { z } from 'zod';

import { callRpc } from '@/lib/rpc';

export const ticketSchema = z.object({
  status: z.enum(['searching', 'matched', 'cancelled', 'expired']),
  game_id: z.string(),
  mode: z.string(),
  rating: z.number(),
  lobby_id: z.string().nullable(),
  match_id: z.string().nullable(),
  waited_seconds: z.number(),
  window: z.number(),
  expires_at: z.string(),
});
export type MatchmakingTicket = z.infer<typeof ticketSchema>;

export const matchmakingApi = {
  enqueue: (gameId: string, mode = 'classic') =>
    callRpc('enqueue_matchmaking', { p_game_id: gameId, p_mode: mode }, ticketSchema),
  poll: () => callRpc('poll_matchmaking', {}, ticketSchema.nullable()),
  cancel: () => callRpc('cancel_matchmaking', {}, ticketSchema.nullable()),
};
