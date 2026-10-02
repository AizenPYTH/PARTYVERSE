import { useState } from 'react';

import { msUntil } from '@/lib/serverClock';

import { useInterval } from './useInterval';

/** Milliseconds left until a server-side deadline (null when none). */
export function useCountdown(deadlineIso: string | null | undefined, tickMs = 250): number | null {
  const [, force] = useState(0);
  useInterval(() => force((value) => value + 1), deadlineIso ? tickMs : null);
  return msUntil(deadlineIso);
}
