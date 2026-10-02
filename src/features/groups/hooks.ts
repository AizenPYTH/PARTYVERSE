import { useQuery } from '@tanstack/react-query';

import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { queryKeys } from '@/lib/queryClient';

import { useCurrentUserId } from '../auth/store';
import { groupsApi } from './api';

export function useMyGroups() {
  const userId = useCurrentUserId();
  const realtime = useRealtimeInvalidation(
    userId ? `groups:${userId}` : null,
    userId ? [{ table: 'group_members', filter: `user_id=eq.${userId}` }, { table: 'group_invitations', filter: `invitee_id=eq.${userId}` }] : [],
    [queryKeys.groups, queryKeys.groupInvitations],
  );
  const groups = useQuery({ queryKey: queryKeys.groups, queryFn: groupsApi.mine, enabled: !!userId, refetchInterval: realtime.connected ? false : 15_000 });
  const invitations = useQuery({
    queryKey: queryKeys.groupInvitations,
    queryFn: groupsApi.invitations,
    enabled: !!userId,
    refetchInterval: realtime.connected ? false : 15_000,
  });
  return { groups, invitations };
}

export function useGroup(groupId: string | undefined) {
  const realtime = useRealtimeInvalidation(
    groupId ? `group:${groupId}` : null,
    groupId
      ? [
          { table: 'group_members', filter: `group_id=eq.${groupId}` },
          { table: 'group_messages', filter: `group_id=eq.${groupId}`, event: 'INSERT' },
        ]
      : [],
    groupId ? [queryKeys.group(groupId), queryKeys.groupMessages(groupId)] : [],
  );
  const group = useQuery({
    queryKey: queryKeys.group(groupId ?? 'none'),
    queryFn: () => groupsApi.get(groupId!),
    enabled: !!groupId,
    refetchInterval: realtime.connected ? false : 15_000,
  });
  return { group, realtimeConnected: realtime.connected };
}

export function useGroupMessages(groupId: string | undefined, enabled: boolean, poll: boolean) {
  return useQuery({
    queryKey: queryKeys.groupMessages(groupId ?? 'none'),
    queryFn: () => groupsApi.messages(groupId!),
    enabled: !!groupId && enabled,
    refetchInterval: poll ? 5000 : false,
  });
}
