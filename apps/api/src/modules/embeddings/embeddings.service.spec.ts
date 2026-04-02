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

  describe('getUserInterestVector — multi-cluster', () => {
    it('should return null when user has no interactions', async () => {
      prisma.feedInteraction.findMany.mockResolvedValue([]);
      const result = await service.getUserInterestVector('user-1');
      expect(result).toBeNull();
    });

    it('should return single centroid for < 5 vectors', async () => {
      prisma.feedInteraction.findMany.mockResolvedValue([
        { postId: 'p1' }, { postId: 'p2' },
      ]);
      prisma.$queryRawUnsafe.mockResolvedValue([
        { vector_text: '[0.1,0.2,0.3]' },
        { vector_text: '[0.3,0.4,0.5]' },
      ]);

      const result = await service.getUserInterestVector('user-1');
      expect(result).not.toBeNull();
      expect(result).toHaveLength(1); // single centroid
      expect(result![0]).toHaveLength(3); // 3-dimensional vector
      // Average of [0.1,0.2,0.3] and [0.3,0.4,0.5] = [0.2,0.3,0.4]
      expect(result![0][0]).toBeCloseTo(0.2);
      expect(result![0][1]).toBeCloseTo(0.3);
      expect(result![0][2]).toBeCloseTo(0.4);
    });

    it('should cluster into multiple centroids for >= 5 vectors', async () => {
      const interactions = Array.from({ length: 10 }, (_, i) => ({ postId: `p${i}` }));
      prisma.feedInteraction.findMany.mockResolvedValue(interactions);

      // Two distinct clusters: first 5 near [1,0,0], last 5 near [0,1,0]
      const vectors = [
        ...Array(5).fill(null).map(() => ({ vector_text: '[0.9,0.1,0.0]' })),
        ...Array(5).fill(null).map(() => ({ vector_text: '[0.1,0.9,0.0]' })),
      ];
      prisma.$queryRawUnsafe.mockResolvedValue(vectors);

      const result = await service.getUserInterestVector('user-1');
      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThanOrEqual(2);
      // Each centroid should be a valid vector
      for (const centroid of result!) {
        expect(centroid.length).toBe(3);
      }
    });

    it('should return null when pgvector returns no rows', async () => {
      prisma.feedInteraction.findMany.mockResolvedValue([{ postId: 'p1' }]);
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      const result = await service.getUserInterestVector('user-1');
      expect(result).toBeNull();
    });

    it('should return null when all vector_text values are null', async () => {
      prisma.feedInteraction.findMany.mockResolvedValue([{ postId: 'p1' }]);
      prisma.$queryRawUnsafe.mockResolvedValue([{ vector_text: null }]);

      const result = await service.getUserInterestVector('user-1');
      expect(result).toBeNull();
    });

    it('should handle NaN values in individual vectors by replacing with 0', async () => {
      prisma.feedInteraction.findMany.mockResolvedValue([{ postId: 'p1' }]);
      prisma.$queryRawUnsafe.mockResolvedValue([{ vector_text: '[0.1,NaN,0.3]' }]);

      const result = await service.getUserInterestVector('user-1');
      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0]).toEqual([0.1, 0, 0.3]);
    });

    it('should respect k = min(3, ceil(count/5)) for centroid count', async () => {
      // 15 vectors → k = min(3, ceil(15/5)) = 3
      const interactions = Array.from({ length: 15 }, (_, i) => ({ postId: `p${i}` }));
      prisma.feedInteraction.findMany.mockResolvedValue(interactions);

      const vectors = Array.from({ length: 15 }, (_, i) => ({
        vector_text: `[${i * 0.1},${1 - i * 0.1},0.5]`,
      }));
      prisma.$queryRawUnsafe.mockResolvedValue(vectors);

      const result = await service.getUserInterestVector('user-1');
      expect(result).not.toBeNull();
      // Should have at most 3 centroids
      expect(result!.length).toBeLessThanOrEqual(3);
      expect(result!.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('error paths — generateEmbedding', () => {
    it('should return null when API response has malformed JSON', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new SyntaxError('Unexpected token'); },
      });

      const result = await service.generateEmbedding('test text');
      expect(result).toBeNull();
    });

    it('should return null on 429 rate limit error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests' });

      const result = await service.generateEmbedding('test');
      expect(result).toBeNull();
    });

    it('should return null on timeout / AbortError', async () => {
      mockFetch.mockRejectedValueOnce(new DOMException('The operation was aborted', 'AbortError'));

      const result = await service.generateEmbedding('test');
      expect(result).toBeNull();
    });
  });

  describe('error paths — embedPost', () => {
    it('should return false when post content yields empty text', async () => {
      prisma.post.findUnique.mockResolvedValue({
        id: 'post-empty', content: null, hashtags: [], mentions: [], locationName: null,
      });

      const result = await service.embedPost('post-empty');
      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return false when embedding generation fails', async () => {
      prisma.post.findUnique.mockResolvedValue({
        id: 'post-fail', content: 'Valid content', hashtags: ['test'], mentions: [], locationName: null,
      });
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.embedPost('post-fail');
      expect(result).toBe(false);
    });
  });

  describe('error paths — findSimilar', () => {
    it('should return empty array when pgvector query returns no rows', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      const result = await service.findSimilar('nonexistent-id', 'POST' as any);
      expect(result).toEqual([]);
    });

    it('should handle pgvector query failure gracefully', async () => {
      prisma.$queryRawUnsafe.mockRejectedValue(new Error('pgvector extension not installed'));

      await expect(service.findSimilar('p1', 'POST' as any)).rejects.toThrow('pgvector extension not installed');
    });
  });

  describe('error paths — findSimilarByVector', () => {
    it('should return empty array when no similar vectors found', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      const result = await service.findSimilarByVector([0.1, 0.2, 0.3], 10);
      expect(result).toEqual([]);
    });

    it('should handle pgvector query failure in findSimilarByVector', async () => {
      prisma.$queryRawUnsafe.mockRejectedValue(new Error('connection timeout'));

      await expect(service.findSimilarByVector([0.1], 5)).rejects.toThrow('connection timeout');
    });
  });

  describe('error paths — getUserInterestVector', () => {
    it('should return null when pgvector returns null vector_text', async () => {
      prisma.feedInteraction.findMany.mockResolvedValue([{ postId: 'p1' }]);
      prisma.$queryRawUnsafe.mockResolvedValue([{ vector_text: null }]);

      const result = await service.getUserInterestVector('user-1');
      expect(result).toBeNull();
    });

    it('should return null when pgvector returns empty result', async () => {
      prisma.feedInteraction.findMany.mockResolvedValue([{ postId: 'p1' }]);
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      const result = await service.getUserInterestVector('user-1');
      expect(result).toBeNull();
    });

    it('should replace NaN values with 0 in parsed vectors', async () => {
      prisma.feedInteraction.findMany.mockResolvedValue([{ postId: 'p1' }]);
      prisma.$queryRawUnsafe.mockResolvedValue([{ vector_text: '[0.1,NaN,0.3]' }]);

      const result = await service.getUserInterestVector('user-1');
      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0]).toEqual([0.1, 0, 0.3]);
    });
  });

  describe('error paths — generateBatchEmbeddings', () => {
    it('should return null array on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('DNS resolution failed'));

      const result = await service.generateBatchEmbeddings(['text1', 'text2', 'text3']);
      expect(result).toEqual([null, null, null]);
    });
  });

  describe('buildContentText edge cases', () => {
    it('should handle text with only whitespace', () => {
      const result = service.buildContentText({ text: '   ' });
      expect(result).toBe('');
    });

    it('should combine all fields when present', () => {
      const result = service.buildContentText({
        text: 'Main text',
        hashtags: ['#tag1', '#tag2'],
        mentions: ['@user1'],
        locationName: 'Dubai',
        category: 'Travel',
      });
      expect(result).toContain('Main text');
      expect(result).toContain('#tag1');
      expect(result).toContain('#tag2');
      expect(result).toContain('Dubai');
      expect(result).toContain('Travel');
    });
  });

  // ── Clustering helpers ──────────────────────────────────────────

  describe('cosineDistance', () => {
    it('should return 0 for identical vectors', () => {
      const dist = service.cosineDistance([1, 0, 0], [1, 0, 0]);
      expect(dist).toBeCloseTo(0, 5);
    });

    it('should return ~1 for orthogonal vectors', () => {
      const dist = service.cosineDistance([1, 0, 0], [0, 1, 0]);
      expect(dist).toBeCloseTo(1, 5);
    });

    it('should return ~2 for opposite vectors', () => {
      const dist = service.cosineDistance([1, 0, 0], [-1, 0, 0]);
      expect(dist).toBeCloseTo(2, 5);
    });

    it('should return 1.0 for zero-magnitude vectors', () => {
      expect(service.cosineDistance([0, 0, 0], [1, 0, 0])).toBe(1.0);
      expect(service.cosineDistance([1, 0, 0], [0, 0, 0])).toBe(1.0);
      expect(service.cosineDistance([0, 0, 0], [0, 0, 0])).toBe(1.0);
    });

    it('should return 1.0 for mismatched dimensions', () => {
      expect(service.cosineDistance([1, 0], [1, 0, 0])).toBe(1.0);
    });

    it('should return 1.0 for empty vectors', () => {
      expect(service.cosineDistance([], [])).toBe(1.0);
    });

    it('should handle similar but not identical vectors', () => {
      const dist = service.cosineDistance([0.9, 0.1, 0.0], [0.85, 0.15, 0.0]);
      expect(dist).toBeGreaterThan(0);
      expect(dist).toBeLessThan(0.1); // very similar
    });
  });

  describe('averageVectors', () => {
    it('should return empty array for no vectors', () => {
      expect(service.averageVectors([])).toEqual([]);
    });

    it('should return copy of single vector', () => {
      const result = service.averageVectors([[1, 2, 3]]);
      expect(result).toEqual([1, 2, 3]);
    });

    it('should average two vectors element-wise', () => {
      const result = service.averageVectors([[0, 0, 0], [2, 4, 6]]);
      expect(result).toEqual([1, 2, 3]);
    });

    it('should average multiple vectors', () => {
      const result = service.averageVectors([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
      expect(result[0]).toBeCloseTo(1 / 3);
      expect(result[1]).toBeCloseTo(1 / 3);
      expect(result[2]).toBeCloseTo(1 / 3);
    });

    it('should not modify original vector (return copy for single)', () => {
      const original = [1, 2, 3];
      const result = service.averageVectors([original]);
      result[0] = 999;
      expect(original[0]).toBe(1);
    });
  });

  describe('kMeansClustering', () => {
    it('should return empty array for k=0', () => {
      expect(service.kMeansClustering([[1, 0]], 0)).toEqual([]);
    });

    it('should return empty array for empty vectors', () => {
      expect(service.kMeansClustering([], 3)).toEqual([]);
    });

    it('should return individual vectors when k >= vector count', () => {
      const vectors = [[1, 0], [0, 1]];
      const clusters = service.kMeansClustering(vectors, 5);
      expect(clusters).toHaveLength(2);
      expect(clusters[0]).toEqual([[1, 0]]);
      expect(clusters[1]).toEqual([[0, 1]]);
    });

    it('should cluster two distinct groups correctly', () => {
      const groupA = [[0.9, 0.1], [0.85, 0.15], [0.95, 0.05]];
      const groupB = [[0.1, 0.9], [0.15, 0.85], [0.05, 0.95]];
      const vectors = [...groupA, ...groupB];

      const clusters = service.kMeansClustering(vectors, 2);
      expect(clusters).toHaveLength(2);

      // Each cluster should have 3 members
      expect(clusters[0].length + clusters[1].length).toBe(6);

      // Members of each cluster should be similar to each other
      // (i.e., groupA members in one cluster, groupB in another)
      const cluster0First = clusters[0][0][0]; // first dimension of first vector
      if (cluster0First > 0.5) {
        // cluster 0 is group A
        expect(clusters[0]).toHaveLength(3);
        expect(clusters[1]).toHaveLength(3);
      } else {
        // cluster 0 is group B
        expect(clusters[0]).toHaveLength(3);
        expect(clusters[1]).toHaveLength(3);
      }
    });

    it('should converge within maxIterations', () => {
      const vectors = [[1, 0], [0.9, 0.1], [0, 1], [0.1, 0.9]];
      // Should not throw with very low maxIterations
      const clusters = service.kMeansClustering(vectors, 2, 1);
      expect(clusters).toHaveLength(2);
      // All vectors accounted for
      const totalVectors = clusters.reduce((sum, c) => sum + c.length, 0);
      expect(totalVectors).toBe(4);
    });

    it('should handle k=1 (single cluster)', () => {
      const vectors = [[1, 0], [0, 1], [0.5, 0.5]];
      const clusters = service.kMeansClustering(vectors, 1);
      expect(clusters).toHaveLength(1);
      expect(clusters[0]).toHaveLength(3);
    });
  });

  describe('findSimilarByMultipleVectors', () => {
    it('should return empty array for empty vectors', async () => {
      const result = await service.findSimilarByMultipleVectors([], 10);
      expect(result).toEqual([]);
    });

    it('should delegate to findSimilarByVector for single centroid', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([
        { contentId: 'p1', contentType: 'POST', similarity: 0.9 },
      ]);

      const result = await service.findSimilarByMultipleVectors([[0.1, 0.2]], 10);
      expect(result).toHaveLength(1);
      expect(result[0].contentId).toBe('p1');
      // Should call $queryRawUnsafe exactly once (single centroid path)
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    });

    it('should merge and deduplicate results from multiple centroids', async () => {
      // First centroid returns p1 + p2, second returns p2 + p3
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          { contentId: 'p1', contentType: 'POST', similarity: 0.9 },
          { contentId: 'p2', contentType: 'POST', similarity: 0.7 },
        ])
        .mockResolvedValueOnce([
          { contentId: 'p2', contentType: 'POST', similarity: 0.8 }, // higher similarity for p2
          { contentId: 'p3', contentType: 'POST', similarity: 0.6 },
        ]);

      const result = await service.findSimilarByMultipleVectors(
        [[0.1, 0.2], [0.3, 0.4]],
        10,
      );

      // Should have 3 unique content IDs
      expect(result).toHaveLength(3);
      const ids = result.map(r => r.contentId);
      expect(ids).toContain('p1');
      expect(ids).toContain('p2');
      expect(ids).toContain('p3');

      // p2 should keep the higher similarity (0.8, not 0.7)
      const p2 = result.find(r => r.contentId === 'p2');
      expect(p2!.similarity).toBe(0.8);
    });

    it('should respect limit after merging', async () => {
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          { contentId: 'p1', contentType: 'POST', similarity: 0.9 },
          { contentId: 'p2', contentType: 'POST', similarity: 0.8 },
        ])
        .mockResolvedValueOnce([
          { contentId: 'p3', contentType: 'POST', similarity: 0.7 },
          { contentId: 'p4', contentType: 'POST', similarity: 0.6 },
        ]);

      const result = await service.findSimilarByMultipleVectors(
        [[0.1], [0.2]],
        2, // limit to 2
      );

      expect(result).toHaveLength(2);
      // Should return the highest-similarity items
      expect(result[0].contentId).toBe('p1');
      expect(result[1].contentId).toBe('p2');
    });

    it('should sort merged results by similarity descending', async () => {
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          { contentId: 'p1', contentType: 'POST', similarity: 0.5 },
        ])
        .mockResolvedValueOnce([
          { contentId: 'p2', contentType: 'POST', similarity: 0.9 },
        ]);

      const result = await service.findSimilarByMultipleVectors(
        [[0.1], [0.2]],
        10,
      );

      expect(result[0].contentId).toBe('p2'); // 0.9 first
      expect(result[1].contentId).toBe('p1'); // 0.5 second
    });

    it('should pass filterTypes and excludeIds to each centroid query', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      await service.findSimilarByMultipleVectors(
        [[0.1], [0.2]],
        10,
        ['POST' as any],
        ['excluded-1'],
      );

      // Two queries (one per centroid)
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
      // Both queries should contain POST filter and excluded-1
      for (let i = 0; i < 2; i++) {
        const sql = prisma.$queryRawUnsafe.mock.calls[i][0];
        expect(sql).toContain("'POST'");
        expect(sql).toContain("'excluded-1'");
      }
    });
  });

  // ═══ T10 Audit: Missing embeddings coverage #10-14 ═══

  describe('embedReel — #10 M', () => {
    it('should embed a reel using caption + hashtags + audioTitle', async () => {
      prisma.reel.findUnique.mockResolvedValue({
        id: 'reel-1', caption: 'Beautiful recitation', hashtags: ['quran'], mentions: [], audioTitle: 'Al-Fatiha',
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: { values: Array(768).fill(0.3) } }),
      });
      prisma.$executeRaw.mockResolvedValue(undefined);

      const result = await service.embedReel('reel-1');
      expect(result).toBe(true);
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('should return false for non-existent reel', async () => {
      prisma.reel.findUnique.mockResolvedValue(null);
      const result = await service.embedReel('missing');
      expect(result).toBe(false);
    });

    it('should return false when caption is empty', async () => {
      prisma.reel.findUnique.mockResolvedValue({
        id: 'reel-2', caption: '', hashtags: [], mentions: [], audioTitle: null,
      });
      const result = await service.embedReel('reel-2');
      expect(result).toBe(false);
    });
  });

  describe('embedThread — #11 M', () => {
    it('should embed a thread using content + hashtags', async () => {
      prisma.thread.findUnique.mockResolvedValue({
        id: 'thread-1', content: 'Important discussion', hashtags: ['ummah'], mentions: [],
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: { values: Array(768).fill(0.4) } }),
      });
      prisma.$executeRaw.mockResolvedValue(undefined);

      const result = await service.embedThread('thread-1');
      expect(result).toBe(true);
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('should return false for non-existent thread', async () => {
      prisma.thread.findUnique.mockResolvedValue(null);
      const result = await service.embedThread('missing');
      expect(result).toBe(false);
    });
  });

  describe('embedVideo — #12 M', () => {
    it('should embed a video using title + description + tags + category', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: 'video-1', title: 'Ramadan Lecture', description: 'Full lecture on fasting', tags: ['ramadan'], category: 'Education',
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: { values: Array(768).fill(0.5) } }),
      });
      prisma.$executeRaw.mockResolvedValue(undefined);

      const result = await service.embedVideo('video-1');
      expect(result).toBe(true);
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('should return false for non-existent video', async () => {
      prisma.video.findUnique.mockResolvedValue(null);
      const result = await service.embedVideo('missing');
      expect(result).toBe(false);
    });

    it('should build text from title + description (different from post)', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: 'video-2', title: 'Hajj Guide', description: 'Step by step', tags: [], category: null,
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: { values: Array(768).fill(0.1) } }),
      });
      prisma.$executeRaw.mockResolvedValue(undefined);

      await service.embedVideo('video-2');
      const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(fetchBody.content.parts[0].text).toContain('Hajj Guide');
      expect(fetchBody.content.parts[0].text).toContain('Step by step');
    });
  });

  describe('generateEmbedding — API unavailable — #13 L', () => {
    it('should return null when API key is not set', async () => {
      // Create service without API key
      const module2 = await Test.createTestingModule({
        providers: [
          EmbeddingsService,
          { provide: PrismaService, useValue: prisma },
          { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(null) } },
        ],
      }).compile();
      const svcNoKey = module2.get<EmbeddingsService>(EmbeddingsService);

      const result = await svcNoKey.generateEmbedding('test text');
      expect(result).toBeNull();
      // Should NOT call fetch when API unavailable
    });
  });

  describe('storeEmbedding — error path — #14 L', () => {
    it('should propagate $executeRaw errors', async () => {
      prisma.$executeRaw.mockRejectedValue(new Error('vector dimension mismatch'));
      await expect(
        service.storeEmbedding('content-1', 'POST' as any, [0.1, 0.2]),
      ).rejects.toThrow('vector dimension mismatch');
    });
  });
});
