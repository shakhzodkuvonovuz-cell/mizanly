import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import { AsyncJobService } from '../services/async-jobs.service';
import { AnalyticsService } from '../services/analytics.service';
import { FeatureFlagsService } from '../services/feature-flags.service';
import { PushTriggerService } from '../../modules/notifications/push-trigger.service';
import { PushService } from '../../modules/notifications/push.service';
import { NotificationsService } from '../../modules/notifications/notifications.service';
import { GamificationService } from '../../modules/gamification/gamification.service';
import { AiService } from '../../modules/ai/ai.service';
import { StreamService } from '../../modules/stream/stream.service';
import { QueueService } from '../queue/queue.service';
import { ContentSafetyService } from '../../modules/moderation/content-safety.service';

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
    moderateImage: jest.fn().mockResolvedValue({ classification: 'SAFE', reason: null, categories: [] }),
    isAvailable: jest.fn().mockReturnValue(true),
    suggestCaptions: jest.fn().mockResolvedValue([]),
    suggestHashtags: jest.fn().mockResolvedValue([]),
    translateText: jest.fn().mockResolvedValue({ translatedText: '' }),
    generateAltText: jest.fn().mockResolvedValue('Image'),
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
    incr: jest.fn().mockResolvedValue(1),
    incrby: jest.fn().mockResolvedValue(1),
    lpush: jest.fn().mockResolvedValue(1),
    ltrim: jest.fn().mockResolvedValue('OK'),
    expire: jest.fn().mockResolvedValue(1),
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
    publish: jest.fn().mockResolvedValue(1),
    pfadd: jest.fn().mockResolvedValue(1),
    pfcount: jest.fn().mockResolvedValue(0),
    duplicate: jest.fn().mockReturnValue({ subscribe: jest.fn().mockResolvedValue(undefined), on: jest.fn() }),
  },
};

export const mockAsyncJobService = {
  provide: AsyncJobService,
  useValue: {
    enqueue: jest.fn(),
    getStats: jest.fn().mockReturnValue({ enqueued: 0, completed: 0, failed: 0, retried: 0 }),
  },
};

export const mockQueueService = {
  provide: QueueService,
  useValue: {
    addPushNotificationJob: jest.fn().mockResolvedValue('job-1'),
    addGamificationJob: jest.fn().mockResolvedValue('job-4'),
    addWebhookDeliveryJob: jest.fn().mockResolvedValue('job-6'),
    addSearchIndexJob: jest.fn().mockResolvedValue('job-7'),
    addModerationJob: jest.fn().mockResolvedValue('job-8'),
    getStats: jest.fn().mockResolvedValue({}),
    moveToDlq: jest.fn().mockResolvedValue(undefined),
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

export const mockContentSafetyService = {
  provide: ContentSafetyService,
  useValue: {
    moderateText: jest.fn().mockResolvedValue({ safe: true, flags: [] }),
    moderateImage: jest.fn().mockResolvedValue({ safe: true, confidence: 1, flags: [], action: 'allow' }),
    checkForwardLimit: jest.fn().mockResolvedValue({ allowed: true, forwardCount: 0, maxForwards: 5 }),
    incrementForwardCount: jest.fn().mockResolvedValue(undefined),
    checkKindness: jest.fn().mockResolvedValue({ isAngry: false }),
    autoRemoveContent: jest.fn().mockResolvedValue(undefined),
    checkViralThrottle: jest.fn().mockResolvedValue({ throttled: false }),
    trackShare: jest.fn().mockResolvedValue(undefined),
  },
};

export const mockPrismaService = {
  provide: PrismaService,
  useValue: {
    user: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
  },
};

export const mockConfigService = {
  provide: ConfigService,
  useValue: {
    get: jest.fn().mockImplementation((key: string) => {
      const config: Record<string, string> = {
        CLERK_SECRET_KEY: 'test_secret_key',
        CLERK_PUBLISHABLE_KEY: 'test_pub_key',
        STRIPE_SECRET_KEY: 'sk_test_mock',
        STRIPE_WEBHOOK_SECRET: 'whsec_test_mock',
        MEILISEARCH_HOST: 'http://localhost:7700',
        MEILISEARCH_API_KEY: 'test_key',
      };
      return config[key] ?? null;
    }),
  },
};

/** All global service mocks — add to providers array */
export const globalMockProviders = [
  mockPrismaService,
  mockConfigService,
  mockRedis,
  mockPushTriggerService,
  mockPushService,
  mockNotificationsService,
  mockGamificationService,
  mockAiService,
  mockStreamService,
  mockAsyncJobService,
  mockQueueService,
  mockAnalyticsService,
  mockFeatureFlagsService,
  mockContentSafetyService,
];
