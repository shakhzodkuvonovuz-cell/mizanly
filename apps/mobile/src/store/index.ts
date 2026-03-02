import { create } from 'zustand';
import type { User, Conversation } from '@/types';

interface AppState {
  // Auth
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;

  // Theme
  theme: 'dark' | 'light' | 'system';
  setTheme: (theme: 'dark' | 'light' | 'system') => void;

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
}

export const useStore = create<AppState>((set) => ({
  // Auth
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: !!user }),

  // Theme
  theme: 'dark',
  setTheme: (theme) => set({ theme }),

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
}));
