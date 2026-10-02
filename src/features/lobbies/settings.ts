import type { Game } from '../games/catalog';

export interface SettingOption {
  key: string;
  label: string;
  options: { value: unknown; label: string }[];
  default: unknown;
}

const LABELS: Record<string, { label: string; format: (value: unknown) => string }> = {
  turn_seconds: { label: 'Temps par tour', format: (value) => `${String(value)} s` },
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
