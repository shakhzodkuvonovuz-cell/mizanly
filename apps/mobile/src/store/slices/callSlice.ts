import type { StateCreator } from 'zustand';
import type { StoreState } from '../types';

export interface CallSlice {
  // Active call (used by CallActiveBar floating indicator)
  activeCallId: string | null;
  activeCallName: string | null;
  activeCallDuration: number;
  setActiveCallId: (id: string | null) => void;
  setActiveCall: (id: string | null, name: string | null) => void;
  setActiveCallDuration: (duration: number) => void;

  // Live session
  activeLiveSessionId: string | null;
  setActiveLiveSessionId: (id: string | null) => void;
  isLiveStreaming: boolean;
  setIsLiveStreaming: (v: boolean) => void;
}

export const createCallSlice: StateCreator<StoreState, [], [], CallSlice> = (set) => ({
  activeCallId: null,
  activeCallName: null,
  activeCallDuration: 0,
  setActiveCallId: (activeCallId) => set({ activeCallId }),
  setActiveCall: (id, name) => set({ activeCallId: id, activeCallName: name, activeCallDuration: 0 }),
  setActiveCallDuration: (duration) => set({ activeCallDuration: duration }),

  activeLiveSessionId: null,
  setActiveLiveSessionId: (activeLiveSessionId) => set({ activeLiveSessionId }),
  isLiveStreaming: false,
  setIsLiveStreaming: (isLiveStreaming) => set({ isLiveStreaming }),
});
