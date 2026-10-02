import type { Game } from './catalog';
import { QUICK_GAME_MAX_MINUTES, gameVisual } from './registry';

export type CatalogFilter = 'all' | 'friends' | 'quick' | 'competitive' | 'reflection';

export const CATALOG_FILTERS: { value: CatalogFilter; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'friends', label: 'Entre amis' },
  { value: 'quick', label: 'Rapides' },
  { value: 'competitive', label: 'Compétitif' },
  { value: 'reflection', label: 'Réflexion' },
];

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export function filterGames(games: Game[], filter: CatalogFilter, query: string): Game[] {
  const needle = normalize(query.trim());
  return games.filter((game) => {
    if (needle && !normalize(`${game.name} ${game.tagline} ${gameVisual(game.id).genre}`).includes(needle)) return false;
    switch (filter) {
      case 'all':
        return true;
      case 'quick':
        return game.avg_duration_minutes <= QUICK_GAME_MAX_MINUTES;
      case 'competitive':
        return game.modes.some((mode) => mode.ranked);
      default:
        return gameVisual(game.id).tags.includes(filter);
    }
  });
}
