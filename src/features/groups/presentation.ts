import type { GroupActivity, GroupChallenge, GroupRole } from './api';

export const ROLE_LABELS: Record<GroupRole, string> = { owner: 'Fondateur', admin: 'Admin', member: 'Membre' };

export function challengeText(challenge: Pick<GroupChallenge, 'kind' | 'target'>): string {
  switch (challenge.kind) {
    case 'matches_together':
      return `Jouer ${challenge.target} parties entre membres`;
    case 'member_wins':
      return `Cumuler ${challenge.target} victoires`;
    case 'variety':
      return `Jouer à ${challenge.target} jeux différents`;
  }
}

/** Days left in the challenge week (weeks start on Monday, UTC). */
export function daysLeft(weekStart: string, now = new Date()): number {
  const end = Date.parse(`${weekStart}T00:00:00Z`) + 7 * 86_400_000;
  return Math.max(0, Math.ceil((end - now.getTime()) / 86_400_000));
}

/** French sentence for an activity entry. `nameOf` resolves a user id. */
export function activityText(entry: GroupActivity, nameOf: (id: string) => string, gameName: (id: string) => string): string {
  const actor = entry.actor ? (entry.actor.display_name || entry.actor.username || 'Un membre') : 'Le groupe';
  switch (entry.kind) {
    case 'created':
      return `${actor} a créé le groupe`;
    case 'member_joined':
      return `${actor} a rejoint le groupe`;
    case 'member_left':
      return `${actor} a quitté le groupe`;
    case 'member_kicked':
      return `${actor} a été retiré du groupe`;
    case 'role_changed': {
      const role = entry.payload.role;
      return `${actor} est maintenant ${role === 'owner' ? 'fondateur' : role === 'admin' ? 'admin' : 'membre'}`;
    }
    case 'match_played': {
      const winners = Array.isArray(entry.payload.winners) ? (entry.payload.winners as string[]) : [];
      const game = typeof entry.payload.game_id === 'string' ? gameName(entry.payload.game_id) : 'une partie';
      return winners.length ? `${winners.map(nameOf).join(', ')} gagne une partie de ${game}` : `Partie de ${game} entre membres`;
    }
    case 'challenge_completed':
      return 'Défi de la semaine réussi ! +50 XP pour chaque membre';
  }
}
