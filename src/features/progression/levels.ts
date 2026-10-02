/**
 * Level curve — mirror of app_private.xp_for_level (display only; the
 * server computes and stores levels).
 * XP to go from level L to L+1 = 100 + 50 × (L − 1).
 */
export const MAX_LEVEL = 100;

export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return 100 * (l - 1) + 25 * (l - 1) * (l - 2);
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xpForLevel(level + 1) <= xp) level += 1;
  return level;
}

export interface LevelProgress {
  level: number;
  /** XP earned inside the current level. */
  current: number;
  /** XP span of the current level. */
  span: number;
  remaining: number;
  ratio: number;
}

export function levelProgress(xp: number, level = levelForXp(xp)): LevelProgress {
  const start = xpForLevel(level);
  const next = xpForLevel(Math.min(level + 1, MAX_LEVEL));
  const span = Math.max(next - start, 1);
  const current = Math.min(Math.max(xp - start, 0), span);
  return { level, current, span, remaining: Math.max(next - xp, 0), ratio: level >= MAX_LEVEL ? 1 : current / span };
}
