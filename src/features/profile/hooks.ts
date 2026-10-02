import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryClient';

import { useCurrentUserId } from '../auth/store';
import { profileApi, type SettingsPatch } from './api';

export function useHomeOverview(enabled = true) {
  return useQuery({ queryKey: queryKeys.home, queryFn: profileApi.homeOverview, enabled });
}

export function usePlayerProfile(userId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.profile(userId ?? 'none'),
    queryFn: () => profileApi.playerProfile(userId!),
    enabled: !!userId,
  });
}

export function useMatchHistory(userId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.matchHistory(userId ?? 'me'),
    queryFn: () => profileApi.matchHistory(userId ?? null),
    enabled: enabled && !!userId,
  });
}

export function useLeaderboard(gameId: string, scope: 'global' | 'friends') {
  return useQuery({ queryKey: queryKeys.leaderboard(gameId, scope), queryFn: () => profileApi.leaderboard(gameId, scope) });
}

export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: profileApi.settings });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  const userId = useCurrentUserId();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => profileApi.updateSettings(userId!, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.settings }),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const userId = useCurrentUserId();
  return useMutation({
    mutationFn: (patch: Parameters<typeof profileApi.updateProfile>[1]) => profileApi.updateProfile(userId!, patch),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.home }),
        queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId!) }),
      ]);
    },
  });
}

export function useCosmetics() {
  return useQuery({ queryKey: queryKeys.cosmetics, queryFn: profileApi.cosmetics, staleTime: 10 * 60_000 });
}

export function useInventory() {
  return useQuery({ queryKey: queryKeys.inventory, queryFn: profileApi.inventory });
}
