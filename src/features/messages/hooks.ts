import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { queryKeys } from '@/lib/queryClient';

import { useCurrentUserId } from '../auth/store';
import { messagesApi } from './api';

/** Conversations list; realtime invalidates on new messages and reads, polling as fallback. */
export function useConversations() {
  const userId = useCurrentUserId();
  const realtime = useRealtimeInvalidation(
    userId ? `conversations:${userId}` : null,
    userId ? [{ table: 'direct_messages', event: 'INSERT' }, { table: 'conversation_members', filter: `user_id=eq.${userId}` }] : [],
    [queryKeys.conversations, queryKeys.unreadMessages],
  );
  return useQuery({
    queryKey: queryKeys.conversations,
    queryFn: messagesApi.conversations,
    enabled: !!userId,
    refetchInterval: realtime.connected ? false : 10_000,
  });
}

export function useUnreadMessages(enabled = true) {
  return useQuery({ queryKey: queryKeys.unreadMessages, queryFn: messagesApi.unreadCount, enabled, refetchInterval: 30_000 });
}

export function useThread(userId: string | undefined) {
  const connected = useRef(false);
  const thread = useQuery({
    queryKey: queryKeys.thread(userId ?? 'none'),
    queryFn: () => messagesApi.thread(userId!),
    enabled: !!userId,
    // Polling only while realtime is down (or before the conversation exists).
    refetchInterval: () => (connected.current ? false : 5000),
  });
  const conversationId = thread.data?.conversation_id ?? null;
  const realtime = useRealtimeInvalidation(
    conversationId ? `thread:${conversationId}` : null,
    conversationId ? [{ table: 'direct_messages', filter: `conversation_id=eq.${conversationId}`, event: 'INSERT' }] : [],
    [queryKeys.thread(userId ?? 'none')],
  );
  useEffect(() => {
    connected.current = realtime.connected;
  }, [realtime.connected]);
  return { thread, realtimeConnected: realtime.connected };
}

export function useSendMessage(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => messagesApi.send(userId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.thread(userId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}
