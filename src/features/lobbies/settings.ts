import type { Game } from '../games/catalog';

export interface SettingOption {
  key: string;
  label: string;
  options: { value: unknown; label: string }[];
  default: unknown;
}

const seconds = (value: unknown) => `${String(value)} s`;
const named = (names: Record<string, string>) => (value: unknown) => names[String(value)] ?? String(value);

/** Labels for every lobby setting key used by the catalog (supabase game_catalog.rules). */
const LABELS: Record<string, { label: string; format: (value: unknown) => string }> = {
  turn_seconds: { label: 'Temps par tour', format: seconds },
  time_control: {
    label: 'Cadence',
    format: named({ bullet: 'Bullet 1+0', blitz: 'Blitz 3+2', rapid: 'Rapide 10+5' }),
  },
  questions: { label: 'Questions', format: (value) => `${String(value)}` },
  question_seconds: { label: 'Temps par question', format: seconds },
  category: {
    label: 'Catégorie',
    format: named({
      mixed: 'Toutes',
      general: 'Culture générale',
      history: 'Histoire',
      geography: 'Géographie',
      science: 'Sciences',
      cinema: 'Cinéma',
      video_games: 'Jeux vidéo',
      sport: 'Sport',
      technology: 'Technologie',
      music: 'Musique',
    }),
  },
  difficulty: { label: 'Difficulté', format: named({ easy: 'Facile', normal: 'Normale', hard: 'Difficile', progressive: 'Progressive' }) },
  pairs: { label: 'Paires', format: (value) => `${String(value)}` },
  rounds: { label: 'Manches', format: (value) => `${String(value)}` },
  mode: { label: 'Variante', format: named({ word: 'Mot proche', blank: 'Imposteur sans mot' }) },
  discussion_seconds: { label: 'Discussion', format: seconds },
};

/** Lobby settings exposed by a game's server-side rules schema. */
export function gameSettings(game: Game): SettingOption[] {
  return Object.entries(game.rules.settings ?? {}).map(([key, definition]) => {
    const meta = LABELS[key] ?? { label: key, format: (value: unknown) => String(value) };
    return {
      key,
      label: meta.label,
      default: definition.default,
      options: definition.options.map((value) => ({ value, label: meta.format(value) })),
    };
  });
}

export function describeSetting(key: string, value: unknown): { label: string; value: string } {
  const meta = LABELS[key] ?? { label: key, format: (v: unknown) => String(v) };
  return { label: meta.label, value: meta.format(value) };
}

/** Player caps the host may pick: from the game minimum (or current headcount) to the game maximum. */
export function seatOptions(gameMin: number, gameMax: number, players: number): number[] {
  const from = Math.max(gameMin, players, 1);
  return from > gameMax ? [] : Array.from({ length: gameMax - from + 1 }, (_, i) => from + i);
}
