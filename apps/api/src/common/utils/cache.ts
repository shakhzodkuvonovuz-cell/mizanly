import Redis from 'ioredis';

/**
 * Cache-aside pattern with stampede protection.
 *
 * When the cache expires, only ONE caller fetches from the database.
 * Other concurrent callers wait for the lock holder to populate the cache.
 * Uses a Redis SET NX lock with short TTL to prevent deadlocks.
 */
export async function cacheAside<T>(
  redis: Redis,
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  // 1. Try cache first
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as T;

  // 2. Cache miss — acquire lock to prevent stampede
  const lockKey = `lock:${key}`;
  const lockAcquired = await redis.set(lockKey, '1', 'EX', 10, 'NX'); // 10s lock TTL

  if (lockAcquired) {
    // We got the lock — fetch, cache, release
    try {
      const result = await fetcher();
      if (result !== null && result !== undefined) {
        await redis.setex(key, ttlSeconds, JSON.stringify(result));
      }
      return result;
    } finally {
      await redis.del(lockKey);
    }
  }

  // 3. Another caller has the lock — wait and retry (3 attempts, 100ms apart)
  for (let attempt = 0; attempt < 3; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    const retryCache = await redis.get(key);
    if (retryCache) return JSON.parse(retryCache) as T;
  }

  // 4. Still no cache after 3 retries (lock holder failed) — fetch directly
  return fetcher();
}

