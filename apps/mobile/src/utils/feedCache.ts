import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'mizanly:cache:';
const MAX_CACHED_ITEMS = 50;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Simple feed cache using AsyncStorage.
 * Supports stale-while-revalidate pattern:
 * - On app open: immediately show cached data
 * - Then fetch fresh data in background
 * - Update when response arrives
 */
export const feedCache = {
  /**
   * Get cached data for a key. Returns null if no cache or expired.
   */
  async get<T>(key: string, maxAgeMs = 30 * 60 * 1000): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const entry: CacheEntry<T> = JSON.parse(raw);
      // Return data even if stale — caller handles revalidation
      if (Date.now() - entry.timestamp > maxAgeMs) return null;
      return entry.data;
    } catch {
      return null;
    }
  },

  /**
   * Get cached data regardless of age (for offline use).
   */
  async getStale<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const entry: CacheEntry<T> = JSON.parse(raw);
      return entry.data;
    } catch {
      return null;
    }
  },

  /**
   * Store data in cache.
   */
  async set<T>(key: string, data: T): Promise<void> {
    try {
      const entry: CacheEntry<T> = { data, timestamp: Date.now() };
      await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    } catch {
      // Best effort — don't block on cache write failure
    }
  },

  /**
   * Remove a specific cache entry.
   */
  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(CACHE_PREFIX + key);
    } catch {
      // Ignore
    }
  },

  /**
   * Clear all feed caches.
   */
  async clearAll(): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const cacheKeys = allKeys.filter(k => k.startsWith(CACHE_PREFIX));
      if (cacheKeys.length > 0) {
        await AsyncStorage.multiRemove(cacheKeys);
      }
    } catch {
      // Ignore
    }
  },
};

// Common cache keys
export const CACHE_KEYS = {
  SAF_FEED: 'saf_feed',
  BAKRA_FEED: 'bakra_feed',
  MAJLIS_FEED: 'majlis_feed',
  MINBAR_FEED: 'minbar_feed',
  CONVERSATIONS: 'conversations',
  USER_PROFILE: 'user_profile',
  PRAYER_TIMES: 'prayer_times',
};
