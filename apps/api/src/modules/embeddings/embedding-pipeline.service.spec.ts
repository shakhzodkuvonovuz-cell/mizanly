import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { EmbeddingsService } from './embeddings.service';
import { EmbeddingPipelineService } from './embedding-pipeline.service';

describe('EmbeddingPipelineService', () => {
  let service: EmbeddingPipelineService;
  let prisma: any;
  let embeddings: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingPipelineService,
        {
          provide: PrismaService,
          useValue: {
            post: { findMany: jest.fn().mockResolvedValue([]) },
            reel: { findMany: jest.fn().mockResolvedValue([]) },
            thread: { findMany: jest.fn().mockResolvedValue([]) },
            video: { findMany: jest.fn().mockResolvedValue([]) },
            $queryRawUnsafe: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: EmbeddingsService,
          useValue: {
            embedPost: jest.fn().mockResolvedValue(true),
            embedReel: jest.fn().mockResolvedValue(true),
            embedThread: jest.fn().mockResolvedValue(true),
            embedVideo: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<EmbeddingPipelineService>(EmbeddingPipelineService);
    prisma = module.get(PrismaService) as any;
    embeddings = module.get(EmbeddingsService) as any;
  });

  describe('backfillAll', () => {
    it('should process all content types and return counts', async () => {
      prisma.post.findMany
        .mockResolvedValueOnce([{ id: 'p1' }])
        .mockResolvedValueOnce([]);
      prisma.reel.findMany.mockResolvedValue([]);
      prisma.thread.findMany.mockResolvedValue([]);
      prisma.video.findMany.mockResolvedValue([]);

      const result = await service.backfillAll();
      expect(result.posts).toBe(1);
      expect(result.reels).toBe(0);
    });

    it('should skip already-embedded content', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ contentId: 'p1' }]);
      prisma.post.findMany
        .mockResolvedValueOnce([{ id: 'p1' }])
        .mockResolvedValueOnce([]);
      prisma.reel.findMany.mockResolvedValue([]);
      prisma.thread.findMany.mockResolvedValue([]);
      prisma.video.findMany.mockResolvedValue([]);

      const result = await service.backfillAll();
      expect(result.posts).toBe(0);
      expect(embeddings.embedPost).not.toHaveBeenCalled();
    });

    it('should prevent concurrent runs', async () => {
      prisma.post.findMany.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve([]), 50)),
      );
      prisma.reel.findMany.mockResolvedValue([]);
      prisma.thread.findMany.mockResolvedValue([]);
      prisma.video.findMany.mockResolvedValue([]);

      const first = service.backfillAll();
      const second = await service.backfillAll();

      expect(second).toEqual({ posts: 0, reels: 0, threads: 0, videos: 0 });
      await first;
    });

    it('should handle embedding errors gracefully', async () => {
      prisma.post.findMany
        .mockResolvedValueOnce([{ id: 'p1' }])
        .mockResolvedValueOnce([]);
      prisma.reel.findMany.mockResolvedValue([]);
      prisma.thread.findMany.mockResolvedValue([]);
      prisma.video.findMany.mockResolvedValue([]);
      embeddings.embedPost.mockResolvedValue(false);

      const result = await service.backfillAll();
      expect(result.posts).toBe(0);
    });
  });

  describe('embedNewContent', () => {
    it('should embed a new post', async () => {
      const result = await service.embedNewContent('p1', 'POST' as any);
      expect(result).toBe(true);
      expect(embeddings.embedPost).toHaveBeenCalledWith('p1');
    });

    it('should embed a new reel', async () => {
      const result = await service.embedNewContent('r1', 'REEL' as any);
      expect(result).toBe(true);
      expect(embeddings.embedReel).toHaveBeenCalledWith('r1');
    });

    it('should embed a new thread', async () => {
      const result = await service.embedNewContent('t1', 'THREAD' as any);
      expect(result).toBe(true);
      expect(embeddings.embedThread).toHaveBeenCalledWith('t1');
    });

    it('should embed a new video', async () => {
      const result = await service.embedNewContent('v1', 'VIDEO' as any);
      expect(result).toBe(true);
      expect(embeddings.embedVideo).toHaveBeenCalledWith('v1');
    });

    it('should return false for unknown content type', async () => {
      const result = await service.embedNewContent('x1', 'UNKNOWN' as any);
      expect(result).toBe(false);
    });

    it('should return false when embedding fails', async () => {
      embeddings.embedPost.mockResolvedValue(false);
      const result = await service.embedNewContent('p1', 'POST' as any);
      expect(result).toBe(false);
    });
  });
});
