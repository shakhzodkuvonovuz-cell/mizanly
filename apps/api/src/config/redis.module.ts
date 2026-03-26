import { Module, Global, Logger } from '@nestjs/common';
import Redis from 'ioredis';

const redisLogger = new Logger('Redis');

const REDIS_PROVIDER = {
  provide: 'REDIS',
  useFactory: () => {
    const redisUrl = process.env.REDIS_URL;
    const nodeEnv = process.env.NODE_ENV || 'development';
    const isProduction = nodeEnv === 'production' || nodeEnv === 'staging';

    // In production: Redis is required infrastructure. Fail loudly.
    if (!redisUrl && isProduction) {
      throw new Error(
        'REDIS_URL is not set. Redis is required infrastructure in production/staging. '
        + 'Rate limiting, notification dedup, session signals, presence, queue, and caching '
        + 'all depend on Redis. The application cannot start safely without it.',
      );
    }

    if (!redisUrl) {
      redisLogger.warn(
        'REDIS_URL not set (development mode). Redis-dependent features will degrade: '
        + 'rate limiting, notification dedup, session signals, presence, AB tests, queues.',
      );
    }

    const redis = new Redis(redisUrl || 'redis://localhost', {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    redis.on('error', (err: Error) => {
      if (isProduction) {
        redisLogger.error(`Redis connection error (CRITICAL): ${err.message}`);
      } else {
        redisLogger.warn(`Redis error (development): ${err.message}`);
      }
    });

    redis.connect().catch((err: Error) => {
      if (isProduction) {
        redisLogger.error(`Redis connection FAILED in production: ${err.message}. Platform integrity compromised.`);
        // Don't crash here — the app is already started. But log at error level so monitoring catches it.
      } else {
        redisLogger.warn(`Redis connection failed (development): ${err.message}. Redis-dependent features disabled.`);
      }
    });

    // Development-only: graceful degradation proxy
    // In production: Redis MUST be connected. No proxy fallback.
    if (!isProduction) {
      const noOpRead = () => Promise.resolve(null);
      const noOpWrite = () => Promise.resolve('OK');
      const noOpNum = () => Promise.resolve(0);
      const noOpArr = () => Promise.resolve([]);

      return new Proxy(redis, {
        get(target, prop) {
          const val = target[prop as keyof typeof target];
          if (typeof val === 'function' && target.status !== 'ready') {
            if (['get', 'hget', 'hgetall', 'mget', 'lrange', 'smembers', 'sismember', 'exists', 'ttl', 'type', 'zrevrange'].includes(prop as string)) {
              return noOpRead;
            }
            if (['set', 'setex', 'del', 'hdel', 'hset', 'hmset', 'lpush', 'rpush', 'ltrim', 'lrem', 'sadd', 'srem', 'expire', 'pexpire', 'persist', 'publish', 'pfadd', 'pfcount', 'zadd'].includes(prop as string)) {
              return noOpWrite;
            }
            if (['incr', 'incrby', 'decr', 'decrby', 'scard', 'llen', 'dbsize', 'zcard'].includes(prop as string)) {
              return noOpNum;
            }
            if (prop === 'pipeline') {
              return () => {
                const stub: Record<string, unknown> = { exec: () => Promise.resolve([]) };
                return new Proxy(stub, {
                  get(t, p) { return t[p as string] ?? (() => stub); },
                });
              };
            }
            if (prop === 'keys') return noOpArr;
            if (prop === 'ping') return () => Promise.resolve('PONG');
            if (prop === 'duplicate') return () => ({ subscribe: () => Promise.resolve(), on: () => {} });
            return noOpRead;
          }
          return val;
        },
      });
    }

    // Production: return raw Redis client. No proxy. No fallback.
    return redis;
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
