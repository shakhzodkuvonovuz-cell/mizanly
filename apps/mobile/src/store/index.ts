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

  // Active call
  activeCallId: string | null;
  setActiveCallId: (id: string | null) => void;

  // Live session
  activeLiveSessionId: string | null;
  setActiveLiveSessionId: (id: string | null) => void;
  isLiveStreaming: boolean;
  setIsLiveStreaming: (v: boolean) => void;

  // Sticker recent
  recentStickerPackIds: string[];
  addRecentStickerPack: (packId: string) => void;

  // Muted broadcast channels
  mutedChannelIds: string[];
  toggleMutedChannel: (channelId: string) => void;

  // Feed preferences
  feedDismissedIds: string[];
  addFeedDismissed: (contentId: string) => void;

  // Search history
  searchHistory: string[];
  addSearchHistory: (query: string) => void;
  clearSearchHistory: () => void;

  // Conversation archive
  archivedConversationsCount: number;
  setArchivedConversationsCount: (count: number) => void;

  // Recording state
  isRecording: boolean;
  setIsRecording: (v: boolean) => void;

  // Video playback
  miniPlayerVideo: { id: string; title: string; channelName: string; thumbnailUri?: string; videoUrl: string; } | null;
  miniPlayerProgress: number; // 0-1
  miniPlayerPlaying: boolean;
  setMiniPlayerVideo: (video: { id: string; title: string; channelName: string; thumbnailUri?: string; videoUrl: string; } | null) => void;
  setMiniPlayerProgress: (progress: number) => void;
  setMiniPlayerPlaying: (playing: boolean) => void;
  closeMiniPlayer: () => void;

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

      // Active call
      activeCallId: null,
      setActiveCallId: (activeCallId) => set({ activeCallId }),

      // Live session
      activeLiveSessionId: null,
      setActiveLiveSessionId: (activeLiveSessionId) => set({ activeLiveSessionId }),
      isLiveStreaming: false,
      setIsLiveStreaming: (isLiveStreaming) => set({ isLiveStreaming }),

      // Sticker recent
      recentStickerPackIds: [],
      addRecentStickerPack: (packId) => set((s) => ({
        recentStickerPackIds: [packId, ...s.recentStickerPackIds.filter(id => id !== packId)].slice(0, 20),
      })),

      // Muted broadcast channels
      mutedChannelIds: [],
      toggleMutedChannel: (channelId) => set((s) => ({
        mutedChannelIds: s.mutedChannelIds.includes(channelId)
          ? s.mutedChannelIds.filter(id => id !== channelId)
          : [...s.mutedChannelIds, channelId],
      })),

      // Feed preferences
      feedDismissedIds: [],
      addFeedDismissed: (contentId) => set((s) => ({
        feedDismissedIds: [...s.feedDismissedIds, contentId].slice(-200),
      })),

      // Search history
      searchHistory: [],
      addSearchHistory: (query) => set((s) => ({
        searchHistory: [query, ...s.searchHistory.filter(q => q !== query)].slice(0, 20),
      })),
      clearSearchHistory: () => set({ searchHistory: [] }),

      // Conversation archive
      archivedConversationsCount: 0,
      setArchivedConversationsCount: (archivedConversationsCount) => set({ archivedConversationsCount }),

      // Recording state
      isRecording: false,
      setIsRecording: (isRecording) => set({ isRecording }),

      // Video playback
      miniPlayerVideo: null,
      miniPlayerProgress: 0,
      miniPlayerPlaying: false,
      setMiniPlayerVideo: (miniPlayerVideo) => set({ miniPlayerVideo }),
      setMiniPlayerProgress: (miniPlayerProgress) => set({ miniPlayerProgress }),
      setMiniPlayerPlaying: (miniPlayerPlaying) => set({ miniPlayerPlaying }),
      closeMiniPlayer: () => set({ miniPlayerVideo: null, miniPlayerProgress: 0, miniPlayerPlaying: false }),

      // Auth actions
      logout: () => set({
        user: null,
        isAuthenticated: false,
        unreadNotifications: 0,
        unreadMessages: 0,
        isCreateSheetOpen: false,
        activeCallId: null,
        activeLiveSessionId: null,
        isLiveStreaming: false,
        recentStickerPackIds: [],
        feedDismissedIds: [],
        searchHistory: [],
        archivedConversationsCount: 0,
        miniPlayerVideo: null,
        miniPlayerProgress: 0,
        miniPlayerPlaying: false,
        isRecording: false,
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
        recentStickerPackIds: state.recentStickerPackIds,
        searchHistory: state.searchHistory,
        mutedChannelIds: state.mutedChannelIds,
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
export const useActiveCallId = () => useStore((s) => s.activeCallId);
export const useActiveLiveSessionId = () => useStore((s) => s.activeLiveSessionId);
export const useIsLiveStreaming = () => useStore((s) => s.isLiveStreaming);
export const useRecentStickerPackIds = () => useStore((s) => s.recentStickerPackIds);
export const useMutedChannelIds = () => useStore((s) => s.mutedChannelIds);
export const useFeedDismissedIds = () => useStore((s) => s.feedDismissedIds);
export const useSearchHistory = () => useStore((s) => s.searchHistory);
export const useArchivedConversationsCount = () => useStore((s) => s.archivedConversationsCount);
export const useIsRecording = () => useStore((s) => s.isRecording);
export const useMiniPlayerVideo = () => useStore((s) => s.miniPlayerVideo);
export const useMiniPlayerProgress = () => useStore((s) => s.miniPlayerProgress);
export const useMiniPlayerPlaying = () => useStore((s) => s.miniPlayerPlaying);
