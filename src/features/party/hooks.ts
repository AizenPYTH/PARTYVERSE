import { useQuery } from '@tanstack/react-query';

import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { queryKeys } from '@/lib/queryClient';

import { partyApi } from './api';

/** The room's party (active or last finished). Realtime invalidates; polling covers outages. */
export function useParty(lobbyId: string | undefined | null) {
  const realtime = useRealtimeInvalidation(
    lobbyId ? `party:${lobbyId}` : null,
    lobbyId ? [{ table: 'party_sessions', filter: `lobby_id=eq.${lobbyId}` }] : [],
    lobbyId ? [queryKeys.party(lobbyId)] : [],
  );
  return useQuery({
    queryKey: queryKeys.party(lobbyId ?? 'none'),
    queryFn: () => partyApi.state(lobbyId!),
    enabled: !!lobbyId,
    refetchInterval: realtime.connected ? false : 5000,
  });
}
