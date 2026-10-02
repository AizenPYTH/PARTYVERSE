import { z } from 'zod';

import { callRpc } from '@/lib/rpc';

import { invokeGameAction } from './gameActionClient';

const id = z.string();

export const matchPlayerSchema = z.object({
  seat: z.number().int(),
  user_id: id.nullable(),
  username: z.string().nullable(),
  display_name: z.string().nullable(),
  avatar_id: z.string().nullable(),
  level: z.number().nullable(),
  result: z.enum(['win', 'loss', 'draw']).nullable(),
  rank: z.number().int().nullable().optional(),
  score: z.number().nullable().optional(),
  left: z.boolean().optional(),
  rating_before: z.number().nullable(),
  rating_after: z.number().nullable(),
  xp_awarded: z.number(),
  win_streak: z.number(),
  series_wins: z.number(),
  is_online: z.boolean(),
});
export type MatchPlayer = z.infer<typeof matchPlayerSchema>;

export const matchStateSchema = z.object({
  match: z.object({
    id,
    lobby_id: id.nullable(),
    game_id: z.string(),
    network_model: z.string().optional(),
    mode: z.string(),
    ranked: z.boolean(),
    status: z.enum(['active', 'finished', 'aborted']),
    state: z.unknown(),
    settings: z.record(z.string(), z.unknown()).optional(),
    version: z.number().int(),
    current_turn_seat: z.number().int().nullable(),
    active_seats: z.array(z.number().int()).optional(),
    turn_seconds: z.number(),
    turn_deadline: z.string().nullable(),
    outcome: z.enum(['win', 'draw', 'completed', 'resignation', 'timeout', 'abandon', 'aborted']).nullable(),
    result_detail: z.object({ reason: z.string().optional() }).passthrough().optional(),
    winner_seat: z.number().int().nullable(),
    started_at: z.string(),
    ended_at: z.string().nullable(),
    round: z.number().int(),
  }),
  players: z.array(matchPlayerSchema),
  my_seat: z.number().int().nullable(),
  private_state: z.unknown().optional(),
  server_time: z.string(),
});
export type MatchState = z.infer<typeof matchStateSchema>;

export const matchesApi = {
  state: (matchId: string) => callRpc('get_match_state', { p_match: matchId }, matchStateSchema),
  resign: (matchId: string) => callRpc('resign_match', { p_match: matchId }, matchStateSchema),
  claimTimeout: (matchId: string) => callRpc('claim_match_timeout', { p_match: matchId }, matchStateSchema),
  submitConnectFourMove: (matchId: string, column: number, expectedVersion: number) =>
    callRpc(
      'submit_connect_four_move',
      { p_match: matchId, p_column: column, p_expected_version: expectedVersion },
      matchStateSchema,
    ),
};

/** Engine games (network_model = turn_based_engine) go through the game-action Edge Function. */
export const engineApi = {
  start: (lobbyId: string) => invokeGameAction({ op: 'start', lobbyId }, z.object({ matchId: z.string() })),
  action: (matchId: string, version: number, action: unknown) =>
    invokeGameAction({ op: 'action', matchId, version, action }, z.object({ version: z.number() })),
  timeout: (matchId: string) => invokeGameAction({ op: 'timeout', matchId }, z.object({ version: z.number() })),
};

export const isEngineMatch = (state: Pick<MatchState, 'match'>) => state.match.network_model === 'turn_based_engine';
