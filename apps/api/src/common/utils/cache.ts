import Redis from 'ioredis';

/**
 * Cache-aside pattern helper.
 * Checks Redis first, falls back to the fetcher, caches the result.
 */
export async function cacheAside<T>(
  redis: Redis,
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as T;

  const result = await fetcher();
  if (result !== null && result !== undefined) {
    await redis.setex(key, ttlSeconds, JSON.stringify(result));
  }
  return result;
}

/**
 * Invalidate one or more cache keys.
 */
export async function invalidateCache(redis: Redis, ...keys: string[]): Promise<void> {
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

/**
 * Invalidate all keys matching a pattern (use sparingly).
 */
export async function invalidateCachePattern(redis: Redis, pattern: string): Promise<void> {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
