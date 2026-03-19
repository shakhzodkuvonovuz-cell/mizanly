import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'mizanly_cache_';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes default TTL

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * Offline cache layer using AsyncStorage for API responses.
 * Provides stale-while-revalidate semantics:
 * - Return cached data immediately if available
 * - Fetch fresh data in background
 * - Update cache with fresh data
 */
export const offlineCache = {
  /**
   * Get cached data for a key
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${key}`);
      if (!raw) return null;

      const entry: CacheEntry<T> = JSON.parse(raw);
      const age = Date.now() - entry.timestamp;

      // Return data even if stale (stale-while-revalidate)
      // Caller decides whether to refetch based on isStale flag
      return entry.data;
    } catch {
      return null;
    }
  },

  /**
   * Check if cached data is still fresh
   */
  async isFresh(key: string): Promise<boolean> {
    try {
      const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${key}`);
      if (!raw) return false;

      const entry: CacheEntry<unknown> = JSON.parse(raw);
      return Date.now() - entry.timestamp < entry.ttl;
    } catch {
      return false;
    }
  },

  /**
   * Store data in cache
   */
  async set<T>(key: string, data: T, ttlMs = CACHE_TTL_MS): Promise<void> {
    try {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl: ttlMs,
      };
      await AsyncStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(entry));
    } catch {
      // Cache write failure is non-critical
    }
  },

  /**
   * Remove a specific cache entry
   */
  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(`${CACHE_PREFIX}${key}`);
    } catch {
      // Non-critical
    }
  },

  /**
   * Clear all cache entries
   */
  async clearAll(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(k => k.startsWith(CACHE_PREFIX));
      if (cacheKeys.length > 0) {
        await AsyncStorage.multiRemove(cacheKeys);
      }
    } catch {
      // Non-critical
    }
  },

  /**
   * Evict expired entries to free storage
   */
  async evictExpired(): Promise<number> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(k => k.startsWith(CACHE_PREFIX));
      let evicted = 0;

      for (const key of cacheKeys) {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) continue;

        try {
          const entry: CacheEntry<unknown> = JSON.parse(raw);
          if (Date.now() - entry.timestamp > entry.ttl * 2) {
            // Evict entries that are 2x past their TTL
            await AsyncStorage.removeItem(key);
            evicted++;
          }
        } catch {
          // Corrupted entry — remove it
          await AsyncStorage.removeItem(key);
          evicted++;
        }
      }

      return evicted;
    } catch {
      return 0;
    }
  },
};

/**
 * HOF: wrap an API call with offline cache
 * Returns cached data immediately, then fetches fresh data
 */
export function withOfflineCache<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  ttlMs = CACHE_TTL_MS,
): () => Promise<T> {
  return async () => {
    // Try to get fresh data first
    try {
      const fresh = await fetcher();
      // Cache the result in background
      offlineCache.set(cacheKey, fresh, ttlMs).catch(() => {});
      return fresh;
    } catch {
      // Network error — try cache fallback
      const cached = await offlineCache.get<T>(cacheKey);
      if (cached !== null) {
        return cached;
      }
      // No cache available — rethrow
      throw new Error('Network error and no cached data available');
    }
  };
}
