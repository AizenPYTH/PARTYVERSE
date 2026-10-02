import type { PartyState } from './api';
import { partyPhase, standingRanks, upcomingRound } from './formats';

const party = (overrides: Partial<NonNullable<PartyState>['session']> = {}, rounds: NonNullable<PartyState>['rounds'] = []): NonNullable<PartyState> => ({
  session: {
    id: '00000000-0000-4000-8000-000000000001',
    format: 'classic',
    status: 'active',
    rounds_total: 3,
    current_round: 0,
    playlist: [
      { game_id: 'tic_tac_toe', name: 'Morpion' },
      { game_id: 'reversi', name: 'Reversi' },
      { game_id: 'quiz_rush', name: 'Quiz Rush' },
    ],
    created_at: '2026-10-01T00:00:00Z',
    finished_at: null,
    ...overrides,
  },
  rounds,
  standings: [],
});

describe('party formats', () => {
  it('derives the room phase', () => {
    expect(partyPhase(null)).toBe('none');
    expect(partyPhase(party())).toBe('next');
    expect(partyPhase(party({ status: 'finished' }))).toBe('finished');
    expect(partyPhase(party({ status: 'cancelled' }))).toBe('none');
  });

  it('finds the upcoming round, skipped rounds included', () => {
    expect(upcomingRound(party())).toEqual({ round: 1, name: 'Morpion' });
    const done = { round: 1, game_id: 'tic_tac_toe', name: 'Morpion', status: 'done' as const, match_id: null, winners: [] };
    const skipped = { ...done, round: 2, game_id: 'reversi', name: 'Reversi', status: 'skipped' as const };
    expect(upcomingRound(party({}, [done, skipped]))).toEqual({ round: 3, name: 'Quiz Rush' });
    expect(upcomingRound(party({}, [{ ...done, status: 'pending' }]))).toEqual({ round: 1, name: 'Morpion' });
    expect(upcomingRound(party({}, [done, skipped, { ...done, round: 3 }]))).toBeNull();
  });

  it('shares places on ties', () => {
    expect(standingRanks([21, 21, 15, 3])).toEqual([1, 1, 3, 4]);
  });
});
