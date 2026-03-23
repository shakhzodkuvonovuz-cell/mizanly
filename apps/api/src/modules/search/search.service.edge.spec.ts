import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { SearchService } from './search.service';
import { MeilisearchService } from './meilisearch.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('SearchService — edge cases', () => {
  let service: SearchService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
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
            search: jest.fn().mockResolvedValue({ hits: [] }),
          },
        },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
    prisma = module.get(PrismaService);
  });

  describe('search — edge cases', () => {
    it('should handle Arabic query without crash', async () => {
      const result = await service.search('إسلام', 'posts');
      expect(result.data).toEqual([]);
    });

    it('should handle regex special characters without regex injection', async () => {
      const result = await service.search('user (test) [bracket]', 'posts');
      expect(result).toHaveProperty('data');
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should throw BadRequestException for empty query', async () => {
      await expect(service.search(''))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for whitespace-only query', async () => {
      await expect(service.search('   '))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for query > 200 characters', async () => {
      const longQuery = 'a'.repeat(201);
      await expect(service.search(longQuery))
        .rejects.toThrow(BadRequestException);
    });

    it('should accept query of exactly 200 characters', async () => {
      const maxQuery = 'a'.repeat(200);
      const result = await service.search(maxQuery, 'posts');
      expect(result).toHaveProperty('data');
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('getSuggestions — edge cases', () => {
    it('should return result for empty query (returns suggestions or empty)', async () => {
      const result = await service.getSuggestions('');
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });
  });

  describe('trending — edge cases', () => {
    it('should return data even when no content exists', async () => {
      const result = await service.trending();
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });
  });
});
