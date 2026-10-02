import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryClient';

import { progressionApi } from './api';

export function useProgression(enabled = true) {
  return useQuery({ queryKey: queryKeys.progression, queryFn: progressionApi.mine, enabled, staleTime: 30_000 });
}

export function useClaimQuest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: progressionApi.claim,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.progression });
      void queryClient.invalidateQueries({ queryKey: queryKeys.home });
    },
  });
}

export function useXpLeaderboard(scope: 'global' | 'friends', period: 'week' | 'all') {
  return useQuery({ queryKey: queryKeys.xpLeaderboard(scope, period), queryFn: () => progressionApi.xpLeaderboard(scope, period) });
}

export function usePlayerAchievements(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.playerAchievements(userId ?? 'none'),
    queryFn: () => progressionApi.playerAchievements(userId!),
    enabled: !!userId,
  });
}
