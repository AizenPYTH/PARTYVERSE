import { bestFriendsRank, formatPlayTime, winRate } from './stats';

describe('profile stats', () => {
  it('computes win rate', () => {
    expect(winRate({ played: 0, wins: 0 })).toBeNull();
    expect(winRate({ played: 412, wins: 238 })).toBe(58);
  });

  it('formats play time', () => {
    expect(formatPlayTime(600)).toBe('10 min');
    expect(formatPlayTime(96 * 3600)).toBe('96 h');
  });

  it('finds the best friends rank among rated games', () => {
    const game = { played: 1, wins: 1, losses: 0, draws: 0, current_win_streak: 0, best_win_streak: 0 };
    expect(
      bestFriendsRank({
        played: 2,
        wins: 1,
        losses: 1,
        draws: 0,
        total_seconds: 0,
        best_win_streak: 1,
        games: [
          { ...game, game_id: 'connect_four', rating: 1210, friends_rank: 3 },
          { ...game, game_id: 'chess_arena', rating: null, friends_rank: 1 },
        ],
      }),
    ).toEqual({ rank: 3, gameId: 'connect_four' });
  });
});
