import { create } from 'zustand';

/**
 * Keeps the user inside the onboarding flow for its last optional step
 * (friend suggestions), which happens after the profile is created.
 */
export const useOnboardingFlow = create<{ active: boolean; setActive: (active: boolean) => void }>((set) => ({
  active: false,
  setActive: (active) => set({ active }),
}));
