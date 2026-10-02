import type { Quest } from './api';
import { questsSummary, questState, resetsIn } from './presentation';

const quest = (overrides: Partial<Quest>): Quest => ({
  id: 'q',
  period: 'daily',
  name: 'Joue 3 parties',
  target: 3,
  reward_xp: 40,
  progress: 0,
  claimed: false,
  resets_at: '2026-10-03T00:00:00Z',
  ...overrides,
});

describe('progression presentation', () => {
  it('derives quest states and the home summary', () => {
    expect(questState(quest({ progress: 1 }))).toBe('in_progress');
    expect(questState(quest({ progress: 3 }))).toBe('claimable');
    expect(questState(quest({ progress: 3, claimed: true }))).toBe('claimed');
    expect(questsSummary([quest({ progress: 3 }), quest({ progress: 1 }), quest({ period: 'weekly', progress: 9, target: 9 })])).toEqual({
      claimable: 2,
      dailyDone: 1,
      dailyTotal: 2,
    });
  });

  it('formats reset delays', () => {
    const now = Date.parse('2026-10-02T19:00:00Z');
    expect(resetsIn('2026-10-03T00:00:00Z', now)).toBe('dans 5 h');
    expect(resetsIn('2026-10-02T19:30:00Z', now)).toBe('dans 30 min');
    expect(resetsIn('2026-10-05T00:00:00Z', now)).toBe('dans 2 j');
  });
});
