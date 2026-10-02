import type { PlayerStats } from './api';

export function winRate(stats: Pick<PlayerStats, 'played' | 'wins'>): number | null {
  return stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : null;
}

export function formatPlayTime(totalSeconds: number): string {
  if (totalSeconds < 3600) return `${Math.round(totalSeconds / 60)} min`;
  return `${Math.round(totalSeconds / 3600)} h`;
}

/** Best rank among friends across rated games (lower is better). */
export function bestFriendsRank(stats: PlayerStats): { rank: number; gameId: string } | null {
  let best: { rank: number; gameId: string } | null = null;
  for (const game of stats.games) {
    if (game.rating === null || game.friends_rank === null) continue;
    if (!best || game.friends_rank < best.rank) best = { rank: game.friends_rank, gameId: game.game_id };
  }
  return best;
}
