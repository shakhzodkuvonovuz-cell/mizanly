import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User, Conversation, ParentalRestrictions } from '@/types';

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

  // Nasheed mode
  nasheedMode: boolean;
  setNasheedMode: (enabled: boolean) => void;

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

  // Biometric lock
  biometricLockEnabled: boolean;
  setBiometricLockEnabled: (enabled: boolean) => void;

  // Screen time
  screenTimeSessionStart: number | null;
  setScreenTimeSessionStart: (ts: number | null) => void;
  screenTimeLimitMinutes: number | null;
  setScreenTimeLimitMinutes: (limit: number | null) => void;

  // Auto-play
  autoPlaySetting: 'wifi' | 'always' | 'never';
  setAutoPlaySetting: (s: 'wifi' | 'always' | 'never') => void;

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

  // Download queue
  downloadQueue: string[];
  addToDownloadQueue: (id: string) => void;
  removeFromDownloadQueue: (id: string) => void;

  // PiP
  isPiPActive: boolean;
  setIsPiPActive: (active: boolean) => void;
  pipVideoId: string | null;
  setPiPVideoId: (id: string | null) => void;

  // Ambient mode
  ambientModeEnabled: boolean;
  setAmbientModeEnabled: (enabled: boolean) => void;

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

  // Story viewer (avoids JSON.stringify in route params)
  storyViewerData: { groups: Array<{ userId: string; username: string; avatarUrl: string | null; stories: Array<{ id: string; mediaUrl: string; mediaType: string; createdAt: string }> }>; startIndex: number; isOwn?: boolean } | null;
  setStoryViewerData: (data: { groups: unknown[]; startIndex: number; isOwn?: boolean } | null) => void;

  // Islamic calendar themes
  islamicThemeEnabled: boolean;
  setIslamicThemeEnabled: (enabled: boolean) => void;

  // TTS (Text-to-Speech)
  ttsText: string | null;
  ttsTitle: string | null;
  ttsPlaying: boolean;
  ttsSpeed: number;
  setTTSText: (text: string | null) => void;
  setTTSTitle: (title: string | null) => void;
  setTTSPlaying: (playing: boolean) => void;
  setTTSSpeed: (speed: number) => void;
  stopTTS: () => void;

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

      // Nasheed mode
      nasheedMode: false,
      setNasheedMode: (nasheedMode) => set({ nasheedMode }),

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

      // Biometric lock
      biometricLockEnabled: false,
      setBiometricLockEnabled: (biometricLockEnabled) => set({ biometricLockEnabled }),

      // Screen time
      screenTimeSessionStart: null,
      setScreenTimeSessionStart: (screenTimeSessionStart) => set({ screenTimeSessionStart }),
      screenTimeLimitMinutes: null,
      setScreenTimeLimitMinutes: (screenTimeLimitMinutes) => set({ screenTimeLimitMinutes }),

      // Auto-play
      autoPlaySetting: 'wifi',
      setAutoPlaySetting: (autoPlaySetting) => set({ autoPlaySetting }),

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

      // Download queue
      downloadQueue: [],
      addToDownloadQueue: (id) => set((s) => ({
        downloadQueue: s.downloadQueue.includes(id) ? s.downloadQueue : [...s.downloadQueue, id],
      })),
      removeFromDownloadQueue: (id) => set((s) => ({
        downloadQueue: s.downloadQueue.filter((d) => d !== id),
      })),

      // PiP
      isPiPActive: false,
      setIsPiPActive: (isPiPActive) => set({ isPiPActive }),
      pipVideoId: null,
      setPiPVideoId: (pipVideoId) => set({ pipVideoId }),

      // Ambient mode
      ambientModeEnabled: false,
      setAmbientModeEnabled: (ambientModeEnabled) => set({ ambientModeEnabled }),

      // Accessibility
      reducedMotion: false,
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      highContrast: false,
      setHighContrast: (highContrast) => set({ highContrast }),

      // Parental controls
      isChildAccount: false,
      setIsChildAccount: (isChildAccount) => set({ isChildAccount }),
      parentalRestrictions: null,
      setParentalRestrictions: (parentalRestrictions) => set({ parentalRestrictions }),

      // Story viewer
      storyViewerData: null,
      setStoryViewerData: (storyViewerData) => set({ storyViewerData }),

      // Islamic calendar themes
      islamicThemeEnabled: true,
      setIslamicThemeEnabled: (islamicThemeEnabled) => set({ islamicThemeEnabled }),

      // TTS (Text-to-Speech)
      ttsText: null,
      ttsTitle: null,
      ttsPlaying: false,
      ttsSpeed: 1,
      setTTSText: (ttsText) => set({ ttsText }),
      setTTSTitle: (ttsTitle) => set({ ttsTitle }),
      setTTSPlaying: (ttsPlaying) => set({ ttsPlaying }),
      setTTSSpeed: (ttsSpeed) => set({ ttsSpeed }),
      stopTTS: () => set({ ttsText: null, ttsTitle: null, ttsPlaying: false }),

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
        nasheedMode: false,
        biometricLockEnabled: false,
        downloadQueue: [],
        isChildAccount: false,
        parentalRestrictions: null,
        ttsText: null,
        ttsTitle: null,
        ttsPlaying: false,
        ttsSpeed: 1,
        reducedMotion: false,
        highContrast: false,
        followedHashtags: [],
        screenTimeSessionStart: null,
        pipVideoId: null,
        isPiPActive: false,
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
        nasheedMode: state.nasheedMode,
        biometricLockEnabled: state.biometricLockEnabled,
        screenTimeLimitMinutes: state.screenTimeLimitMinutes,
        autoPlaySetting: state.autoPlaySetting,
        ambientModeEnabled: state.ambientModeEnabled,
        islamicThemeEnabled: state.islamicThemeEnabled,
        feedDismissedIds: state.feedDismissedIds,
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
export const useNasheedMode = () => useStore((s) => s.nasheedMode);
export const useBiometricLockEnabled = () => useStore((s) => s.biometricLockEnabled);
export const useScreenTimeSessionStart = () => useStore((s) => s.screenTimeSessionStart);
export const useScreenTimeLimitMinutes = () => useStore((s) => s.screenTimeLimitMinutes);
export const useAutoPlaySetting = () => useStore((s) => s.autoPlaySetting);
export const useDownloadQueue = () => useStore((s) => s.downloadQueue);
export const useIsPiPActive = () => useStore((s) => s.isPiPActive);
export const usePiPVideoId = () => useStore((s) => s.pipVideoId);
export const useAmbientModeEnabled = () => useStore((s) => s.ambientModeEnabled);
export const useIsChildAccount = () => useStore((s) => s.isChildAccount);
export const useParentalRestrictions = () => useStore((s) => s.parentalRestrictions);
export const useIslamicThemeEnabled = () => useStore((s) => s.islamicThemeEnabled);
export const useTTSActive = () => useStore((s) => !!s.ttsText);
export const useTTSPlaying = () => useStore((s) => s.ttsPlaying);
