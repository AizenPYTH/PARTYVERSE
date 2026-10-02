import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { supabase } from '@/lib/supabase';

export interface TableSubscription {
  table: string;
  /** PostgREST-style filter, e.g. `lobby_id=eq.<uuid>`. */
  filter?: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
}

/**
 * Subscribes to Postgres changes and treats every event as an invalidation
 * signal. Data is always re-read through validated RPCs; realtime payloads
 * are never trusted as state (RLS still filters what each client receives).
 */
export function useRealtimeInvalidation(
  channelName: string | null,
  subscriptions: TableSubscription[],
  keys: QueryKey[],
  onEvent?: (table: string, payload: unknown) => void,
) {
  const queryClient = useQueryClient();
  const keysRef = useRef(keys);
  const onEventRef = useRef(onEvent);
  keysRef.current = keys;
  onEventRef.current = onEvent;
  const signature = JSON.stringify(subscriptions);

  useEffect(() => {
    if (!supabase || !channelName) return;
    const client = supabase;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const invalidate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        for (const key of keysRef.current) void queryClient.invalidateQueries({ queryKey: key });
      }, 120);
    };

    const channel = client.channel(channelName);
    for (const subscription of JSON.parse(signature) as TableSubscription[]) {
      channel.on(
        'postgres_changes',
        { event: subscription.event ?? '*', schema: 'public', table: subscription.table, filter: subscription.filter },
        (payload) => {
          onEventRef.current?.(subscription.table, payload);
          invalidate();
        },
      );
    }
    channel.subscribe((status) => {
      // After a reconnection, refetch in case events were missed meanwhile.
      if (status === 'SUBSCRIBED') invalidate();
    });

    return () => {
      if (timer) clearTimeout(timer);
      void client.removeChannel(channel);
    };
  }, [channelName, signature, queryClient]);
}
