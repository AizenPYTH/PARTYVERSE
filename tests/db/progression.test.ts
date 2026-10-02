import { admin, asUser, createUser, expectError, makeFriends, playMoves, rpc, rpcRows, startDuel } from './helpers';

interface Progression {
  level: number;
  play_streak: number;
  quests: { id: string; period: string; target: number; progress: number; claimed: boolean; reward_xp: number }[];
  achievements: { id: string; progress: number; threshold: number; unlocked_at: string | null }[];
}

/** A Connect Four game where seat 0 wins with a vertical line (7 moves). */
async function playWin() {
  const { matchId, seats } = await startDuel();
  await playMoves(matchId, seats, [0, 1, 0, 1, 0, 1, 0]);
  return seats;
}

describe('progression', () => {
  it('unlocks achievements from counted matches and pays them once', async () => {
    const [winner, loser] = await playWin();
    const mine = await rpc<Progression>(winner!, 'get_my_progression');
    const unlocked = mine.achievements.filter((a) => a.unlocked_at).map((a) => a.id);
    expect(unlocked).toEqual(expect.arrayContaining(['first_match', 'first_win']));
    expect((await rpc<Progression>(loser!, 'get_my_progression')).achievements.find((a) => a.id === 'first_win')?.unlocked_at).toBeNull();
    await rpc(winner!, 'get_my_progression');
    const rewards = await admin<{ n: string }>(`select count(*) as n from public.xp_events where user_id = $1 and source = 'achievement'`, [winner!.id]);
    expect(Number(rewards[0]!.n)).toBe(unlocked.length);
    const notifications = await admin<{ n: string }>(`select count(*) as n from public.notifications where user_id = $1 and type = 'achievement'`, [winner!.id]);
    expect(Number(notifications[0]!.n)).toBeGreaterThanOrEqual(2);
  });

  it('ignores matches without real play (instant resignation)', async () => {
    const { matchId, seats } = await startDuel();
    await rpc(seats[1]!, 'resign_match', [matchId]);
    const progression = await rpc<Progression>(seats[0]!, 'get_my_progression');
    expect(progression.achievements.find((a) => a.id === 'first_win')?.unlocked_at).toBeNull();
    expect(progression.play_streak).toBe(0);
  });

  it('assigns three daily and three weekly quests and lets completed ones be claimed once', async () => {
    const [winner] = await playWin();
    const progression = await rpc<Progression>(winner!, 'get_my_progression');
    expect(progression.quests.filter((q) => q.period === 'daily')).toHaveLength(3);
    expect(progression.quests.filter((q) => q.period === 'weekly')).toHaveLength(3);
    expect(progression.play_streak).toBe(1);

    const done = progression.quests.find((q) => q.progress >= q.target);
    const pending = progression.quests.find((q) => q.progress < q.target)!;
    await expectError(rpc(winner!, 'claim_quest', [pending.id]), 'PV_QUEST_INCOMPLETE');
    const notAssigned = await admin<{ id: string }>(
      `select id from public.quest_definitions where id <> all($1::text[]) limit 1`,
      [progression.quests.map((q) => q.id)],
    );
    await expectError(rpc(winner!, 'claim_quest', [notAssigned[0]!.id]), 'PV_QUEST_NOT_FOUND');
    if (done) {
      expect(await rpc<number>(winner!, 'claim_quest', [done.id])).toBe(done.reward_xp);
      await expectError(rpc(winner!, 'claim_quest', [done.id]), 'PV_ALREADY_DONE');
    }
    // Claims cannot be forged.
    await expect(asUser(winner!, `insert into public.player_quest_claims (user_id, quest_id, period_key) values ($1, 'd_win_1', current_date)`, [winner!.id]))
      .rejects.toThrow(/permission denied/);
  });

  it('ranks XP globally and among friends, and shows trophies on visible profiles', async () => {
    const [winner, loser] = await playWin();
    await makeFriends(winner!, loser!);
    const board = await rpcRows<{ user_id: string; xp: string; is_me: boolean }>(winner!, 'get_xp_leaderboard', ['friends', 'week', 50]);
    expect(board.map((r) => r.user_id)).toEqual(expect.arrayContaining([winner!.id, loser!.id]));
    expect(Number(board[0]!.xp)).toBeGreaterThan(0);
    const trophies = await rpc<{ id: string }[]>(loser!, 'get_player_achievements', [winner!.id]);
    await rpc(winner!, 'get_my_progression');
    expect((await rpc<{ id: string }[]>(loser!, 'get_player_achievements', [winner!.id])).length).toBeGreaterThanOrEqual(trophies.length);
    const stranger = await createUser();
    await asUser(winner!, `update public.user_settings set profile_visibility = 'friends' where user_id = $1`, [winner!.id]);
    expect(await rpc(stranger, 'get_player_achievements', [winner!.id])).toEqual([]);
  });
});
