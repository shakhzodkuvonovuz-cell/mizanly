import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { BookmarksService } from './bookmarks.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('BookmarksService — edge cases', () => {
  let service: BookmarksService;
  let prisma: any;

  const userId = 'user-edge-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        BookmarksService,
        {
          provide: PrismaService,
          useValue: {
            savedPost: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              delete: jest.fn(),
              update: jest.fn(),
            },
            threadBookmark: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              delete: jest.fn(),
            },
            videoBookmark: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              delete: jest.fn(),
            },
            post: { findUnique: jest.fn(), update: jest.fn() },
            thread: { findUnique: jest.fn(), update: jest.fn() },
            video: { findUnique: jest.fn() },
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BookmarksService>(BookmarksService);
    prisma = module.get(PrismaService);
  });

  describe('savePost — edge cases', () => {
    it('should throw NotFoundException for non-existent post', async () => {
      prisma.post.findUnique.mockResolvedValue(null);

      await expect(service.savePost(userId, 'nonexistent'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('unsavePost — edge cases', () => {
    it('should handle unsaving a post that was not saved (no error)', async () => {
      prisma.savedPost.findUnique.mockResolvedValue(null);
      prisma.savedPost.delete.mockResolvedValue({});

      // Service may return success even if not found (idempotent)
      const result = await service.unsavePost(userId, 'post-1');
      expect(result).toBeDefined();
    });
  });

  describe('getSavedPosts — edge cases', () => {
    it('should return empty array when no posts saved', async () => {
      const result = await service.getSavedPosts(userId);
      expect(result.data).toEqual([]);
    });
  });

  describe('getSavedThreads — edge cases', () => {
    it('should return empty array when no threads bookmarked', async () => {
      const result = await service.getSavedThreads(userId);
      expect(result.data).toEqual([]);
    });
  });

  describe('getCollections — edge cases', () => {
    it('should return result when groupBy is available', async () => {
      prisma.savedPost.groupBy = jest.fn().mockResolvedValue([]);

      const result = await service.getCollections(userId);
      expect(result).toBeDefined();
    });
  });

  describe('isPostSaved — edge cases', () => {
    it('should return saved=false for non-saved post', async () => {
      prisma.savedPost.findUnique.mockResolvedValue(null);

      const result = await service.isPostSaved(userId, 'post-1');
      expect(result.saved).toBe(false);
    });
  });
});
