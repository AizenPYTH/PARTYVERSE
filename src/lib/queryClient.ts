import { QueryClient } from '@tanstack/react-query';

import { AppError } from './errors';

const NON_RETRYABLE = new Set(['PV_NOT_AUTHENTICATED', 'PV_ACCOUNT_SUSPENDED', 'PV_NOT_CONFIGURED', 'PV_BAD_RESPONSE']);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (failureCount, error) =>
        failureCount < 2 && !(error instanceof AppError && (NON_RETRYABLE.has(error.code) || error.code.endsWith('NOT_FOUND'))),
    },
    mutations: { retry: false },
  },
});

/** Centralized query keys so invalidations stay consistent. */
export const queryKeys = {
  home: ['home'] as const,
  catalog: ['catalog'] as const,
  cosmetics: ['cosmetics'] as const,
  inventory: ['inventory'] as const,
  settings: ['settings'] as const,
  presenceStatus: ['presence-status'] as const,
  profile: (userId: string) => ['profile', userId] as const,
  matchHistory: (userId: string) => ['match-history', userId] as const,
  friends: ['friends'] as const,
  friendRequests: ['friend-requests'] as const,
  recentPlayers: ['recent-players'] as const,
  blocked: ['blocked'] as const,
  search: (query: string) => ['search', query] as const,
  invitations: ['invitations'] as const,
  notifications: ['notifications'] as const,
  lobby: (lobbyId: string) => ['lobby', lobbyId] as const,
  lobbyMessages: (lobbyId: string) => ['lobby-messages', lobbyId] as const,
  party: (lobbyId: string) => ['party', lobbyId] as const,
  publicLobbies: (gameId: string) => ['public-lobbies', gameId] as const,
  match: (matchId: string) => ['match', matchId] as const,
  leaderboard: (gameId: string, scope: string) => ['leaderboard', gameId, scope] as const,
};
