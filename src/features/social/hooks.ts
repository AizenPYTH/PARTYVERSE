import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { queryKeys } from '@/lib/queryClient';

import { socialApi } from './api';

export function useFriends() {
  // Presence is heartbeat-based: refreshing every 30 s keeps statuses honest.
  return useQuery({ queryKey: queryKeys.friends, queryFn: socialApi.friends, refetchInterval: 30_000 });
}

export function useFriendRequests() {
  return useQuery({ queryKey: queryKeys.friendRequests, queryFn: socialApi.friendRequests });
}

export function useRecentPlayers() {
  return useQuery({ queryKey: queryKeys.recentPlayers, queryFn: socialApi.recentPlayers });
}

export function useBlockedUsers() {
  return useQuery({ queryKey: queryKeys.blocked, queryFn: socialApi.blocked });
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function usePlayerSearch(query: string) {
  const debounced = useDebounced(query.trim(), 300);
  return useQuery({
    queryKey: queryKeys.search(debounced),
    queryFn: () => socialApi.search(debounced),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });
}

/** Invalidates every read model touched by a relationship change. */
function useSocialInvalidation() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [queryKeys.friends, queryKeys.friendRequests, queryKeys.recentPlayers, queryKeys.blocked, queryKeys.home, ['search'], ['profile']].map(
        (queryKey) => queryClient.invalidateQueries({ queryKey }),
      ),
    );
}

export function useSocialActions() {
  const invalidate = useSocialInvalidation();
  const options = { onSettled: invalidate };
  return {
    sendRequest: useMutation({ mutationFn: socialApi.sendRequest, ...options }),
    respond: useMutation({
      mutationFn: ({ requestId, accept }: { requestId: string; accept: boolean }) => socialApi.respond(requestId, accept),
      ...options,
    }),
    cancelRequest: useMutation({ mutationFn: socialApi.cancelRequest, ...options }),
    removeFriend: useMutation({ mutationFn: socialApi.removeFriend, ...options }),
    block: useMutation({ mutationFn: socialApi.block, ...options }),
    unblock: useMutation({ mutationFn: socialApi.unblock, ...options }),
    report: useMutation({ mutationFn: socialApi.report }),
  };
}
