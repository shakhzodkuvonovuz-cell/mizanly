import Redis from 'ioredis';

/**
 * Atomic INCR + conditional EXPIRE via Lua script.
 * Eliminates the crash-between race condition where a process dies between
 * INCR and EXPIRE, leaving an immortal key in Redis.
 *
 * J07-H6: Used by rate limiters, counters, and any INCR pattern that needs a TTL.
 */
export async function atomicIncr(redis: Redis, key: string, ttlSeconds: number): Promise<number> {
  return redis.eval(
    "local c = redis.call('INCR', KEYS[1]); if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end; return c",
    1, key, ttlSeconds,
  ) as Promise<number>;
}
