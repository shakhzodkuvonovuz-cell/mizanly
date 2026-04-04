/* eslint-disable @typescript-eslint/no-var-requires */
jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
  init: jest.fn(),
  setTag: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { QueueService } from './queue.service';
import { CircuitBreakerService } from '../services/circuit-breaker.service';
import { PrismaService } from '../../config/prisma.service';

// Access the mocked Sentry after import
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Sentry = require('@sentry/node');

describe('QueueService', () => {
  let service: QueueService;
  let redis: any;
  let prisma: any;
  let circuitBreaker: any;

  const mockQueue = () => ({
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    close: jest.fn().mockResolvedValue(undefined),
    getWaitingCount: jest.fn().mockResolvedValue(5),
    getActiveCount: jest.fn().mockResolvedValue(2),
    getCompletedCount: jest.fn().mockResolvedValue(100),
    getFailedCount: jest.fn().mockResolvedValue(1),
    getDelayedCount: jest.fn().mockResolvedValue(0),
  });

  let notificationsQueue: any;
  let mediaQueue: any;
  let analyticsQueue: any;
  let webhooksQueue: any;
  let searchQueue: any;
  let aiTasksQueue: any;

  beforeEach(async () => {
    notificationsQueue = mockQueue();
    mediaQueue = mockQueue();
    analyticsQueue = mockQueue();
    webhooksQueue = mockQueue();
    searchQueue = mockQueue();
    aiTasksQueue = mockQueue();

    redis = {
      lpush: jest.fn().mockResolvedValue(1),
      ltrim: jest.fn().mockResolvedValue('OK'),
      expire: jest.fn().mockResolvedValue(1),
    };

    prisma = {
      failedJob: { create: jest.fn().mockResolvedValue({ id: 'fj-1' }) },
    };

    circuitBreaker = {
      exec: jest.fn().mockImplementation((_name: string, fn: () => Promise<unknown>) => fn()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        { provide: 'QUEUE_NOTIFICATIONS', useValue: notificationsQueue },
        { provide: 'QUEUE_MEDIA_PROCESSING', useValue: mediaQueue },
        { provide: 'QUEUE_ANALYTICS', useValue: analyticsQueue },
        { provide: 'QUEUE_WEBHOOKS', useValue: webhooksQueue },
        { provide: 'QUEUE_SEARCH_INDEXING', useValue: searchQueue },
        { provide: 'QUEUE_AI_TASKS', useValue: aiTasksQueue },
        { provide: 'REDIS', useValue: redis },
        { provide: CircuitBreakerService, useValue: circuitBreaker },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(QueueService);
    jest.clearAllMocks();
  });

  describe('addPushNotificationJob', () => {
    it('should enqueue push notification with dedup jobId', async () => {
      const jobId = await service.addPushNotificationJob({ notificationId: 'notif-abc' });
      expect(jobId).toBe('job-1');
      expect(notificationsQueue.add).toHaveBeenCalledWith(
        'push-trigger',
        expect.objectContaining({ notificationId: 'notif-abc' }),
        expect.objectContaining({ jobId: 'push:notif-abc' }),
      );
    });

    it('should use circuit breaker for Redis', async () => {
      await service.addPushNotificationJob({ notificationId: 'n1' });
      expect(circuitBreaker.exec).toHaveBeenCalledWith('redis', expect.any(Function));
    });
  });

  describe('addGamificationJob', () => {
    it('should enqueue award-xp job to analytics queue', async () => {
      await service.addGamificationJob({ type: 'award-xp', userId: 'u1', action: 'post_created' });
      expect(analyticsQueue.add).toHaveBeenCalledWith(
        'award-xp',
        expect.objectContaining({ userId: 'u1', action: 'post_created' }),
        expect.objectContaining({ attempts: 2 }),
      );
    });

    it('should enqueue update-streak job', async () => {
      await service.addGamificationJob({ type: 'update-streak', userId: 'u1', action: 'daily_login' });
      expect(analyticsQueue.add).toHaveBeenCalledWith('update-streak', expect.any(Object), expect.any(Object));
    });
  });

  describe('addSearchIndexJob', () => {
    it('should enqueue search index job with action as job name', async () => {
      await service.addSearchIndexJob({ action: 'index', indexName: 'posts', documentId: 'p1', document: { title: 'Test' } });
      expect(searchQueue.add).toHaveBeenCalledWith(
        'index',
        expect.objectContaining({ indexName: 'posts', documentId: 'p1' }),
        expect.any(Object),
      );
    });
  });

  describe('addModerationJob', () => {
    it('should enqueue moderation job to ai-tasks queue', async () => {
      await service.addModerationJob({ content: 'Test', contentType: 'post', contentId: 'p1' });
      expect(aiTasksQueue.add).toHaveBeenCalledWith(
        'moderate',
        expect.objectContaining({ content: 'Test', contentType: 'post' }),
        expect.any(Object),
      );
    });
  });

  describe('moveToDlq', () => {
    const makeJob = (attempts: number, maxAttempts: number) => ({
      id: 'job-42', name: 'push-trigger',
      data: { notificationId: 'n1' },
      attemptsMade: attempts, opts: { attempts: maxAttempts },
    } as any);

    it('should skip if job is undefined', async () => {
      await service.moveToDlq(undefined, new Error('fail'), 'notifications');
      expect(redis.lpush).not.toHaveBeenCalled();
    });

    it('should skip if not final attempt', async () => {
      await service.moveToDlq(makeJob(1, 3), new Error('fail'), 'notifications');
      expect(redis.lpush).not.toHaveBeenCalled();
    });

    it('should dual-write to Redis and DB on final attempt', async () => {
      await service.moveToDlq(makeJob(3, 3), new Error('push failed'), 'notifications');
      expect(redis.lpush).toHaveBeenCalledWith('mizanly:dlq', expect.stringContaining('push failed'));
      expect(redis.ltrim).toHaveBeenCalledWith('mizanly:dlq', 0, 999);
      expect(redis.expire).toHaveBeenCalledWith('mizanly:dlq', 604800);
      expect(prisma.failedJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ queue: 'notifications', jobName: 'push-trigger', error: 'push failed', attempts: 3 }),
      });
    });

    it('should strip sensitive fields from DLQ data', async () => {
      const job = { id: 'j99', name: 'deliver', data: { url: 'https://ex.com', secret: 'TOP', token: 'tkn' }, attemptsMade: 5, opts: { attempts: 5 } } as any;
      await service.moveToDlq(job, new Error('fail'), 'webhooks');
      const stored = JSON.parse(redis.lpush.mock.calls[0][1]);
      expect(stored.data.secret).toBeUndefined();
      expect(stored.data.token).toBeUndefined();
      expect(stored.data.url).toBe('https://ex.com');
    });

    it('should capture Sentry when both Redis and DB fail', async () => {
      redis.lpush.mockRejectedValue(new Error('Redis down'));
      prisma.failedJob.create.mockRejectedValue(new Error('DB down'));
      const error = new Error('original');
      await service.moveToDlq(makeJob(3, 3), error, 'notifications');
      expect(Sentry.captureException).toHaveBeenCalledWith(error, expect.objectContaining({
        tags: expect.objectContaining({ queue: 'notifications' }),
      }));
    });
  });

  describe('getStats', () => {
    it('should return stats for all 6 queues', async () => {
      const stats = await service.getStats();
      expect(Object.keys(stats)).toHaveLength(6);
      expect(stats['notifications']).toEqual({ waiting: 5, active: 2, completed: 100, failed: 1, delayed: 0 });
    });

    it('should return zeroed stats on per-queue error', async () => {
      notificationsQueue.getWaitingCount.mockRejectedValue(new Error('fail'));
      const stats = await service.getStats();
      expect(stats['notifications']).toEqual({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 });
      expect(stats['analytics'].waiting).toBe(5);
    });
  });

  describe('onModuleDestroy', () => {
    it('should close all 6 queues', async () => {
      await service.onModuleDestroy();
      expect(notificationsQueue.close).toHaveBeenCalled();
      expect(mediaQueue.close).toHaveBeenCalled();
      expect(analyticsQueue.close).toHaveBeenCalled();
      expect(webhooksQueue.close).toHaveBeenCalled();
      expect(searchQueue.close).toHaveBeenCalled();
      expect(aiTasksQueue.close).toHaveBeenCalled();
    });

    it('should not throw if a queue close fails', async () => {
      notificationsQueue.close.mockRejectedValue(new Error('close'));
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });
  });

  // T13 row 28: Circuit breaker failure path
  describe('circuit breaker failure', () => {
    it('should propagate error when circuit breaker rejects (Redis down)', async () => {
      circuitBreaker.exec.mockRejectedValue(new Error('Circuit open: redis'));
      await expect(service.addPushNotificationJob({ notificationId: 'n1' })).rejects.toThrow('Circuit open: redis');
    });
  });

  // T13 row 1: addWebhookDeliveryJob
  describe('addWebhookDeliveryJob', () => {
    it('should compute HMAC and enqueue without storing secret in Redis', async () => {
      const result = await service.addWebhookDeliveryJob({
        url: 'https://example.com/hook',
        secret: 'test-secret',
        event: 'post.created',
        payload: { id: 'p1' },
        webhookId: 'wh-1',
      });
      expect(result).toBe('job-1');
      expect(webhooksQueue.add).toHaveBeenCalledWith(
        'deliver',
        expect.objectContaining({
          url: 'https://example.com/hook',
          event: 'post.created',
          signature: expect.any(String),
          timestamp: expect.any(String),
        }),
        expect.any(Object),
      );
      // Secret should NOT be in the job data
      const jobData = webhooksQueue.add.mock.calls[0][1];
      expect(jobData.secret).toBeUndefined();
    });
  });

  describe('addMediaProcessingJob', () => {
    const mediaData = {
      mediaUrl: 'https://media.mizanly.app/posts/u1/abc.jpg',
      mediaKey: 'posts/u1/abc.jpg',
      userId: 'u1',
      contentType: 'post' as const,
      contentId: 'p1',
    };

    it('should enqueue image-resize job to media queue with dedup key', async () => {
      const result = await service.addMediaProcessingJob(mediaData);
      expect(result).toBe('job-1');
      expect(mediaQueue.add).toHaveBeenCalledWith(
        'image-resize',
        expect.objectContaining({
          type: 'image-resize',
          mediaUrl: 'https://media.mizanly.app/posts/u1/abc.jpg',
          mediaKey: 'posts/u1/abc.jpg',
          userId: 'u1',
          contentType: 'post',
          contentId: 'p1',
        }),
        expect.objectContaining({
          jobId: 'media:resize:posts/u1/abc.jpg',
          attempts: 3,
        }),
      );
    });

    it('should also enqueue blurhash job as a separate job', async () => {
      await service.addMediaProcessingJob(mediaData);
      // Should have been called twice: once for image-resize, once for blurhash
      expect(mediaQueue.add).toHaveBeenCalledTimes(2);
      expect(mediaQueue.add).toHaveBeenCalledWith(
        'blurhash',
        expect.objectContaining({
          type: 'blurhash',
          mediaKey: 'posts/u1/abc.jpg',
          contentId: 'p1',
        }),
        expect.objectContaining({
          jobId: 'media:blurhash:posts/u1/abc.jpg',
          attempts: 2,
        }),
      );
    });

    it('should use circuit breaker for Redis', async () => {
      await service.addMediaProcessingJob(mediaData);
      expect(circuitBreaker.exec).toHaveBeenCalledWith('redis', expect.any(Function));
    });

    it('should not throw if blurhash enqueue fails', async () => {
      // First call (image-resize) succeeds, second (blurhash) fails
      let callCount = 0;
      circuitBreaker.exec.mockImplementation((_name: string, fn: () => Promise<unknown>) => {
        callCount++;
        if (callCount === 2) return Promise.reject(new Error('Redis down'));
        return fn();
      });
      // Should not throw — blurhash failure is caught internally
      const result = await service.addMediaProcessingJob(mediaData);
      expect(result).toBe('job-1');
    });
  });
});
