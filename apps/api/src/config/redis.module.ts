import { Module, Global } from '@nestjs/common';
import Redis from 'ioredis';

const REDIS_PROVIDER = {
  provide: 'REDIS',
  useFactory: () => {
    return new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });
  },
};

@Global()
@Module({ providers: [REDIS_PROVIDER], exports: [REDIS_PROVIDER] })
export class RedisModule {}