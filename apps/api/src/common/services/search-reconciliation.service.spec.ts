import { Test, TestingModule } from '@nestjs/testing';
import { SearchReconciliationService } from './search-reconciliation.service';
import { PrismaService } from '../../config/prisma.service';
import { QueueService } from '../queue/queue.service';

// Mock Sentry
jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
}));

// Mock cron-lock to always acquire
jest.mock('../utils/cron-lock', () => ({
  acquireCronLock: jest.fn().mockResolvedValue(true),
}));

describe('SearchReconciliationService', () => {
  let service: SearchReconciliationService;
  let prisma: any;
  let queueService: any;

  beforeEach(async () => {
    prisma = {
      post: { findMany: jest.fn().mockResolvedValue([]) },
      thread: { findMany: jest.fn().mockResolvedValue([]) },
      reel: { findMany: jest.fn().mockResolvedValue([]) },
      video: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      hashtag: { findMany: jest.fn().mockResolvedValue([]) },
    };

    queueService = {
      addSearchIndexJob: jest.fn().mockResolvedValue('job-1'),
    };

    const redis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchReconciliationService,
        { provide: PrismaService, useValue: prisma },
        { provide: QueueService, useValue: queueService },
        { provide: 'REDIS', useValue: redis },
      ],
    }).compile();

    service = module.get(SearchReconciliationService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('reconcileSearchIndex', () => {
    it('should return {indexed:0, deleted:0} when no recent content', async () => {
      const result = await service.reconcileSearchIndex();
      expect(result).toEqual({ indexed: 0, deleted: 0 });
    });

    it('should re-index recent posts', async () => {
      prisma.post.findMany
        .mockResolvedValueOnce([{ id: 'p1', content: 'Hello', hashtags: ['test'], userId: 'u1' }]) // recent active
        .mockResolvedValueOnce([]); // removed

      const result = await service.reconcileSearchIndex();
      expect(result.indexed).toBeGreaterThanOrEqual(1);
      expect(queueService.addSearchIndexJob).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'index', indexName: 'posts', documentId: 'p1' }),
      );
    });

    it('should delete removed posts from index', async () => {
      prisma.post.findMany
        .mockResolvedValueOnce([]) // no recent active
        .mockResolvedValueOnce([{ id: 'p-removed' }]); // removed posts

      const result = await service.reconcileSearchIndex();
      expect(result.deleted).toBeGreaterThanOrEqual(1);
      expect(queueService.addSearchIndexJob).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'delete', indexName: 'posts', documentId: 'p-removed' }),
      );
    });

    it('should re-index recent threads', async () => {
      prisma.thread.findMany
        .mockResolvedValueOnce([{ id: 't1', content: 'Thread', hashtags: [], userId: 'u1' }])
        .mockResolvedValueOnce([]); // no removed

      const result = await service.reconcileSearchIndex();
      expect(result.indexed).toBeGreaterThanOrEqual(1);
      expect(queueService.addSearchIndexJob).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'index', indexName: 'threads', documentId: 't1' }),
      );
    });

    it('should re-index recent reels', async () => {
      prisma.reel.findMany
        .mockResolvedValueOnce([{ id: 'r1', caption: 'Reel', hashtags: ['fun'], userId: 'u1' }])
        .mockResolvedValueOnce([]); // no removed

      const result = await service.reconcileSearchIndex();
      expect(result.indexed).toBeGreaterThanOrEqual(1);
    });

    it('should re-index recent videos and users', async () => {
      prisma.video.findMany
        .mockResolvedValueOnce([{ id: 'v1', title: 'V', description: 'D', tags: [], userId: 'u1', channelId: 'ch1', category: 'EDU' }])
        .mockResolvedValueOnce([]); // no removed
      prisma.user.findMany
        .mockResolvedValueOnce([{ id: 'u1', username: 'alice', displayName: 'Alice', bio: 'Hi' }])
        .mockResolvedValueOnce([]); // no removed

      const result = await service.reconcileSearchIndex();
      expect(result.indexed).toBeGreaterThanOrEqual(2);
    });

    it('should remove banned/deleted users from index', async () => {
      prisma.user.findMany
        .mockResolvedValueOnce([]) // no recent active
        .mockResolvedValueOnce([{ id: 'u-banned' }]); // removed users

      const result = await service.reconcileSearchIndex();
      expect(result.deleted).toBeGreaterThanOrEqual(1);
      expect(queueService.addSearchIndexJob).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'delete', indexName: 'users', documentId: 'u-banned' }),
      );
    });

    it('should re-index recent hashtags', async () => {
      prisma.hashtag.findMany.mockResolvedValue([{ id: 'h1', name: 'ramadan' }]);

      const result = await service.reconcileSearchIndex();
      expect(result.indexed).toBeGreaterThanOrEqual(1);
    });

    it('should handle queue job failures gracefully (catch per item)', async () => {
      prisma.post.findMany
        .mockResolvedValueOnce([{ id: 'p1', content: 'X', hashtags: [], userId: 'u1' }])
        .mockResolvedValueOnce([]);
      queueService.addSearchIndexJob.mockRejectedValue(new Error('Queue full'));

      // Should not throw
      const result = await service.reconcileSearchIndex();
      expect(result.indexed).toBeGreaterThanOrEqual(1); // Counted even if job fails
    });

    it('should capture exception on total failure', async () => {
      const Sentry = require('@sentry/node');
      const { acquireCronLock } = require('../utils/cron-lock');
      acquireCronLock.mockResolvedValue(true);
      prisma.post.findMany.mockRejectedValue(new Error('DB down'));

      const result = await service.reconcileSearchIndex();
      expect(result).toEqual({ indexed: 0, deleted: 0 });
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });
});
