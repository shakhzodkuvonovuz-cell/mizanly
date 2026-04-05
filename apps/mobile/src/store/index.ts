import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StoreState } from './types';
import {
  createAuthSlice,
  createUiSlice,
  createFeedSlice,
  createMediaSlice,
  createChatSlice,
  createSettingsSlice,
  createNetworkSlice,
  createCallSlice,
} from './slices';

export type { StoreState } from './types';

export const useStore = create<StoreState>()(
  persist(
    (...a) => ({
      ...createAuthSlice(...a),
      ...createUiSlice(...a),
      ...createFeedSlice(...a),
      ...createMediaSlice(...a),
      ...createChatSlice(...a),
      ...createSettingsSlice(...a),
      ...createNetworkSlice(...a),
      ...createCallSlice(...a),
    }),
    {
      name: 'mizanly-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        // Auth — cached to prevent flash between unauth/auth UI on app open.
        // Clerk still verifies the token in background; if expired, logout() clears these.
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        theme: state.theme,
        safFeedType: state.safFeedType,
        majlisFeedType: state.majlisFeedType,
        followedHashtags: state.followedHashtags,
        recentStickerPackIds: state.recentStickerPackIds,
        searchHistory: state.searchHistory,
        mutedChannelIds: state.mutedChannelIds,
        nasheedMode: state.nasheedMode,
        biometricLockEnabled: state.biometricLockEnabled,
        screenTimeLimitMinutes: state.screenTimeLimitMinutes,
        autoPlaySetting: state.autoPlaySetting,
        ambientModeEnabled: state.ambientModeEnabled,
        islamicThemeEnabled: state.islamicThemeEnabled,
        discoveredFeatures: state.discoveredFeatures,
        userRole: state.userRole,
      }),
    }
  )
);

// Granular selectors (only hooks with external consumers)
export const useUser = () => useStore((s) => s.user);
export const useSafFeedType = () => useStore((s) => s.safFeedType);
export const useMajlisFeedType = () => useStore((s) => s.majlisFeedType);
