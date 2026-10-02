import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useCountdown } from '@/hooks/useCountdown';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { AppError, toAppError } from '@/lib/errors';
import { queryKeys } from '@/lib/queryClient';
import { syncServerClock } from '@/lib/serverClock';

import { engineApi, isEngineMatch, matchesApi, type MatchState } from './api';

/** Grace before asking the server to enforce an expired deadline. */
const TIMEOUT_CLAIM_GRACE_MS = 1200;

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
  const refetch = () => queryClient.invalidateQueries({ queryKey: key });
  const engine = query.data ? isEngineMatch(query.data) : false;

  const claimTimeout = useMutation({
    mutationFn: async () => {
      if (engine) await engineApi.timeout(matchId!);
      else apply(await matchesApi.claimTimeout(matchId!));
    },
    onSettled: () => refetch(),
  });

  const resign = useMutation({ mutationFn: () => matchesApi.resign(matchId!), onSuccess: apply });

  const connectFourMove = useMutation({
    mutationFn: ({ column, version }: { column: number; version: number }) =>
      matchesApi.submitConnectFourMove(matchId!, column, version),
    onSuccess: apply,
    onError: (error) => {
      if (toAppError(error).code === 'PV_TURN_EXPIRED') claimTimeout.mutate();
      else void query.refetch();
    },
  });

  /**
   * Generic engine action (every game except the SQL Connect Four).
   * In simultaneous phases (fleet placement, answers, votes) another player's
   * action bumps the version first: on a stale version the intent is resent
   * once against the fresh state if this seat may still act. The engine
   * re-validates it against that state.
   */
  const action = useMutation({
    mutationFn: async ({ payload, version }: { payload: unknown; version: number }) => {
      try {
        return await engineApi.action(matchId!, version, payload);
      } catch (error) {
        if (toAppError(error).code !== 'PV_STALE_STATE') throw error;
        const fresh = (await query.refetch()).data;
        const seat = fresh?.my_seat ?? null;
        if (!fresh || fresh.match.status !== 'active' || seat === null || !(fresh.match.active_seats ?? []).includes(seat)) throw error;
        if (fresh.match.version === version) throw error;
        return engineApi.action(matchId!, fresh.match.version, payload);
      }
    },
    onSettled: () => refetch(),
    onError: (error) => {
      if (toAppError(error).code === 'PV_TURN_EXPIRED') claimTimeout.mutate();
    },
  });

  // Ask the server to enforce the clock once per expired deadline.
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

  return { query, remaining, claimTimeout, resign, connectFourMove, action };
}

export type MatchController = ReturnType<typeof useMatch>;

export function moveErrorIsSilent(error: unknown): boolean {
  return error instanceof AppError && (error.code === 'PV_STALE_STATE' || error.code === 'PV_TURN_EXPIRED');
}
