import { Module, Global, Logger } from '@nestjs/common';
import Redis from 'ioredis';

const redisLogger = new Logger('Redis');

const REDIS_PROVIDER = {
  provide: 'REDIS',
  useFactory: () => {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      redisLogger.warn('REDIS_URL not set — using no-op Redis proxy (cache/queue/rate-limiting disabled)');
    }

    const redis = new Redis(redisUrl || 'redis://localhost', {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    // Log Redis errors instead of silently swallowing
    redis.on('error', (err: Error) => {
      redisLogger.error(`Redis error: ${err.message}`);
    });
    redis.connect().catch((err: Error) => {
      redisLogger.warn(`Redis connection failed: ${err.message} — falling back to no-op proxy`);
    });

    // No-op methods for when Redis is disconnected — covers ALL commonly used commands
    const noOpRead = () => Promise.resolve(null);
    const noOpWrite = () => Promise.resolve('OK');
    const noOpNum = () => Promise.resolve(0);
    const noOpArr = () => Promise.resolve([]);

    return new Proxy(redis, {
      get(target, prop) {
        const val = target[prop as keyof typeof target];
        if (typeof val === 'function' && target.status !== 'ready') {
          // Read commands → null/empty
          if (['get', 'hget', 'hgetall', 'mget', 'lrange', 'smembers', 'sismember', 'exists', 'ttl', 'type'].includes(prop as string)) {
            return noOpRead;
          }
          // Write commands → OK
          if (['set', 'setex', 'del', 'hdel', 'hset', 'hmset', 'lpush', 'rpush', 'ltrim', 'lrem', 'sadd', 'srem', 'expire', 'pexpire', 'persist'].includes(prop as string)) {
            return noOpWrite;
          }
          // Numeric commands → 0
          if (['incr', 'incrby', 'decr', 'decrby', 'scard', 'llen', 'dbsize'].includes(prop as string)) {
            return noOpNum;
          }
          // Pipeline → return chainable stub
          if (prop === 'pipeline') {
            return () => {
              const stub: Record<string, unknown> = { exec: () => Promise.resolve([]) };
              return new Proxy(stub, {
                get(t, p) { return t[p as string] ?? (() => stub); },
              });
            };
          }
          // Ping → PONG
          if (prop === 'ping') return () => Promise.resolve('PONG');
          // Default: resolve null
          return noOpRead;
        }
        return val;
      },
    });
  },
};

const REDIS_SHUTDOWN = {
  provide: 'REDIS_SHUTDOWN',
  useFactory: (redis: Redis) => ({
    onModuleDestroy: async () => {
      try {
        if (redis.status === 'ready') {
          await redis.quit();
          redisLogger.log('Redis connection closed gracefully');
        }
      } catch {
        // Already disconnected
      }
    },
  }),
  inject: ['REDIS'],
};

@Global()
@Module({
  providers: [REDIS_PROVIDER, REDIS_SHUTDOWN],
  exports: [REDIS_PROVIDER],
})
export class RedisModule {}