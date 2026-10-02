import { useEffect } from 'react';

import { supabase } from '@/lib/supabase';

import { useAuthStore } from './store';

/** Restores the persisted session on launch and follows auth changes. */
export function useAuthBootstrap() {
  useEffect(() => {
    if (!supabase) return;
    const { setSession, setPasswordRecovery } = useAuthStore.getState();
    let cancelled = false;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) setSession(data.session);
      })
      .catch(() => {
        if (!cancelled) setSession(null);
      });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      setSession(session);
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);
}
