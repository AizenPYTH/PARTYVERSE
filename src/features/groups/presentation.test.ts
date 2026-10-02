import { activityText, challengeText, daysLeft } from './presentation';

describe('group presentation', () => {
  it('describes challenges and the time left', () => {
    expect(challengeText({ kind: 'variety', target: 5 })).toBe('Jouer à 5 jeux différents');
    expect(daysLeft('2026-09-28', new Date('2026-10-02T12:00:00Z'))).toBe(3);
    expect(daysLeft('2026-09-21', new Date('2026-10-02T12:00:00Z'))).toBe(0);
  });

  it('writes activity in French', () => {
    const base = { id: 1, created_at: '2026-10-02T00:00:00Z', actor: null };
    const names: Record<string, string> = { u1: 'Nova' };
    expect(
      activityText({ ...base, kind: 'match_played', payload: { game_id: 'reversi', winners: ['u1'] } }, (id) => names[id] ?? '?', () => 'Reversi'),
    ).toBe('Nova gagne une partie de Reversi');
    expect(activityText({ ...base, kind: 'challenge_completed', payload: {} }, () => '', () => '')).toContain('+50 XP');
  });
});
