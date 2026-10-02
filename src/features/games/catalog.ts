import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { AppError, toAppError } from '@/lib/errors';
import { queryKeys } from '@/lib/queryClient';
import { requireSupabase } from '@/lib/supabase';

const settingDefinition = z.object({ options: z.array(z.union([z.number(), z.string(), z.boolean()])), default: z.unknown() });

export const gameSchema = z.object({
  id: z.string(),
  name: z.string(),
  tagline: z.string(),
  description: z.string(),
  category: z.string(),
  min_players: z.number().int(),
  max_players: z.number().int(),
  avg_duration_minutes: z.number().int(),
  modes: z.array(z.object({ id: z.string(), name: z.string(), ranked: z.boolean().optional() })),
  availability: z.enum(['available', 'beta', 'coming_soon', 'disabled']),
  network_model: z.string(),
  engine_version: z.number().int(),
  rules: z.object({ settings: z.record(z.string(), settingDefinition).optional() }).passthrough(),
  sort_order: z.number().int(),
});

export type Game = z.infer<typeof gameSchema>;

export const isPlayable = (game: Pick<Game, 'availability'>) =>
  game.availability === 'available' || game.availability === 'beta';

export const hasRankedMode = (game: Game) => game.modes.some((mode) => mode.ranked);

export function playersLabel(game: Pick<Game, 'min_players' | 'max_players'>): string {
  return game.min_players === game.max_players ? `${game.min_players}` : `${game.min_players}–${game.max_players}`;
}

export async function fetchCatalog(): Promise<Game[]> {
  const { data, error } = await requireSupabase()
    .from('game_catalog')
    .select(
      'id,name,tagline,description,category,min_players,max_players,avg_duration_minutes,modes,availability,network_model,engine_version,rules,sort_order',
    )
    .order('sort_order');
  if (error) throw toAppError(error);
  const parsed = z.array(gameSchema).safeParse(data);
  if (!parsed.success) throw new AppError('PV_BAD_RESPONSE', { cause: parsed.error });
  return parsed.data;
}

export function useCatalog() {
  return useQuery({ queryKey: queryKeys.catalog, queryFn: fetchCatalog, staleTime: 5 * 60_000 });
}

export function useGame(gameId: string | undefined) {
  const catalog = useCatalog();
  return { ...catalog, game: catalog.data?.find((game) => game.id === gameId) };
}
