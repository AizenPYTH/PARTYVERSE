import { colors } from '@/design-system';

import type { Presence } from '../profile/api';

export interface PresenceDescription {
  label: string;
  short: string;
  color: string;
}

/** Human description of a friend's presence, never relying on color alone. */
export function describePresence(
  presence: Presence,
  context: { gameName?: string | null; playerCount?: number | null; maxPlayers?: number | null } = {},
): PresenceDescription {
  switch (presence) {
    case 'online':
      return { label: 'Disponible', short: 'Dispo', color: colors.mint };
    case 'in_game':
      return { label: context.gameName ? `En partie · ${context.gameName}` : 'En partie', short: context.gameName ?? 'En jeu', color: colors.violetText };
    case 'in_lobby': {
      const count = context.playerCount && context.maxPlayers ? ` · ${context.playerCount}/${context.maxPlayers}` : '';
      return { label: `Salon ${context.gameName ?? ''}${count}`.replace('  ', ' ').trim(), short: 'Salon', color: colors.amber };
    }
    case 'away':
      return { label: 'Absent', short: 'Absent', color: colors.textSecondary };
    case 'dnd':
      return { label: 'Ne pas déranger', short: 'Occupé', color: colors.coral };
    case 'offline':
      return { label: 'Hors ligne', short: 'Hors ligne', color: colors.textTertiary };
  }
}

export const isAvailablePresence = (presence: Presence) => presence !== 'offline';

const PRESENCES: readonly Presence[] = ['online', 'away', 'dnd', 'in_game', 'in_lobby', 'offline'];

/** Server presence string → known presence (unknown values read as offline). */
export const toPresence = (value: string | null | undefined): Presence =>
  PRESENCES.includes(value as Presence) ? (value as Presence) : 'offline';
