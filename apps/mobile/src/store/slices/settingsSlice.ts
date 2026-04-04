import type { StateCreator } from 'zustand';
import type { ParentalRestrictions } from '@/types';
import type { StoreState } from '../types';

export interface SettingsSlice {
  // Biometric lock
  biometricLockEnabled: boolean;
  setBiometricLockEnabled: (enabled: boolean) => void;

  // Screen time
  screenTimeSessionStart: number | null;
  setScreenTimeSessionStart: (ts: number | null) => void;
  screenTimeLimitMinutes: number | null;
  setScreenTimeLimitMinutes: (limit: number | null) => void;

  // Accessibility
  reducedMotion: boolean;
  setReducedMotion: (v: boolean) => void;
  highContrast: boolean;
  setHighContrast: (v: boolean) => void;

  // Parental controls
  isChildAccount: boolean;
  setIsChildAccount: (v: boolean) => void;
  parentalRestrictions: ParentalRestrictions | null;
  setParentalRestrictions: (r: ParentalRestrictions | null) => void;
}

export const createSettingsSlice: StateCreator<StoreState, [], [], SettingsSlice> = (set) => ({
  biometricLockEnabled: false,
  setBiometricLockEnabled: (biometricLockEnabled) => set({ biometricLockEnabled }),

  screenTimeSessionStart: null,
  setScreenTimeSessionStart: (screenTimeSessionStart) => set({ screenTimeSessionStart }),
  screenTimeLimitMinutes: null,
  setScreenTimeLimitMinutes: (screenTimeLimitMinutes) => set({ screenTimeLimitMinutes }),

  reducedMotion: false,
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  highContrast: false,
  setHighContrast: (highContrast) => set({ highContrast }),

  isChildAccount: false,
  setIsChildAccount: (isChildAccount) => set({ isChildAccount }),
  parentalRestrictions: null,
  setParentalRestrictions: (parentalRestrictions) => set({ parentalRestrictions }),
});
