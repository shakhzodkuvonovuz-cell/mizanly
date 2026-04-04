import type { StateCreator } from 'zustand';
import type { User } from '@/types';
import type { StoreState } from '../types';

export interface AuthSlice {
  // Auth
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;

  // Role-based home (Finding #415)
  userRole: 'viewer' | 'creator' | 'scholar' | 'business';
  setUserRole: (role: 'viewer' | 'creator' | 'scholar' | 'business') => void;

  logout: () => void;
}

export const createAuthSlice: StateCreator<StoreState, [], [], AuthSlice> = (set) => ({
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: !!user }),

  userRole: 'viewer' as const,
  setUserRole: (role) => set({ userRole: role }),

  logout: () => set({
    // Auth
    user: null,
    isAuthenticated: false,
    // Notifications
    unreadNotifications: 0,
    unreadMessages: 0,
    // UI
    isCreateSheetOpen: false,
    toasts: [],
    discoveredFeatures: [],
    lastDetectedLink: null,
    // Call
    activeCallId: null,
    activeCallName: null,
    activeCallDuration: 0,
    activeLiveSessionId: null,
    isLiveStreaming: false,
    // Chat
    recentStickerPackIds: [],
    searchHistory: [],
    archivedConversationsCount: 0,
    followedHashtags: [],
    mutedChannelIds: [] as string[],
    // Media
    miniPlayerVideo: null,
    miniPlayerProgress: 0,
    miniPlayerPlaying: false,
    isRecording: false,
    nasheedMode: false,
    downloadQueue: [],
    pipVideoId: null,
    isPiPActive: false,
    ttsText: null,
    ttsTitle: null,
    ttsPlaying: false,
    ttsSpeed: 1,
    // Settings
    biometricLockEnabled: false,
    isChildAccount: false,
    parentalRestrictions: null,
    screenTimeSessionStart: null,
    reducedMotion: false,
    highContrast: false,
    // Feed
    safScrollOffset: 0,
    majlisScrollOffset: 0,
    bakraScrollOffset: 0,
    minbarScrollOffset: 0,
    cachedFeedData: null,
    // Role
    userRole: 'viewer' as const,
  }),
});
