import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { BootScreen } from '@/components/BootScreen';
import { lobbiesApi } from '@/features/lobbies/api';
import { errorMessage } from '@/lib/errors';

/** Deep link target: partyverse://join/<CODE> */
export default function JoinByLinkScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!code || started.current) return;
    started.current = true;
    lobbiesApi
      .joinByCode(code.toUpperCase())
      .then((lobbyId) => {
        if (lobbyId) router.replace({ pathname: '/lobby/[lobbyId]', params: { lobbyId } });
        else setError('Ce lien d’invitation n’est plus valide.');
      })
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }, [code]);

  return <BootScreen error={error ?? undefined} onRetry={error ? () => router.replace('/') : undefined} retryLabel="Accueil" />;
}
