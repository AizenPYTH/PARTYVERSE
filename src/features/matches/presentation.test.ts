import type { MatchState } from './api';
import { resultSummary, turnStatus } from './presentation';

jest.mock('@/design-system', () => ({
  colors: { violet: 'violet', violetText: 'violetText', amber: 'amber', mint: 'mint', coral: 'coral', textPrimary: 'text', textSecondary: 'secondary' },
  tint: () => ({ accent: '#123456', emblem: '#abcdef' }),
}));

const player = (seat: number, overrides: Partial<MatchState['players'][number]> = {}) => ({
  seat,
  user_id: `u${seat}`,
  username: ['nova', 'leo', 'maya', 'sami'][seat] ?? 'x',
  display_name: ['Nova', 'Léo', 'Maya', 'Sami'][seat] ?? 'X',
  avatar_id: 'orbit-violet',
  level: 1,
  result: null,
  rank: null,
  score: null,
  rating_before: null,
  rating_after: null,
  xp_awarded: 0,
  win_streak: 0,
  series_wins: 0,
  is_online: true,
  ...overrides,
});

const state = (match: Partial<MatchState['match']>, players = [player(0), player(1)]): MatchState => ({
  match: {
    id: 'm',
    lobby_id: 'l',
    game_id: 'connect_four',
    mode: 'classic',
    ranked: false,
    status: 'active',
    state: {},
    version: 1,
    current_turn_seat: 0,
    turn_seconds: 60,
    turn_deadline: null,
    outcome: null,
    winner_seat: null,
    started_at: '',
    ended_at: null,
    round: 1,
    ...match,
  },
  players,
  my_seat: 0,
  server_time: '',
});

describe('match presentation', () => {
  it('describes whose turn it is', () => {
    expect(turnStatus(state({ current_turn_seat: 0 }), 0).text).toBe('À toi de jouer');
    expect(turnStatus(state({ current_turn_seat: 1 }), 0).text).toBe('Tour de Léo');
  });

  it('describes the end of a duel', () => {
    const won = [player(0, { result: 'win' }), player(1, { result: 'loss' })];
    expect(turnStatus(state({ status: 'finished' }, won), 0)).toEqual({ text: 'Victoire !', color: 'mint' });
    expect(turnStatus(state({ status: 'finished' }, won), 1)).toEqual({ text: 'Nova gagne la manche', color: 'coral' });
    const drawn = [player(0, { result: 'draw' }), player(1, { result: 'draw' })];
    expect(turnStatus(state({ status: 'finished' }, drawn), 0).text).toBe('Match nul');
  });

  it('summarizes duel rewards like the design', () => {
    const won = state({ status: 'finished', outcome: 'win', result_detail: { reason: 'line' } }, [
      player(0, { result: 'win', xp_awarded: 40, win_streak: 2 }),
      player(1, { result: 'loss' }),
    ]);
    expect(resultSummary(won, 0)).toMatchObject({ title: 'Victoire', reward: '+40 XP · série de 2 victoires', detail: null });

    const lost = state({ status: 'finished', outcome: 'timeout', result_detail: { reason: 'timeout' } }, [
      player(0, { result: 'loss', xp_awarded: 10 }),
      player(1, { result: 'win' }),
    ]);
    expect(resultSummary(lost, 0)).toMatchObject({ title: 'Défaite', reward: '+10 XP · la revanche est à un tap', detail: 'Temps écoulé' });

    const ranked = state({ status: 'finished', outcome: 'draw', result_detail: { reason: 'stalemate' } }, [
      player(0, { result: 'draw', xp_awarded: 20, rating_before: 1200, rating_after: 1204 }),
      player(1, { result: 'draw' }),
    ]);
    expect(resultSummary(ranked, 0, { stalemate: 'Pat' })).toMatchObject({
      title: 'Match nul',
      reward: '+20 XP',
      detail: 'Pat · Classement 1200 → 1204 (+4)',
    });
  });

  it('summarizes multiplayer rankings', () => {
    const players = [
      player(0, { result: 'loss', rank: 2, score: 1200, xp_awarded: 25 }),
      player(1, { result: 'win', rank: 1, score: 1800 }),
      player(2, { result: 'loss', rank: 3, score: 300 }),
    ];
    const finished = state({ status: 'finished', outcome: 'completed', result_detail: { reason: 'completed' } }, players);
    expect(resultSummary(finished, 0)).toMatchObject({ title: '2e sur 3', reward: '+25 XP', detail: '1200 pts' });
    expect(resultSummary(state({ status: 'aborted' }), 0).title).toBe('Partie annulée');
  });
});
