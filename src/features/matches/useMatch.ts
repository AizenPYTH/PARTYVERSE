import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useCountdown } from '@/hooks/useCountdown';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { AppError, toAppError } from '@/lib/errors';
import { queryKeys } from '@/lib/queryClient';
import { syncServerClock } from '@/lib/serverClock';

import { matchesApi, type MatchState } from './api';

/** Grace before asking the server to enforce an expired turn. */
const TIMEOUT_CLAIM_GRACE_MS = 1500;

/**
 * Live match state. The server is authoritative for moves, turns, clocks and
 * results: this hook only reads state (realtime-invalidated, polling only as a
 * fallback), submits intents and asks the server to enforce clocks.
 */
export function useMatch(matchId: string | undefined) {
  const queryClient = useQueryClient();
  const key = queryKeys.match(matchId ?? 'none');

  const realtime = useRealtimeInvalidation(
    matchId ? `match:${matchId}` : null,
    matchId ? [{ table: 'matches', filter: `id=eq.${matchId}`, event: 'UPDATE' }] : [],
    [key],
  );

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const state = await matchesApi.state(matchId!);
      syncServerClock(state.server_time);
      return state;
    },
    enabled: !!matchId,
    // Slow safety net with realtime, fast polling without it.
    refetchInterval: (current) =>
      current.state.data?.match.status === 'active' ? (realtime.connected ? 15_000 : 2000) : false,
  });

  const apply = (state: MatchState) => {
    syncServerClock(state.server_time);
    queryClient.setQueryData(key, state);
  };

  const claimTimeout = useMutation({
    mutationFn: () => matchesApi.claimTimeout(matchId!),
    onSuccess: apply,
    onError: () => void query.refetch(),
  });

  const resign = useMutation({ mutationFn: () => matchesApi.resign(matchId!), onSuccess: apply });

  const connectFourMove = useMutation({
    mutationFn: ({ column, version }: { column: number; version: number }) =>
      matchesApi.submitConnectFourMove(matchId!, column, version),
    onSuccess: apply,
    onError: (error) => {
      const appError = toAppError(error);
      if (appError.code === 'PV_TURN_EXPIRED') claimTimeout.mutate();
      else void query.refetch();
    },
  });

  // Ask the server to enforce the clock once per expired turn.
  const remaining = useCountdown(query.data?.match.status === 'active' ? query.data.match.turn_deadline : null);
  const claimedVersion = useRef<number | null>(null);
  const version = query.data?.match.version;
  useEffect(() => {
    if (remaining !== 0 || version === undefined || claimedVersion.current === version || query.data?.my_seat === null) return;
    const timer = setTimeout(() => {
      claimedVersion.current = version;
      claimTimeout.mutate();
    }, TIMEOUT_CLAIM_GRACE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, version]);

  return { query, remaining, claimTimeout, resign, connectFourMove };
}

export function moveErrorIsSilent(error: unknown): boolean {
  return error instanceof AppError && (error.code === 'PV_STALE_STATE' || error.code === 'PV_TURN_EXPIRED');
}
