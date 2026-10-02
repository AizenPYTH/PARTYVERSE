/**
 * Client-side game registry: presentation only (hue, emblem, labels, tags).
 * The server catalog (public.game_catalog) is the source of truth for
 * existence, player bounds and availability.
 */
export type EmblemKind =
  | 'chess'
  | 'dots'
  | 'draw'
  | 'impostor'
  | 'quiz'
  | 'pool'
  | 'golf'
  | 'mindlink'
  | 'racers'
  | 'bomb';

export type GameTag = 'friends' | 'competitive' | 'reflection';

export interface GameVisual {
  hue: number;
  emblem: EmblemKind;
  /** Label shown in tiles ("Réflexion", "Adresse"…). */
  genre: string;
  tags: GameTag[];
}

const VISUALS: Record<string, GameVisual> = {
  chess_arena: { hue: 295, emblem: 'chess', genre: 'Stratégie', tags: ['competitive', 'reflection'] },
  connect_four: { hue: 245, emblem: 'dots', genre: 'Réflexion', tags: ['competitive', 'reflection', 'friends'] },
  draw_guess: { hue: 25, emblem: 'draw', genre: 'Dessin', tags: ['friends'] },
  impostor: { hue: 350, emblem: 'impostor', genre: 'Déduction', tags: ['friends'] },
  quiz_rush: { hue: 75, emblem: 'quiz', genre: 'Quiz', tags: ['friends', 'competitive'] },
  pocket_pool: { hue: 185, emblem: 'pool', genre: 'Adresse', tags: ['competitive'] },
  mini_golf_clash: { hue: 145, emblem: 'golf', genre: 'Adresse', tags: ['friends'] },
  mindlink: { hue: 320, emblem: 'mindlink', genre: 'Mots', tags: ['friends', 'reflection'] },
  micro_racers: { hue: 50, emblem: 'racers', genre: 'Course', tags: ['friends', 'competitive'] },
  bomb_squad: { hue: 10, emblem: 'bomb', genre: 'Coopération', tags: ['friends'] },
};

const FALLBACK: GameVisual = { hue: 270, emblem: 'dots', genre: 'Jeu', tags: [] };

export function gameVisual(gameId: string): GameVisual {
  return VISUALS[gameId] ?? FALLBACK;
}

export const QUICK_GAME_MAX_MINUTES = 8;
