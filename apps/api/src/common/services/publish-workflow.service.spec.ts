import { Test, TestingModule } from '@nestjs/testing';
import { PublishWorkflowService } from './publish-workflow.service';
import { PrismaService } from '../../config/prisma.service';
import { QueueService } from '../queue/queue.service';

describe('PublishWorkflowService', () => {
  let service: PublishWorkflowService;
  let queueService: any;
  let redis: any;

  beforeEach(async () => {
    queueService = {
      addSearchIndexJob: jest.fn().mockResolvedValue('job-1'),
    };

    redis = {
      scan: jest.fn().mockResolvedValue(['0', []]),
      del: jest.fn().mockResolvedValue(1),
      publish: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublishWorkflowService,
        { provide: PrismaService, useValue: {} },
        { provide: QueueService, useValue: queueService },
        { provide: 'REDIS', useValue: redis },
      ],
    }).compile();

    service = module.get(PublishWorkflowService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── onPublish ──

  describe('onPublish', () => {
    it('should queue search index job when indexDocument provided', async () => {
      await service.onPublish({
        contentType: 'post',
        contentId: 'post-1',
        userId: 'user-1',
        indexDocument: { id: 'post-1', content: 'Hello' },
      });

      expect(queueService.addSearchIndexJob).toHaveBeenCalledWith({
        action: 'index',
        indexName: 'posts',
        documentId: 'post-1',
        document: { id: 'post-1', content: 'Hello' },
      });
    });

    it('should not queue search index when no indexDocument', async () => {
      await service.onPublish({
        contentType: 'post',
        contentId: 'post-1',
        userId: 'user-1',
      });

      expect(queueService.addSearchIndexJob).not.toHaveBeenCalled();
    });

    it('should invalidate feed caches via SCAN', async () => {
      redis.scan
        .mockResolvedValueOnce(['0', ['feed:foryou:user-1:1']]) // first pattern
        .mockResolvedValueOnce(['0', []]); // second pattern

      await service.onPublish({
        contentType: 'post',
        contentId: 'post-1',
        userId: 'user-1',
      });

      expect(redis.scan).toHaveBeenCalledTimes(2);
      expect(redis.del).toHaveBeenCalledWith('feed:foryou:user-1:1');
    });

    it('should publish content:update event via Redis pub/sub', async () => {
      await service.onPublish({
        contentType: 'thread',
        contentId: 'thread-1',
        userId: 'user-1',
      });

      expect(redis.publish).toHaveBeenCalledWith(
        'content:update',
        expect.stringContaining('content_published'),
      );
    });

    it('should handle SCAN with multiple pages', async () => {
      redis.scan
        .mockResolvedValueOnce(['42', ['feed:foryou:user-1:1']]) // cursor 42 = more pages
        .mockResolvedValueOnce(['0', ['feed:foryou:user-1:2']]) // cursor 0 = done
        .mockResolvedValueOnce(['0', []]); // second pattern

      await service.onPublish({
        contentType: 'post',
        contentId: 'post-1',
        userId: 'user-1',
      });

      expect(redis.del).toHaveBeenCalledTimes(2);
    });

    it('should not throw when Redis cache invalidation fails', async () => {
      redis.scan.mockRejectedValue(new Error('Redis down'));

      await expect(
        service.onPublish({
          contentType: 'post',
          contentId: 'post-1',
          userId: 'user-1',
        }),
      ).resolves.not.toThrow();
    });

    it('should not throw when search index job fails', async () => {
      queueService.addSearchIndexJob.mockRejectedValue(new Error('Queue down'));

      await expect(
        service.onPublish({
          contentType: 'post',
          contentId: 'post-1',
          userId: 'user-1',
          indexDocument: { id: 'post-1' },
        }),
      ).resolves.not.toThrow();
    });
  });

  // ── onUnpublish ──

  describe('onUnpublish', () => {
    it('should queue search deletion job', async () => {
      await service.onUnpublish({
        contentType: 'video',
        contentId: 'video-1',
        userId: 'user-1',
      });

      expect(queueService.addSearchIndexJob).toHaveBeenCalledWith({
        action: 'delete',
        indexName: 'videos',
        documentId: 'video-1',
      });
    });

    it('should publish content_removed event', async () => {
      await service.onUnpublish({
        contentType: 'reel',
        contentId: 'reel-1',
        userId: 'user-1',
      });

      expect(redis.publish).toHaveBeenCalledWith(
        'content:update',
        expect.stringContaining('content_removed'),
      );
    });

    it('should use correct index name for each content type', async () => {
      for (const ct of ['post', 'reel', 'thread', 'video', 'user'] as const) {
        queueService.addSearchIndexJob.mockClear();
        await service.onUnpublish({
          contentType: ct,
          contentId: 'id-1',
          userId: 'user-1',
        });
        expect(queueService.addSearchIndexJob).toHaveBeenCalledWith(
          expect.objectContaining({ indexName: `${ct}s` }),
        );
      }
    });

    it('should not throw when search deletion fails', async () => {
      queueService.addSearchIndexJob.mockRejectedValue(new Error('Queue error'));

      await expect(
        service.onUnpublish({
          contentType: 'post',
          contentId: 'post-1',
          userId: 'user-1',
        }),
      ).resolves.not.toThrow();
    });
  });
});
