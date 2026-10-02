/**
 * Placeholder avatar system (design handoff: initials on a game-hue tint)
 * keyed by the server's cosmetic item ids (supabase cosmetic_items).
 */
const AVATAR_HUES: Record<string, number> = {
  'orbit-violet': 295,
  'nova-cyan': 220,
  'pulse-pink': 350,
  'comet-amber': 75,
  'nebula-green': 145,
  'quasar-blue': 245,
  'flare-red': 25,
  'moon-silver': 185,
  'galaxy-prism': 320,
  'eclipse-gold': 85,
  supernova: 10,
};

export const DEFAULT_AVATAR_ID = 'orbit-violet';

export function avatarHue(avatarId: string | null | undefined): number {
  return AVATAR_HUES[avatarId ?? DEFAULT_AVATAR_ID] ?? 295;
}

export function initialsFor(name: string | null | undefined): string {
  const clean = (name ?? '').replace(/[^\p{L}\p{N}\s_]/gu, '').trim();
  if (!clean) return '?';
  const words = clean.split(/[\s_]+/).filter(Boolean);
  if (words.length >= 2) return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

export function displayNameOf(player: { display_name?: string | null; username?: string | null }): string {
  return player.display_name?.trim() || player.username || 'Joueur';
}
