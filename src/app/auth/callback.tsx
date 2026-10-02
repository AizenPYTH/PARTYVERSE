import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { BootScreen } from '@/components/BootScreen';
import { authService } from '@/features/auth/service';
import { errorMessage } from '@/lib/errors';

/**
 * Landing route for e-mail links (sign-up confirmation, password reset).
 * Exchanges the PKCE code for a session; the root guard then routes the user.
 */
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; next?: string }>();
  const linkingUrl = Linking.useLinkingURL();
  // Router params are reliable for the PKCE code; the raw URL also carries
  // errors that Supabase puts in the fragment.
  const url = params.code
    ? `partyverse://auth/callback?${new URLSearchParams({ code: params.code, ...(params.next ? { next: params.next } : {}) })}`
    : linkingUrl;
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (!url || handled.current) return;
    handled.current = true;
    authService
      .handleCallbackUrl(url)
      .then((result) => {
        if (result === 'ignored') router.replace('/');
        else if (result === 'reset') router.replace('/reset-password');
        else router.replace('/');
      })
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }, [url]);

  return <BootScreen error={error ?? undefined} onRetry={error ? () => router.replace('/') : undefined} retryLabel="Accueil" />;
}
