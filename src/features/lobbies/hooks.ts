import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { queryKeys } from '@/lib/queryClient';
import { syncServerClock } from '@/lib/serverClock';

import { useCurrentUserId } from '../auth/store';
import { lobbiesApi, type CreateLobbyInput } from './api';

export function useLobby(lobbyId: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.lobby(lobbyId ?? 'none'),
    queryFn: async () => {
      const state = await lobbiesApi.state(lobbyId!);
      syncServerClock(state.server_time);
      return state;
    },
    enabled: !!lobbyId,
  });

  useRealtimeInvalidation(
    lobbyId ? `lobby:${lobbyId}` : null,
    lobbyId
      ? [
          { table: 'lobbies', filter: `id=eq.${lobbyId}` },
          { table: 'lobby_members', filter: `lobby_id=eq.${lobbyId}` },
          { table: 'lobby_messages', filter: `lobby_id=eq.${lobbyId}`, event: 'INSERT' },
        ]
      : [],
    lobbyId ? [queryKeys.lobby(lobbyId), queryKeys.lobbyMessages(lobbyId)] : [],
  );

  return query;
}

export function useLobbyMessages(lobbyId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.lobbyMessages(lobbyId ?? 'none'),
    queryFn: () => lobbiesApi.messages(lobbyId!),
    enabled: !!lobbyId && enabled,
    select: (messages) => [...messages].reverse(),
  });
}

export function usePublicLobbies(gameId: string) {
  return useQuery({ queryKey: queryKeys.publicLobbies(gameId), queryFn: () => lobbiesApi.publicLobbies(gameId), refetchInterval: 15_000 });
}

export function useInvitations() {
  const userId = useCurrentUserId();
  const query = useQuery({ queryKey: queryKeys.invitations, queryFn: lobbiesApi.invitations, enabled: !!userId });
  useRealtimeInvalidation(
    userId ? `invitations:${userId}` : null,
    userId ? [{ table: 'lobby_invitations', filter: `recipient_id=eq.${userId}` }] : [],
    [queryKeys.invitations],
  );
  return query;
}

export function useCreateLobby() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLobbyInput) => lobbiesApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.home }),
  });
}

export function useJoinLobby() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lobbyId, asSpectator }: { lobbyId: string; asSpectator?: boolean }) => lobbiesApi.join(lobbyId, asSpectator),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.home }),
  });
}

export function useRespondInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ invitationId, accept }: { invitationId: string; accept: boolean }) =>
      lobbiesApi.respondInvitation(invitationId, accept),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.invitations }),
        queryClient.invalidateQueries({ queryKey: queryKeys.home }),
      ]),
  });
}
