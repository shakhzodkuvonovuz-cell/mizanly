import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User, Conversation } from '@/types';

interface AppState {
  // Auth
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;

  // Theme
  theme: 'dark' | 'light' | 'system';
  setTheme: (theme: 'dark' | 'light' | 'system') => void;

  // Network
  isOffline: boolean;
  setIsOffline: (v: boolean) => void;

  // Notifications
  unreadNotifications: number;
  setUnreadNotifications: (count: number) => void;

  // Messages
  unreadMessages: number;
  setUnreadMessages: (count: number) => void;

  // Feed state
  safFeedType: 'following' | 'foryou';
  setSafFeedType: (type: 'following' | 'foryou') => void;
  majlisFeedType: 'foryou' | 'following' | 'trending';
  setMajlisFeedType: (type: 'foryou' | 'following' | 'trending') => void;

  // Create sheet
  isCreateSheetOpen: boolean;
  setCreateSheetOpen: (open: boolean) => void;

  // Hashtags
  followedHashtags: string[];
  addFollowedHashtag(tag: string): void;
  removeFollowedHashtag(tag: string): void;

  logout: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      // Auth
      user: null,
      isAuthenticated: false,
      setUser: (user) => set({ user, isAuthenticated: !!user }),

      // Theme
      theme: 'dark',
      setTheme: (theme) => set({ theme }),

      // Network
      isOffline: false,
      setIsOffline: (isOffline) => set({ isOffline }),

      // Notifications
      unreadNotifications: 0,
      setUnreadNotifications: (unreadNotifications) => set({ unreadNotifications }),

      // Messages
      unreadMessages: 0,
      setUnreadMessages: (unreadMessages) => set({ unreadMessages }),

      // Feed state
      safFeedType: 'following',
      setSafFeedType: (safFeedType) => set({ safFeedType }),
      majlisFeedType: 'foryou',
      setMajlisFeedType: (majlisFeedType) => set({ majlisFeedType }),

      // Create sheet
      isCreateSheetOpen: false,
      setCreateSheetOpen: (isCreateSheetOpen) => set({ isCreateSheetOpen }),

      // Hashtags
      followedHashtags: [],
      addFollowedHashtag: (tag) => set((s) => ({
        followedHashtags: [...s.followedHashtags, tag],
      })),
      removeFollowedHashtag: (tag) => set((s) => ({
        followedHashtags: s.followedHashtags.filter(t => t !== tag),
      })),

      // Auth actions
      logout: () => set({
        user: null,
        isAuthenticated: false,
        unreadNotifications: 0,
        unreadMessages: 0,
        isCreateSheetOpen: false,
      }),
    }),
    {
      name: 'mizanly-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        theme: state.theme,
        safFeedType: state.safFeedType,
        majlisFeedType: state.majlisFeedType,
        followedHashtags: state.followedHashtags,
      }),
    }
  )
);

// Granular selectors
export const useUser = () => useStore((s) => s.user);
export const useTheme = () => useStore((s) => s.theme);
export const useUnreadNotifications = () => useStore((s) => s.unreadNotifications);
export const useUnreadMessages = () => useStore((s) => s.unreadMessages);
export const useSafFeedType = () => useStore((s) => s.safFeedType);
export const useMajlisFeedType = () => useStore((s) => s.majlisFeedType);
export const useFollowedHashtags = () => useStore(s => s.followedHashtags);
