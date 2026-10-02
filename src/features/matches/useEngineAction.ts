import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

import { useToast } from '@/design-system';
import { errorMessage } from '@/lib/errors';

import type { MatchState } from './api';
import { moveErrorIsSilent, type MatchController } from './useMatch';

/** Sends engine actions for the current version; surfaces real errors as toasts. */
export function useEngineAction<A>(state: MatchState, match: MatchController) {
  const toast = useToast();
  const error = match.action.error;

  useEffect(() => {
    if (error && !moveErrorIsSilent(error)) toast.show({ message: errorMessage(error), tone: 'error' });
  }, [error]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendingPayload = match.action.isPending ? (match.action.variables?.payload as A | undefined) : undefined;

  return {
    pending: match.action.isPending,
    pendingPayload,
    send(payload: A) {
      if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      match.action.mutate({ payload, version: state.match.version });
    },
  };
}

/** Seats allowed to act now, from the server. */
export function canAct(state: MatchState): boolean {
  return (
    state.match.status === 'active' &&
    state.my_seat !== null &&
    (state.match.active_seats ?? []).includes(state.my_seat)
  );
}
