import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  session: Session | null;
  /** Set after opening a password-recovery link: the user must pick a new password. */
  passwordRecovery: boolean;
  setSession: (session: Session | null) => void;
  setPasswordRecovery: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  session: null,
  passwordRecovery: false,
  setSession: (session) => set({ session, status: session ? 'signedIn' : 'signedOut' }),
  setPasswordRecovery: (passwordRecovery) => set({ passwordRecovery }),
}));

export const useCurrentUserId = () => useAuthStore((state) => state.session?.user.id ?? null);
