import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { configState } from './env';
import { AppError } from './errors';
import { sessionStorage } from './secureStorage';

/**
 * Single Supabase client. `null` when the project is not configured — the
 * app then shows the configuration screen instead of pretending to work.
 */
export const supabase: SupabaseClient | null = configState.ok
  ? createClient(configState.config.supabaseUrl, configState.config.supabaseAnonKey, {
      auth: {
        storage: sessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
        flowType: 'pkce',
      },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new AppError('PV_NOT_CONFIGURED');
  return supabase;
}

// Refresh tokens only while the app is in the foreground (Supabase RN guidance).
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
