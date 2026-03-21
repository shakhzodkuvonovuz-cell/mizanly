import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import { EmbeddingsService } from './embeddings.service';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('EmbeddingsService', () => {
  let service: EmbeddingsService;
  let prisma: any;

  beforeEach(async () => {
    mockFetch.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingsService,
        {
          provide: PrismaService,
          useValue: {
            post: { findUnique: jest.fn() },
            reel: { findUnique: jest.fn() },
            thread: { findUnique: jest.fn() },
            video: { findUnique: jest.fn() },
            feedInteraction: { findMany: jest.fn() },
            $executeRaw: jest.fn(),
            $queryRawUnsafe: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'GEMINI_API_KEY') return 'test-api-key';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<EmbeddingsService>(EmbeddingsService);
    prisma = module.get(PrismaService) as any;
  });

  describe('generateEmbedding', () => {
    it('should generate embedding for valid text', async () => {
      const fakeVector = Array(768).fill(0.1);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: { values: fakeVector } }),
      });

      const result = await service.generateEmbedding('test text');
      expect(result).toHaveLength(768);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should return null for empty text', async () => {
      const result = await service.generateEmbedding('');
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return null for whitespace-only text', async () => {
      const result = await service.generateEmbedding('   ');
      expect(result).toBeNull();
    });

    it('should return null on API error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' });

      const result = await service.generateEmbedding('test');
      expect(result).toBeNull();
    });

    it('should return null on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.generateEmbedding('test');
      expect(result).toBeNull();
    });

    it('should truncate text to 32000 chars', async () => {
      const longText = 'a'.repeat(50000);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: { values: Array(768).fill(0) } }),
      });

      await service.generateEmbedding(longText);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.content.parts[0].text.length).toBe(32000);
    });
  });

  describe('generateBatchEmbeddings', () => {
    it('should generate batch embeddings for multiple texts', async () => {
      const fakeVectors = [Array(768).fill(0.1), Array(768).fill(0.2)];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embeddings: fakeVectors.map(v => ({ values: v })) }),
      });

      const result = await service.generateBatchEmbeddings(['text1', 'text2']);
      expect(result).toHaveLength(2);
    });

    it('should return empty array for empty input', async () => {
      const result = await service.generateBatchEmbeddings([]);
      expect(result).toEqual([]);
    });

    it('should return null array on batch API error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });

      const result = await service.generateBatchEmbeddings(['a', 'b']);
      expect(result).toEqual([null, null]);
    });
  });

  describe('buildContentText', () => {
    it('should combine text, hashtags, location, and category', () => {
      const result = service.buildContentText({
        text: 'Hello world',
        hashtags: ['#islam', '#prayer'],
        locationName: 'Mecca',
        category: 'Islamic',
      });
      expect(result).toContain('Hello world');
      expect(result).toContain('#islam');
      expect(result).toContain('Mecca');
      expect(result).toContain('Islamic');
    });

    it('should handle empty content', () => {
      const result = service.buildContentText({});
      expect(result).toBe('');
    });
  });

  describe('embedPost', () => {
    it('should embed a post and store the vector', async () => {
      prisma.post.findUnique.mockResolvedValue({
        id: 'post-1', content: 'Test content', hashtags: ['test'], mentions: [], locationName: null,
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: { values: Array(768).fill(0.5) } }),
      });
      prisma.$executeRaw.mockResolvedValue(undefined);

      const result = await service.embedPost('post-1');
      expect(result).toBe(true);
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('should return false for non-existent post', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      const result = await service.embedPost('missing');
      expect(result).toBe(false);
    });
  });

  describe('findSimilar', () => {
    it('should return similar content from pgvector', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([
        { contentId: 'post-2', contentType: 'POST', similarity: 0.95 },
      ]);

      const result = await service.findSimilar('post-1', 'POST' as any);
      expect(result).toHaveLength(1);
      expect(result[0].similarity).toBe(0.95);
    });

    it('should return empty array when no similar content', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([]);
      const result = await service.findSimilar('post-1', 'POST' as any);
      expect(result).toEqual([]);
    });
  });

  describe('SQL injection prevention', () => {
    it('should strip invalid filterTypes in findSimilar', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      await service.findSimilar('p1', 'POST' as any, 10, [
        'POST' as any,
        "'; DROP TABLE embeddings; --" as any,
      ]);

      const sql = prisma.$queryRawUnsafe.mock.calls[0][0];
      expect(sql).toContain("'POST'");
      expect(sql).not.toContain('DROP TABLE');
    });

    it('should strip invalid excludeIds in findSimilarByVector', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      await service.findSimilarByVector(
        [0.1, 0.2],
        10,
        ['POST' as any],
        ['valid-id-123', "'; DROP TABLE --"],
      );

      const sql = prisma.$queryRawUnsafe.mock.calls[0][0];
      expect(sql).toContain("'valid-id-123'");
      expect(sql).not.toContain('DROP TABLE');
    });

    it('should accept all valid EmbeddingContentType values', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      await service.findSimilar('p1', 'POST' as any, 10, [
        'POST' as any, 'REEL' as any, 'THREAD' as any, 'VIDEO' as any,
      ]);

      const sql = prisma.$queryRawUnsafe.mock.calls[0][0];
      expect(sql).toContain("'POST'");
      expect(sql).toContain("'REEL'");
      expect(sql).toContain("'THREAD'");
      expect(sql).toContain("'VIDEO'");
    });

    it('should skip type filter when all types are invalid', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      await service.findSimilar('p1', 'POST' as any, 10, [
        'INVALID' as any, "'; DROP TABLE --" as any,
      ]);

      const sql = prisma.$queryRawUnsafe.mock.calls[0][0];
      expect(sql).not.toContain('IN (');
    });

    it('should skip excludeIds filter when all IDs are invalid', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      await service.findSimilarByVector(
        [0.1],
        10,
        undefined,
        ["'; DROP --", '<script>alert(1)</script>'],
      );

      const sql = prisma.$queryRawUnsafe.mock.calls[0][0];
      expect(sql).not.toContain('NOT IN');
    });
  });

  describe('getUserInterestVector', () => {
    it('should return null when user has no interactions', async () => {
      prisma.feedInteraction.findMany.mockResolvedValue([]);
      const result = await service.getUserInterestVector('user-1');
      expect(result).toBeNull();
    });

    it('should compute average vector from user interactions', async () => {
      prisma.feedInteraction.findMany.mockResolvedValue([
        { postId: 'p1' }, { postId: 'p2' },
      ]);
      prisma.$queryRawUnsafe.mockResolvedValue([{ avg_vector: '[0.1,0.2,0.3]' }]);

      const result = await service.getUserInterestVector('user-1');
      expect(result).toEqual([0.1, 0.2, 0.3]);
    });
  });
});
