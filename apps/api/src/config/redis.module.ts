import { Module, Global } from '@nestjs/common';
import Redis from 'ioredis';

const REDIS_PROVIDER = {
  provide: 'REDIS',
  useFactory: () => {
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost', {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    // Suppress connection errors in dev when Redis isn't running
    redis.on('error', () => {});
    redis.connect().catch(() => {});
    // Return a proxy that returns null/no-op on failed connections
    return new Proxy(redis, {
      get(target, prop) {
        const val = target[prop as keyof typeof target];
        if (typeof val === 'function' && target.status !== 'ready') {
          return (...args: unknown[]) => {
            if (prop === 'get') return Promise.resolve(null);
            if (prop === 'setex' || prop === 'set' || prop === 'del' || prop === 'incr') return Promise.resolve('OK');
            return Promise.resolve(null);
          };
        }
        return val;
      },
    });
  },
};

@Global()
@Module({ providers: [REDIS_PROVIDER], exports: [REDIS_PROVIDER] })
export class RedisModule {}