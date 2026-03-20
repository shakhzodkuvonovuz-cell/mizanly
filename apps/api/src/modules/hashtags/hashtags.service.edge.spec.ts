import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { HashtagsService } from './hashtags.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('HashtagsService — edge cases', () => {
  let service: HashtagsService;
  let prisma: any;
  const userId = 'user-edge-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        HashtagsService,
        {
          provide: PrismaService,
          useValue: {
            hashtag: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              upsert: jest.fn(),
              update: jest.fn(),
            },
            hashtagFollow: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              delete: jest.fn(),
            },
            post: { findMany: jest.fn().mockResolvedValue([]) },
            reel: { findMany: jest.fn().mockResolvedValue([]) },
            thread: { findMany: jest.fn().mockResolvedValue([]) },
            postReaction: { findMany: jest.fn().mockResolvedValue([]) },
            savedPost: { findMany: jest.fn().mockResolvedValue([]) },
            $executeRaw: jest.fn(),
            $queryRaw: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<HashtagsService>(HashtagsService);
    prisma = module.get(PrismaService);
  });

  it('should throw NotFoundException for non-existent hashtag name', async () => {
    prisma.hashtag.findUnique.mockResolvedValue(null);
    await expect(service.getByName('nonexistent'))
      .rejects.toThrow(NotFoundException);
  });

  it('should return empty trending list when no hashtags exist', async () => {
    const result = await service.getTrendingRaw();
    expect(result).toEqual([]);
  });

  it('should return empty search results for empty query', async () => {
    const result = await service.search('');
    expect(result).toEqual([]);
  });

  it('should return empty posts for hashtag with no content', async () => {
    prisma.hashtag.findUnique.mockResolvedValue({ id: 'h-1', name: 'test' });
    const result = await service.getPostsByHashtag('test');
    expect(result.data).toEqual([]);
  });

  it('should return empty followed hashtags for user who follows none', async () => {
    const result = await service.getFollowedHashtags(userId);
    expect(result.data).toEqual([]);
  });

  it('should handle Arabic hashtag name lookup', async () => {
    prisma.hashtag.findUnique.mockResolvedValue({ id: 'h-1', name: 'إسلام', postsCount: 5 });
    const result = await service.getByName('إسلام');
    expect(result.name).toBe('إسلام');
  });
});
