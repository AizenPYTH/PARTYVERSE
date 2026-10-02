import type { LobbyMessage } from './api';
import { QUICK_MESSAGES, type QuickMessageId } from './api';

const nameOf = (meta: Record<string, unknown>) =>
  (typeof meta.display_name === 'string' && meta.display_name) ||
  (typeof meta.username === 'string' && meta.username) ||
  'Un joueur';

/** Renders server events and quick messages as readable French text. */
export function messageText(message: LobbyMessage): string {
  if (message.kind === 'quick') return QUICK_MESSAGES[message.body as QuickMessageId] ?? message.body;
  if (message.kind !== 'system') return message.body;
  const name = nameOf(message.meta);
  switch (message.body) {
    case 'lobby_created':
      return `${name} a créé le salon`;
    case 'member_joined':
      return message.meta.role === 'spectator' ? `${name} regarde la partie` : `${name} a rejoint le salon`;
    case 'member_left':
      return `${name} a quitté le salon`;
    case 'member_kicked':
      return `${name} a été exclu du salon`;
    case 'member_disconnected':
      return `${name} a été déconnecté`;
    case 'host_changed':
      return `${name} est le nouvel hôte`;
    case 'settings_changed':
      return 'Les réglages ont changé';
    case 'match_started':
      return 'La partie commence !';
    case 'match_ended':
      return 'Partie terminée';
    default:
      return message.body;
  }
}
