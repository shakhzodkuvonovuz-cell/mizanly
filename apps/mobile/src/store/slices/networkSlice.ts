import type { StateCreator } from 'zustand';
import type { StoreState } from '../types';

export interface NetworkSlice {
  // Network status
  isOffline: boolean;
  setIsOffline: (v: boolean) => void;

  // Notifications
  unreadNotifications: number;
  setUnreadNotifications: (count: number) => void;
}

export const createNetworkSlice: StateCreator<StoreState, [], [], NetworkSlice> = (set) => ({
  isOffline: false,
  setIsOffline: (isOffline) => set({ isOffline }),

  unreadNotifications: 0,
  setUnreadNotifications: (unreadNotifications) => set({ unreadNotifications }),
});
