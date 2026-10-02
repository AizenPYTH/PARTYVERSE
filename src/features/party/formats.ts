import type { PartyFormat, PartyState } from './api';

export const FORMAT_INFO: Record<PartyFormat, { name: string; description: string }> = {
  classic: { name: 'Classique', description: 'Tous les jeux compatibles, dans un ordre aléatoire.' },
  quick: { name: 'Rapide', description: 'Des parties de 5 minutes maximum.' },
  friends: { name: 'Entre amis', description: 'Quiz, déduction, mémoire : les jeux d’ambiance.' },
  competitive: { name: 'Compétitif', description: 'Jeux de stratégie, pour départager les meilleurs.' },
  custom: { name: 'Personnalisé', description: 'Choisis toi-même les jeux, dans l’ordre.' },
};

export const ROUND_OPTIONS = [3, 5, 7] as const;

export type PartyPhase = 'none' | 'next' | 'finished';

/** What the room should offer: start a party, play the next round, or show the final standings. */
export function partyPhase(party: PartyState | undefined): PartyPhase {
  if (!party) return 'none';
  if (party.session.status === 'active') return 'next';
  return party.session.status === 'finished' ? 'finished' : 'none';
}

/** Round about to be played (1-based) and its game name, from the playlist. */
export function upcomingRound(party: NonNullable<PartyState>): { round: number; name: string } | null {
  const pending = party.rounds.find((r) => r.status === 'pending');
  if (pending) return { round: pending.round, name: pending.name };
  const played = party.rounds.length;
  const next = party.session.playlist[played];
  return next ? { round: played + 1, name: next.name } : null;
}

/** Ranks with ties sharing a place (1, 1, 3…). */
export function standingRanks(points: readonly number[]): number[] {
  return points.map((p) => 1 + points.filter((other) => other > p).length);
}
