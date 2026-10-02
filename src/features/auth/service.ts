import * as Linking from 'expo-linking';

import { AppError, toAppError } from '@/lib/errors';
import { queryClient } from '@/lib/queryClient';
import { requireSupabase } from '@/lib/supabase';

import { unregisterCurrentPushToken } from '../notifications/usePushNotifications';
import { socialApi } from '../social/api';
import { parseAuthCallback } from './callback';
import { useAuthStore } from './store';

const callbackUrl = (next?: 'reset') => Linking.createURL('auth/callback', next ? { queryParams: { next } } : undefined);

async function run<R extends { data?: unknown; error: unknown }>(action: () => Promise<R>): Promise<R['data']> {
  let result: R;
  try {
    result = await action();
  } catch (error) {
    throw toAppError(error);
  }
  if (result.error) throw toAppError(result.error);
  return result.data;
}

/** Best effort: marks presence offline before the token disappears. */
async function clearPresence() {
  try {
    await socialApi.signOutPresence();
  } catch {
    // Presence also expires on its own after 75 s without heartbeat.
  }
}

export const authService = {
  /** Returns true when the project requires e-mail confirmation first. */
  async signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }> {
    const data = await run(() =>
      requireSupabase().auth.signUp({ email, password, options: { emailRedirectTo: callbackUrl() } }),
    );
    return { needsConfirmation: !data.session };
  },

  async signIn(email: string, password: string) {
    await run(() => requireSupabase().auth.signInWithPassword({ email, password }));
  },

  async resendConfirmation(email: string) {
    await run(() =>
      requireSupabase().auth.resend({ type: 'signup', email, options: { emailRedirectTo: callbackUrl() } }),
    );
  },

  async sendPasswordReset(email: string) {
    await run(() => requireSupabase().auth.resetPasswordForEmail(email, { redirectTo: callbackUrl('reset') }));
  },

  async updatePassword(password: string) {
    await run(() => requireSupabase().auth.updateUser({ password }));
    useAuthStore.getState().setPasswordRecovery(false);
  },

  /** Handles the deep link opened from a confirmation or reset e-mail. */
  async handleCallbackUrl(url: string): Promise<'signed-in' | 'reset' | 'ignored'> {
    const callback = parseAuthCallback(url);
    if (callback.kind === 'none') return 'ignored';
    if (callback.kind === 'error') {
      throw new AppError(callback.code === 'otp_expired' ? 'otp_expired' : 'PV_UNKNOWN');
    }
    await run(() => requireSupabase().auth.exchangeCodeForSession(callback.code));
    if (callback.next === 'reset') {
      useAuthStore.getState().setPasswordRecovery(true);
      return 'reset';
    }
    return 'signed-in';
  },

  async signOut() {
    // The device stops receiving this account's pushes.
    await unregisterCurrentPushToken();
    await clearPresence();
    await run(() => requireSupabase().auth.signOut({ scope: 'local' }));
    queryClient.clear();
  },

  /** Revokes every refresh token of the account (all devices). */
  async signOutEverywhere() {
    await clearPresence();
    await run(() => requireSupabase().auth.signOut({ scope: 'global' }));
    queryClient.clear();
  },

  /** Calls the delete-account Edge Function (service role, server side). */
  async deleteAccount() {
    await run(() => requireSupabase().functions.invoke('delete-account', { method: 'POST' }));
    await requireSupabase().auth.signOut({ scope: 'local' });
    queryClient.clear();
  },
};
