import type { StateCreator } from 'zustand';
import type { StoreState } from '../types';

export interface FeedSlice {
  // Feed type selection
  safFeedType: 'following' | 'foryou';
  setSafFeedType: (type: 'following' | 'foryou') => void;
  majlisFeedType: 'foryou' | 'following' | 'trending' | 'video';
  setMajlisFeedType: (type: 'foryou' | 'following' | 'trending' | 'video') => void;

  // Feed scroll position persistence (transient)
  safScrollOffset: number;
  setSafScrollOffset: (offset: number) => void;
  majlisScrollOffset: number;
  setMajlisScrollOffset: (offset: number) => void;
  bakraScrollOffset: number;
  setBakraScrollOffset: (offset: number) => void;
  minbarScrollOffset: number;
  setMinbarScrollOffset: (offset: number) => void;

  // Offline cache (Finding #286)
  cachedFeedData: Record<string, unknown> | null;
  setCachedFeedData: (data: Record<string, unknown> | null) => void;
}

export const createFeedSlice: StateCreator<StoreState, [], [], FeedSlice> = (set) => ({
  safFeedType: 'following' as const,
  setSafFeedType: (safFeedType) => set({ safFeedType }),
  majlisFeedType: 'foryou' as const,
  setMajlisFeedType: (majlisFeedType) => set({ majlisFeedType }),

  safScrollOffset: 0,
  setSafScrollOffset: (safScrollOffset) => set({ safScrollOffset }),
  majlisScrollOffset: 0,
  setMajlisScrollOffset: (majlisScrollOffset) => set({ majlisScrollOffset }),
  bakraScrollOffset: 0,
  setBakraScrollOffset: (bakraScrollOffset) => set({ bakraScrollOffset }),
  minbarScrollOffset: 0,
  setMinbarScrollOffset: (minbarScrollOffset) => set({ minbarScrollOffset }),

  cachedFeedData: null,
  setCachedFeedData: (data) => set({ cachedFeedData: data }),
});
