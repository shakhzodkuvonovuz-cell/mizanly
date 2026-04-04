import type { StateCreator } from 'zustand';
import type { StoreState } from '../types';

export interface MiniPlayerVideo {
  id: string;
  title: string;
  channelName: string;
  thumbnailUri?: string;
  videoUrl: string;
}

export interface MediaSlice {
  // Video playback (mini player)
  miniPlayerVideo: MiniPlayerVideo | null;
  miniPlayerProgress: number;
  miniPlayerPlaying: boolean;
  setMiniPlayerVideo: (video: MiniPlayerVideo | null) => void;
  setMiniPlayerProgress: (progress: number) => void;
  setMiniPlayerPlaying: (playing: boolean) => void;
  closeMiniPlayer: () => void;

  // PiP
  isPiPActive: boolean;
  setIsPiPActive: (active: boolean) => void;
  pipVideoId: string | null;
  setPiPVideoId: (id: string | null) => void;

  // Ambient mode
  ambientModeEnabled: boolean;
  setAmbientModeEnabled: (enabled: boolean) => void;

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

  // Nasheed mode
  nasheedMode: boolean;
  setNasheedMode: (enabled: boolean) => void;

  // Recording state
  isRecording: boolean;
  setIsRecording: (v: boolean) => void;

  // Auto-play
  autoPlaySetting: 'wifi' | 'always' | 'never';
  setAutoPlaySetting: (s: 'wifi' | 'always' | 'never') => void;

  // Download queue
  downloadQueue: string[];
  addToDownloadQueue: (id: string) => void;
  removeFromDownloadQueue: (id: string) => void;
}

export const createMediaSlice: StateCreator<StoreState, [], [], MediaSlice> = (set) => ({
  miniPlayerVideo: null,
  miniPlayerProgress: 0,
  miniPlayerPlaying: false,
  setMiniPlayerVideo: (miniPlayerVideo) => set({ miniPlayerVideo }),
  setMiniPlayerProgress: (miniPlayerProgress) => set({ miniPlayerProgress }),
  setMiniPlayerPlaying: (miniPlayerPlaying) => set({ miniPlayerPlaying }),
  closeMiniPlayer: () => set({ miniPlayerVideo: null, miniPlayerProgress: 0, miniPlayerPlaying: false }),

  isPiPActive: false,
  setIsPiPActive: (isPiPActive) => set({ isPiPActive }),
  pipVideoId: null,
  setPiPVideoId: (pipVideoId) => set({ pipVideoId }),

  ambientModeEnabled: false,
  setAmbientModeEnabled: (ambientModeEnabled) => set({ ambientModeEnabled }),

  ttsText: null,
  ttsTitle: null,
  ttsPlaying: false,
  ttsSpeed: 1,
  setTTSText: (ttsText) => set({ ttsText }),
  setTTSTitle: (ttsTitle) => set({ ttsTitle }),
  setTTSPlaying: (ttsPlaying) => set({ ttsPlaying }),
  setTTSSpeed: (ttsSpeed) => set({ ttsSpeed }),
  stopTTS: () => set({ ttsText: null, ttsTitle: null, ttsPlaying: false }),

  nasheedMode: false,
  setNasheedMode: (nasheedMode) => set({ nasheedMode }),

  isRecording: false,
  setIsRecording: (isRecording) => set({ isRecording }),

  autoPlaySetting: 'wifi' as const,
  setAutoPlaySetting: (autoPlaySetting) => set({ autoPlaySetting }),

  downloadQueue: [],
  addToDownloadQueue: (id) => set((s) => ({
    downloadQueue: s.downloadQueue.includes(id) ? s.downloadQueue : [...s.downloadQueue, id],
  })),
  removeFromDownloadQueue: (id) => set((s) => ({
    downloadQueue: s.downloadQueue.filter((d) => d !== id),
  })),
});
