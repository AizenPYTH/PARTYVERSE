import type { Achievement, Quest } from './api';

export const CATEGORY_LABELS: Record<Achievement['category'], string> = {
  games: 'Jeux',
  mastery: 'Maîtrise',
  social: 'Social',
  party: 'Party',
};

/** "dans 5 h", "dans 2 j", "dans 12 min" until a quest resets. */
export function resetsIn(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((Date.parse(iso) - now) / 60_000));
  if (minutes < 60) return `dans ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `dans ${hours} h`;
  return `dans ${Math.round(hours / 24)} j`;
}

export type QuestState = 'claimable' | 'claimed' | 'in_progress';

export function questState(quest: Pick<Quest, 'progress' | 'target' | 'claimed'>): QuestState {
  if (quest.claimed) return 'claimed';
  return quest.progress >= quest.target ? 'claimable' : 'in_progress';
}

/** Short summary for the home card: claimable count, else daily progress. */
export function questsSummary(quests: readonly Quest[]): { claimable: number; dailyDone: number; dailyTotal: number } {
  const daily = quests.filter((q) => q.period === 'daily');
  return {
    claimable: quests.filter((q) => questState(q) === 'claimable').length,
    dailyDone: daily.filter((q) => q.progress >= q.target).length,
    dailyTotal: daily.length,
  };
}
