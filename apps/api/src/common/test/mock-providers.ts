import { AsyncJobService } from '../services/async-jobs.service';
import { AnalyticsService } from '../services/analytics.service';
import { FeatureFlagsService } from '../services/feature-flags.service';
import { PushTriggerService } from '../../modules/notifications/push-trigger.service';
import { PushService } from '../../modules/notifications/push.service';
import { NotificationsService } from '../../modules/notifications/notifications.service';
import { GamificationService } from '../../modules/gamification/gamification.service';
import { AiService } from '../../modules/ai/ai.service';
import { StreamService } from '../../modules/stream/stream.service';

/**
 * Shared mock providers for test modules.
 * Add these to any test module that needs the global services.
 */

export const mockPushTriggerService = {
  provide: PushTriggerService,
  useValue: { triggerPush: jest.fn().mockResolvedValue(undefined) },
};

export const mockPushService = {
  provide: PushService,
  useValue: { sendPush: jest.fn().mockResolvedValue(undefined) },
};

export const mockNotificationsService = {
  provide: NotificationsService,
  useValue: {
    create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    getNotifications: jest.fn().mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } }),
    markRead: jest.fn().mockResolvedValue({ read: true }),
    markAllRead: jest.fn().mockResolvedValue({ read: true }),
    getUnreadCount: jest.fn().mockResolvedValue(0),
  },
};

export const mockGamificationService = {
  provide: GamificationService,
  useValue: {
    awardXP: jest.fn().mockResolvedValue({ totalXP: 100, level: 1 }),
    updateStreak: jest.fn().mockResolvedValue({ currentDays: 1 }),
    getXP: jest.fn().mockResolvedValue({ totalXP: 0, level: 1 }),
    getStreaks: jest.fn().mockResolvedValue([]),
  },
};

export const mockAiService = {
  provide: AiService,
  useValue: {
    moderateContent: jest.fn().mockResolvedValue({ safe: true, flags: [], confidence: 0 }),
    suggestCaptions: jest.fn().mockResolvedValue([]),
    suggestHashtags: jest.fn().mockResolvedValue([]),
    translateText: jest.fn().mockResolvedValue({ translatedText: '' }),
  },
};

export const mockStreamService = {
  provide: StreamService,
  useValue: {
    uploadVideo: jest.fn().mockResolvedValue({ uid: 'stream-1', playback: { hls: 'hls-url' } }),
  },
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
  mockRedis,
  mockPushTriggerService,
  mockPushService,
  mockNotificationsService,
  mockGamificationService,
  mockAiService,
  mockStreamService,
  mockAsyncJobService,
  mockAnalyticsService,
  mockFeatureFlagsService,
];
