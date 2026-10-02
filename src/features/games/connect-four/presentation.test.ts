import type { MatchState } from '../../matches/api';
import { resultSummary, statusLine } from './presentation';

// jest.mock is hoisted above the imports by babel-jest.
jest.mock('@/design-system', () => ({
  colors: {
    violet: 'violet',
    violetText: 'violetText',
    amber: 'amber',
    mint: 'mint',
    coral: 'coral',
    textPrimary: 'text',
  },
}));


const player = (seat: number, overrides: Partial<MatchState['players'][number]> = {}) => ({
  seat,
  user_id: `u${seat}`,
  username: seat === 0 ? 'nova' : 'leo',
  display_name: seat === 0 ? 'Nova' : 'Léo',
  avatar_id: 'orbit-violet',
  level: 1,
  result: null,
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

describe('connect four presentation', () => {
  it('describes whose turn it is', () => {
    expect(statusLine(state({ current_turn_seat: 0 }), 0).text).toBe('À toi de jouer');
    expect(statusLine(state({ current_turn_seat: 1 }), 0).text).toBe('Tour de Léo');
  });

  it('describes the end of a round', () => {
    expect(statusLine(state({ status: 'finished', winner_seat: 0 }), 0)).toEqual({ text: 'Victoire !', color: 'mint' });
    expect(statusLine(state({ status: 'finished', winner_seat: 1 }), 0)).toEqual({ text: 'Léo gagne la manche', color: 'coral' });
    expect(statusLine(state({ status: 'finished', winner_seat: null }), 0).text).toBe('Match nul');
  });

  it('summarizes rewards like the design', () => {
    const won = state({ status: 'finished', winner_seat: 0, outcome: 'win' }, [player(0, { xp_awarded: 40, win_streak: 2 }), player(1)]);
    expect(resultSummary(won, 0)).toMatchObject({ title: 'Victoire', reward: '+40 XP · série de 2 victoires', detail: null });

    const lost = state({ status: 'finished', winner_seat: 1, outcome: 'timeout' }, [player(0, { xp_awarded: 10 }), player(1)]);
    expect(resultSummary(lost, 0)).toMatchObject({ title: 'Défaite', reward: '+10 XP · la revanche est à un tap', detail: 'Temps écoulé' });

    const ranked = state({ status: 'finished', winner_seat: null, outcome: 'draw' }, [
      player(0, { xp_awarded: 20, rating_before: 1200, rating_after: 1204 }),
      player(1),
    ]);
    expect(resultSummary(ranked, 0)).toMatchObject({ title: 'Match nul', reward: '+20 XP', detail: 'Classement 1200 → 1204 (+4)' });
  });
});
