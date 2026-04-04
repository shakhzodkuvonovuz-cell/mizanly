import type { StateCreator } from 'zustand';
import type { StoreState } from '../types';

export interface UiSlice {
  // Theme
  theme: 'dark' | 'light' | 'system';
  setTheme: (theme: 'dark' | 'light' | 'system') => void;

  // Create sheet
  isCreateSheetOpen: boolean;
  setCreateSheetOpen: (open: boolean) => void;

  // Toast (transient UI state)
  toasts: Array<{
    id: string;
    message: string;
    variant: 'success' | 'error' | 'warning' | 'info';
    duration?: number;
    action?: { label: string; onPress: () => void };
  }>;
  addToast: (toast: {
    id: string;
    message: string;
    variant?: string;
    duration?: number;
    action?: { label: string; onPress: () => void };
  }) => void;
  dismissToast: (id: string) => void;

  // Story viewer (avoids JSON.stringify in route params)
  storyViewerData: { groups: unknown[]; startIndex: number; isOwn?: boolean } | null;
  setStoryViewerData: (data: { groups: unknown[]; startIndex: number; isOwn?: boolean } | null) => void;

  // Islamic calendar themes
  islamicThemeEnabled: boolean;
  setIslamicThemeEnabled: (enabled: boolean) => void;

  // Progressive disclosure (Finding #414)
  discoveredFeatures: string[];
  addDiscoveredFeature: (feature: string) => void;

  // Clipboard link detection (Finding #375)
  lastDetectedLink: string | null;
  setLastDetectedLink: (link: string | null) => void;
}

export const createUiSlice: StateCreator<StoreState, [], [], UiSlice> = (set) => ({
  theme: 'dark' as const,
  setTheme: (theme) => set({ theme }),

  isCreateSheetOpen: false,
  setCreateSheetOpen: (isCreateSheetOpen) => set({ isCreateSheetOpen }),

  toasts: [],
  addToast: (toast) => set((s) => ({
    toasts: [...s.toasts.slice(-1), { ...toast, variant: (toast.variant ?? 'info') as 'success' | 'error' | 'warning' | 'info' }],
  })),
  dismissToast: (id) => set((s) => ({
    toasts: s.toasts.filter(t => t.id !== id),
  })),

  storyViewerData: null,
  setStoryViewerData: (storyViewerData) => set({ storyViewerData }),

  islamicThemeEnabled: true,
  setIslamicThemeEnabled: (islamicThemeEnabled) => set({ islamicThemeEnabled }),

  discoveredFeatures: [] as string[],
  addDiscoveredFeature: (feature: string) => set((s) => ({
    discoveredFeatures: s.discoveredFeatures.includes(feature) ? s.discoveredFeatures : [...s.discoveredFeatures, feature],
  })),

  lastDetectedLink: null,
  setLastDetectedLink: (link) => set({ lastDetectedLink: link }),
});
