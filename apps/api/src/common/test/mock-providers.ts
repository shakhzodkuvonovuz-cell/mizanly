import { AsyncJobService } from '../services/async-jobs.service';
import { AnalyticsService } from '../services/analytics.service';
import { FeatureFlagsService } from '../services/feature-flags.service';

/**
 * Shared mock providers for test modules.
 * Add these to any test module that needs the global services.
 */

export const mockPushTriggerService = {
  provide: 'PushTriggerService',
  useValue: { triggerPush: jest.fn().mockResolvedValue(undefined) },
};

export const mockRedis = {
  provide: 'REDIS',
  useValue: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    sadd: jest.fn().mockResolvedValue(1),
    srem: jest.fn().mockResolvedValue(1),
    scard: jest.fn().mockResolvedValue(0),
    smembers: jest.fn().mockResolvedValue([]),
    hgetall: jest.fn().mockResolvedValue({}),
    hset: jest.fn().mockResolvedValue(1),
    hdel: jest.fn().mockResolvedValue(1),
    ping: jest.fn().mockResolvedValue('PONG'),
    pipeline: jest.fn().mockReturnValue({
      incrby: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      lpush: jest.fn().mockReturnThis(),
      ltrim: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    }),
    keys: jest.fn().mockResolvedValue([]),
    mget: jest.fn().mockResolvedValue([]),
    connect: jest.fn().mockResolvedValue(undefined),
  },
};

export const mockAsyncJobService = {
  provide: AsyncJobService,
  useValue: {
    enqueue: jest.fn(),
    getStats: jest.fn().mockReturnValue({ enqueued: 0, completed: 0, failed: 0, retried: 0 }),
  },
};

export const mockAnalyticsService = {
  provide: AnalyticsService,
  useValue: {
    track: jest.fn(),
    increment: jest.fn(),
    getCounter: jest.fn().mockResolvedValue(0),
    getCounters: jest.fn().mockResolvedValue({}),
  },
};

export const mockFeatureFlagsService = {
  provide: FeatureFlagsService,
  useValue: {
    isEnabled: jest.fn().mockResolvedValue(false),
    isEnabledForUser: jest.fn().mockResolvedValue(false),
    getAllFlags: jest.fn().mockResolvedValue({}),
    setFlag: jest.fn(),
    deleteFlag: jest.fn(),
  },
};

/** All global service mocks — add to providers array */
export const globalMockProviders = [
  mockPushTriggerService,
  mockRedis,
  mockAsyncJobService,
  mockAnalyticsService,
  mockFeatureFlagsService,
];
