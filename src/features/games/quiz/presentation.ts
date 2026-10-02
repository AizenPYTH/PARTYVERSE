import { colors } from '@/design-system';

import type { StatusLine } from '../../matches/presentation';

export const CATEGORY_LABELS: Record<string, string> = {
  general: 'Culture générale',
  history: 'Histoire',
  geography: 'Géographie',
  science: 'Sciences',
  cinema: 'Cinéma',
  video_games: 'Jeux vidéo',
  sport: 'Sport',
  technology: 'Technologie',
  music: 'Musique',
  math: 'Calcul',
};

/** Status line of an active quiz for the current viewer. */
export function quizStatus(
  phase: 'question' | 'reveal' | 'finished',
  myPick: number | null,
  answer: number | undefined,
  isPlayer: boolean,
  points: number,
): StatusLine {
  if (phase === 'question') {
    if (!isPlayer) return { text: 'Les joueurs répondent', color: colors.textSecondary };
    return myPick === null
      ? { text: 'Choisis ta réponse', color: colors.violetText }
      : { text: 'Réponse envoyée', color: colors.textSecondary };
  }
  if (!isPlayer || answer === undefined) return { text: 'Réponse dévoilée', color: colors.textSecondary };
  if (myPick === null) return { text: 'Temps écoulé', color: colors.coral };
  return myPick === answer ? { text: `Bonne réponse · +${points}`, color: colors.mint } : { text: 'Mauvaise réponse', color: colors.coral };
}
