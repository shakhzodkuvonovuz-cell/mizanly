import type { StateCreator } from 'zustand';
import type { StoreState } from '../types';

export interface ChatSlice {
  // Unread messages
  unreadMessages: number;
  setUnreadMessages: (count: number) => void;

  // Conversation archive
  archivedConversationsCount: number;
  setArchivedConversationsCount: (count: number) => void;

  // Sticker recent
  recentStickerPackIds: string[];
  addRecentStickerPack: (packId: string) => void;

  // Muted broadcast channels
  mutedChannelIds: string[];
  toggleMutedChannel: (channelId: string) => void;

  // Hashtags
  followedHashtags: string[];
  addFollowedHashtag: (tag: string) => void;
  removeFollowedHashtag: (tag: string) => void;

  // Search history
  searchHistory: string[];
  addSearchHistory: (query: string) => void;
  clearSearchHistory: () => void;
}

export const createChatSlice: StateCreator<StoreState, [], [], ChatSlice> = (set) => ({
  unreadMessages: 0,
  setUnreadMessages: (unreadMessages) => set({ unreadMessages }),

  archivedConversationsCount: 0,
  setArchivedConversationsCount: (archivedConversationsCount) => set({ archivedConversationsCount }),

  recentStickerPackIds: [],
  addRecentStickerPack: (packId) => set((s) => ({
    recentStickerPackIds: [packId, ...s.recentStickerPackIds.filter(id => id !== packId)].slice(0, 20),
  })),

  mutedChannelIds: [],
  toggleMutedChannel: (channelId) => set((s) => ({
    mutedChannelIds: s.mutedChannelIds.includes(channelId)
      ? s.mutedChannelIds.filter(id => id !== channelId)
      : [...s.mutedChannelIds, channelId],
  })),

  followedHashtags: [],
  addFollowedHashtag: (tag) => set((s) => ({
    followedHashtags: [...s.followedHashtags, tag],
  })),
  removeFollowedHashtag: (tag) => set((s) => ({
    followedHashtags: s.followedHashtags.filter(t => t !== tag),
  })),

  searchHistory: [],
  addSearchHistory: (query) => set((s) => ({
    searchHistory: [query, ...s.searchHistory.filter(q => q !== query)].slice(0, 20),
  })),
  clearSearchHistory: () => set({ searchHistory: [] }),
});
