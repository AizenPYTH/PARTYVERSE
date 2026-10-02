import { useEffect } from 'react';

import { useAppActive } from '@/hooks/useAppActive';
import { useInterval } from '@/hooks/useInterval';

import { socialApi } from './api';

const HEARTBEAT_MS = 30_000;

/**
 * Keeps the user "online" while the app is in the foreground. The server
 * considers a user offline after 75 s without heartbeat, so a killed app or a
 * lost connection never leaves a ghost "online" status.
 */
export function usePresenceHeartbeat(enabled: boolean) {
  const active = useAppActive();
  const running = enabled && active;
  const beat = () => {
    socialApi.heartbeat().catch(() => undefined);
  };

  useEffect(() => {
    if (running) beat();
  }, [running]);
  useInterval(beat, running ? HEARTBEAT_MS : null);
}
