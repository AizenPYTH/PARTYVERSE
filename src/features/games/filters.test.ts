import type { Game } from './catalog';
import { filterGames } from './filters';

const game = (overrides: Partial<Game>): Game => ({
  id: 'connect_four',
  name: 'Connect Four',
  tagline: 'Aligne quatre jetons',
  description: '',
  category: 'strategy',
  min_players: 2,
  max_players: 2,
  avg_duration_minutes: 5,
  modes: [{ id: 'classic', name: 'Classique', ranked: true }],
  availability: 'available',
  network_model: 'turn_based_sql',
  engine_version: 1,
  rules: {},
  sort_order: 1,
  ...overrides,
});

describe('filterGames', () => {
  const games = [
    game({}),
    game({ id: 'impostor', name: 'Impostor', avg_duration_minutes: 12, modes: [{ id: 'classic', name: 'Classique', ranked: false }] }),
  ];

  it('filters by tag, duration and ranked modes', () => {
    expect(filterGames(games, 'quick', '').map((g) => g.id)).toEqual(['connect_four']);
    expect(filterGames(games, 'competitive', '').map((g) => g.id)).toEqual(['connect_four']);
    expect(filterGames(games, 'friends', '').map((g) => g.id)).toEqual(['connect_four', 'impostor']);
  });

  it('searches names accent-insensitively', () => {
    expect(filterGames(games, 'all', 'IMPOS').map((g) => g.id)).toEqual(['impostor']);
    expect(filterGames(games, 'all', 'deduction').map((g) => g.id)).toEqual(['impostor']);
  });
});
