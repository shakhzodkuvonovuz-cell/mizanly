import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, NativeModules } from 'react-native';

// ── Widget data interfaces ──────────────────────────────────────────

export interface PrayerTimesWidgetData {
  nextPrayer: string;
  nextPrayerTime: string;
  remainingMinutes: number;
  location: string;
  fajr: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

export interface UnreadWidgetData {
  unreadMessages: number;
  unreadNotifications: number;
  userName: string;
  avatarUrl: string;
}

// ── Storage keys ────────────────────────────────────────────────────

const PRAYER_KEY = 'widget_prayer_data';
const UNREAD_KEY = 'widget_unread_data';

// ── Native bridge helper ────────────────────────────────────────────

interface WidgetNativeModule {
  updatePrayerWidget?: (json: string) => void;
  updateUnreadWidget?: (json: string) => void;
}

function getWidgetModule(): WidgetNativeModule | null {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return (NativeModules as Record<string, WidgetNativeModule>).WidgetModule ?? null;
  }
  return null;
}

/**
 * Pushes serialised data to the native widget layer (SharedPreferences on
 * Android, UserDefaults App Group on iOS) so the OS widget can read it.
 * Falls back silently when the native module isn't linked (e.g. Expo Go).
 */
function pushToNative(method: keyof WidgetNativeModule, json: string): void {
  try {
    const mod = getWidgetModule();
    if (!mod) {
      if (__DEV__) console.debug('[WidgetData] Native widget module not available — data saved to AsyncStorage only');
      return;
    }
    mod[method]?.(json);
  } catch (err) {
    if (__DEV__) console.warn('[WidgetData] Failed to push to native widget:', err instanceof Error ? err.message : err);
  }
}

// ── Public API ──────────────────────────────────────────────────────

export const widgetData = {
  /** Persist prayer-time data for the home-screen widget. */
  async updatePrayerTimes(data: PrayerTimesWidgetData): Promise<void> {
    const json = JSON.stringify(data);
    await AsyncStorage.setItem(PRAYER_KEY, json);
    pushToNative('updatePrayerWidget', json);
  },

  /** Persist unread-count data for the home-screen widget. */
  async updateUnreadCounts(data: UnreadWidgetData): Promise<void> {
    const json = JSON.stringify(data);
    await AsyncStorage.setItem(UNREAD_KEY, json);
    pushToNative('updateUnreadWidget', json);
  },

  /** Read cached prayer-time widget data (or null). */
  async getPrayerTimes(): Promise<PrayerTimesWidgetData | null> {
    const raw = await AsyncStorage.getItem(PRAYER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as PrayerTimesWidgetData; }
    catch {
      if (__DEV__) console.warn('[widgetData] Corrupted prayer cache, returning null');
      return null;
    }
  },

  /** Read cached unread-count widget data (or null). */
  async getUnreadCounts(): Promise<UnreadWidgetData | null> {
    const raw = await AsyncStorage.getItem(UNREAD_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as UnreadWidgetData; }
    catch {
      if (__DEV__) console.warn('[widgetData] Corrupted unread cache, returning null');
      return null;
    }
  },
};
