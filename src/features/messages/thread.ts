import type { DirectMessage } from './api';

export interface MessageGroup {
  key: string;
  mine: boolean;
  messages: DirectMessage[];
  day: string | null;
}

const dayKey = (iso: string) => iso.slice(0, 10);

/**
 * Chronological bubbles grouped by consecutive sender, with a day label when
 * the date changes. `messages` arrive newest first from the server.
 */
export function groupMessages(messages: readonly DirectMessage[], me: string | null): MessageGroup[] {
  const chronological = [...messages].reverse();
  const groups: MessageGroup[] = [];
  let lastDay: string | null = null;
  for (const message of chronological) {
    const day = dayKey(message.created_at);
    const current = groups.at(-1);
    const newDay = day !== lastDay;
    if (!current || newDay || current.mine !== (message.sender_id === me)) {
      groups.push({ key: message.id, mine: message.sender_id === me, messages: [message], day: newDay ? day : null });
    } else {
      current.messages.push(message);
    }
    lastDay = day;
  }
  return groups;
}

/** "Aujourd’hui", "Hier" or a French date. */
export function dayLabel(day: string, now = new Date()): string {
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  if (day === today) return 'Aujourd’hui';
  if (day === yesterday) return 'Hier';
  const [y, m, d] = day.split('-').map(Number);
  const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  return `${d} ${months[(m ?? 1) - 1]}${y === now.getUTCFullYear() ? '' : ` ${y}`}`;
}

export const timeLabel = (iso: string) => {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

export const BLOCK_REASON_TEXT: Record<string, string> = {
  PV_MESSAGES_CLOSED: 'Ce joueur n’accepte pas de messages privés.',
  PV_MESSAGES_FRIENDS_ONLY: 'Ce joueur n’accepte les messages que de ses amis.',
  PV_USER_UNAVAILABLE: 'Tu ne peux pas écrire à ce joueur.',
};
