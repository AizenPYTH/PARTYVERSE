import { colors } from '@/design-system';

import type { StatusLine } from '../../matches/presentation';

type Phase = 'clues' | 'discussion' | 'vote' | 'guess' | 'finished';

/** Status line of an active Impostor game. */
export function impostorStatus(
  phase: Phase,
  context: { myTurn: boolean; turnName: string; eliminatedName: string },
): StatusLine {
  switch (phase) {
    case 'clues':
      return context.myTurn
        ? { text: 'À toi de donner un indice', color: colors.violetText }
        : { text: `${context.turnName} cherche un indice`, color: colors.textSecondary };
    case 'discussion':
      return { text: 'Discussion', color: colors.amber };
    case 'vote':
      return context.myTurn ? { text: 'Vote pour l’imposteur', color: colors.violetText } : { text: 'Vote en cours', color: colors.textSecondary };
    case 'guess':
      return context.myTurn
        ? { text: 'Démasqué ! Devine le mot', color: colors.coral }
        : { text: `${context.eliminatedName} est démasqué et tente de deviner`, color: colors.amber };
    case 'finished':
      return { text: 'Partie terminée', color: colors.textSecondary };
  }
}
