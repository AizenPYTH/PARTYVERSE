/** Toggles a game in the favorites list (max 10, as enforced by the server). */
export function toggleFavorite(favorites: readonly string[], gameId: string): string[] | null {
  if (favorites.includes(gameId)) return favorites.filter((id) => id !== gameId);
  if (favorites.length >= 10) return null;
  return [...favorites, gameId];
}
