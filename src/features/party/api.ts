import { z } from 'zod';

import { callRpc, voidResult } from '@/lib/rpc';

const id = z.string().uuid();

export const PARTY_FORMATS = ['classic', 'quick', 'friends', 'competitive', 'custom'] as const;
export type PartyFormat = (typeof PARTY_FORMATS)[number];

const standingSchema = z.object({
  user_id: id,
  username: z.string().nullable(),
  display_name: z.string().nullable(),
  avatar_id: z.string().nullable(),
  points: z.number(),
  wins: z.number(),
  rounds_played: z.number(),
});
export type PartyStanding = z.infer<typeof standingSchema>;

const roundSchema = z.object({
  round: z.number(),
  game_id: z.string(),
  name: z.string(),
  status: z.enum(['pending', 'done', 'skipped']),
  match_id: id.nullable(),
  winners: z.array(id),
});
export type PartyRound = z.infer<typeof roundSchema>;

export const partyStateSchema = z
  .object({
    session: z.object({
      id,
      format: z.enum(PARTY_FORMATS),
      status: z.enum(['active', 'finished', 'cancelled']),
      rounds_total: z.number(),
      current_round: z.number(),
      playlist: z.array(z.object({ game_id: z.string(), name: z.string() })),
      created_at: z.string(),
      finished_at: z.string().nullable(),
    }),
    rounds: z.array(roundSchema),
    standings: z.array(standingSchema),
  })
  .nullable();
export type PartyState = z.infer<typeof partyStateSchema>;

const nextRoundSchema = z.union([
  z.object({ finished: z.literal(true), session_id: id }),
  z.object({
    finished: z.literal(false),
    session_id: id,
    round: z.number(),
    game_id: z.string(),
    network_model: z.string(),
  }),
]);
export type NextRound = z.infer<typeof nextRoundSchema>;

export const partyApi = {
  state: (lobbyId: string) => callRpc('get_party_state', { p_lobby: lobbyId }, partyStateSchema),
  start: (lobbyId: string, format: PartyFormat, rounds: number, games: string[] | null) =>
    callRpc('start_party', { p_lobby: lobbyId, p_format: format, p_rounds: rounds, p_games: games }, id),
  nextRound: (lobbyId: string) => callRpc('party_next_round', { p_lobby: lobbyId }, nextRoundSchema),
  end: (lobbyId: string) => callRpc('end_party', { p_lobby: lobbyId }, voidResult),
};
