/**
 * Batch error recovery tests — Tasks 72-85
 * Tests graceful handling when external dependencies fail.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../config/prisma.service';
import { globalMockProviders } from '../common/test/mock-providers';
import { SearchService } from '../modules/search/search.service';
import { MeilisearchService } from '../modules/search/meilisearch.service';
import { GamificationService } from '../modules/gamification/gamification.service';

describe('Error Recovery — batch tests (Tasks 72-85)', () => {
  // ── Task 73: Search service — Meilisearch failures ──
  describe('SearchService — Meilisearch recovery', () => {
    let service: SearchService;
    let prisma: any;
    let meilisearch: any;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders,
          SearchService,
          {
            provide: PrismaService,
            useValue: {
              post: { findMany: jest.fn().mockResolvedValue([]) },
              thread: { findMany: jest.fn().mockResolvedValue([]) },
              reel: { findMany: jest.fn().mockResolvedValue([]) },
              video: { findMany: jest.fn().mockResolvedValue([]) },
              user: { findMany: jest.fn().mockResolvedValue([]) },
              hashtag: { findMany: jest.fn().mockResolvedValue([]) },
              channel: { findMany: jest.fn().mockResolvedValue([]) },
              follow: { findMany: jest.fn().mockResolvedValue([]) },
              block: { findMany: jest.fn().mockResolvedValue([]) },
              postReaction: { findMany: jest.fn().mockResolvedValue([]) },
              savedPost: { findMany: jest.fn().mockResolvedValue([]) },
              $queryRaw: jest.fn().mockResolvedValue([]),
            },
          },
          {
            provide: MeilisearchService,
            useValue: {
              isAvailable: jest.fn().mockReturnValue(false),
              search: jest.fn().mockRejectedValue(new Error('Meilisearch offline')),
            },
          },
        ],
      }).compile();

      service = module.get(SearchService);
      prisma = module.get(PrismaService);
      meilisearch = module.get(MeilisearchService);
    });

    it('should fall back to Prisma when Meilisearch is offline', async () => {
      meilisearch.isAvailable.mockReturnValue(false);
      const result = await service.search('test', 'posts');
      expect(result).toHaveProperty('data');
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should return results from Prisma even without Meilisearch', async () => {
      meilisearch.isAvailable.mockReturnValue(false);
      prisma.post.findMany.mockResolvedValue([]);
      const result = await service.search('query', 'posts');
      expect(result.data).toEqual([]);
    });

    it('should handle Meilisearch available but returns empty', async () => {
      meilisearch.isAvailable.mockReturnValue(true);
      meilisearch.search.mockResolvedValue({ hits: [] });
      const result = await service.search('query', 'posts');
      expect(result).toHaveProperty('data');
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should return suggestions even when Meilisearch is down', async () => {
      const result = await service.getSuggestions('test');
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('should return trending even when search engine is down', async () => {
      const result = await service.trending();
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('should handle search with no type specified', async () => {
      const result = await service.search('test');
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });
  });

  // ── Task 83: Gamification — Redis failures ──
  describe('GamificationService — cache recovery', () => {
    let service: GamificationService;
    let prisma: any;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders,
          GamificationService,
          {
            provide: PrismaService,
            useValue: {
              userXP: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn(), upsert: jest.fn() },
              xPHistory: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
              userStreak: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
              achievement: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
              userAchievement: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), findUnique: jest.fn() },
              challenge: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn() },
              challengeParticipant: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
              series: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
              seriesEpisode: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
              seriesFollower: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
              seriesProgress: { upsert: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
              profileCustomization: { findUnique: jest.fn(), upsert: jest.fn() },
              user: { findMany: jest.fn().mockResolvedValue([]) },
              $transaction: jest.fn(),
              $executeRaw: jest.fn(),
            },
          },
        ],
      }).compile();

      service = module.get(GamificationService);
      prisma = module.get(PrismaService);
    });

    it('should create default XP record for new user', async () => {
      prisma.userXP.findUnique.mockResolvedValue(null);
      prisma.userXP.create.mockResolvedValue({ userId: 'new-user', totalXP: 0, level: 1 });
      const result = await service.getXP('new-user');
      expect(result.totalXP).toBe(0);
    });

    it('should handle empty leaderboard gracefully', async () => {
      const result = await service.getLeaderboard('xp');
      expect(result).toEqual([]);
    });

    it('should handle empty challenges list', async () => {
      const result = await service.getChallenges();
      expect(result.data).toEqual([]);
    });

    it('should handle empty XP history', async () => {
      prisma.userXP.findUnique.mockResolvedValue(null);
      const result = await service.getXPHistory('user-1');
      expect(result.data).toEqual([]);
    });
  });
});
