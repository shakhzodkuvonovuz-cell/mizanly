import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from '@/store';

const CACHE_PREFIX = 'offline_cache:';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Finding #286: API offline fallback.
 * Caches API responses locally so they can be served when offline.
 * Uses AsyncStorage for persistence across app restarts.
 */
export function useOfflineFallback<T>(cacheKey: string) {
  const isOffline = useStore(s => s.isOffline);
  const [cachedData, setCachedData] = useState<T | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);

  // Load cached data on mount
  useEffect(() => {
    loadFromCache();
  }, [cacheKey]);

  const loadFromCache = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${cacheKey}`);
      if (!raw) return;

      const { data, timestamp } = JSON.parse(raw);
      const age = Date.now() - timestamp;

      // Only use cache if less than 24 hours old
      if (age < CACHE_TTL) {
        setCachedData(data);
        setIsFromCache(true);
      } else {
        // Expired — remove stale cache
        await AsyncStorage.removeItem(`${CACHE_PREFIX}${cacheKey}`);
      }
    } catch {
      // Cache read failure non-blocking
    }
  }, [cacheKey]);

  const saveToCache = useCallback(async (data: T) => {
    try {
      await AsyncStorage.setItem(
        `${CACHE_PREFIX}${cacheKey}`,
        JSON.stringify({ data, timestamp: Date.now() }),
      );
      setCachedData(data);
      setIsFromCache(false);
    } catch {
      // Cache write failure non-blocking
    }
  }, [cacheKey]);

  /**
   * Wraps an API call with offline fallback.
   * If online: makes the call, caches result, returns fresh data.
   * If offline: returns cached data (or null if no cache).
   */
  const fetchWithFallback = useCallback(async (apiCall: () => Promise<T>): Promise<{ data: T | null; isFromCache: boolean }> => {
    if (isOffline) {
      return { data: cachedData, isFromCache: true };
    }

    try {
      const freshData = await apiCall();
      await saveToCache(freshData);
      return { data: freshData, isFromCache: false };
    } catch (error) {
      // API failed — try cache
      if (cachedData) {
        return { data: cachedData, isFromCache: true };
      }
      throw error;
    }
  }, [isOffline, cachedData, saveToCache]);

  return {
    cachedData,
    isFromCache,
    isOffline,
    fetchWithFallback,
    saveToCache,
  };
}
