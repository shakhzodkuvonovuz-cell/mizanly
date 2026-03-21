import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { BookmarksService } from './bookmarks.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('BookmarksService — authorization matrix', () => {
  let service: BookmarksService;
  let prisma: any;
  const userA = 'user-a';
  const userB = 'user-b';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        BookmarksService,
        {
          provide: PrismaService,
          useValue: {
            savedPost: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(), update: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
            threadBookmark: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
            videoBookmark: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
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

  it('should only return own bookmarks (userA)', async () => {
    const result = await service.getSavedPosts(userA);
    expect(prisma.savedPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: userA }) }),
    );
    expect(result.data).toEqual([]);
  });

  it('should only return own thread bookmarks', async () => {
    const result = await service.getSavedThreads(userA);
    expect(prisma.threadBookmark.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: userA }) }),
    );
    expect(result.data).toEqual([]);
  });

  it('should only return own video bookmarks', async () => {
    const result = await service.getSavedVideos(userA);
    expect(prisma.videoBookmark.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: userA }) }),
    );
    expect(result.data).toEqual([]);
  });

  it('should check per-user post saved status', async () => {
    prisma.savedPost.findUnique.mockResolvedValue(null);
    const result = await service.isPostSaved(userA, 'post-1');
    expect(result.saved).toBe(false);
    expect(prisma.savedPost.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId_postId: { userId: userA, postId: 'post-1' } }),
      }),
    );
  });

  it('should only return own collections', async () => {
    const result = await service.getCollections(userA);
    expect(prisma.savedPost.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: userA }) }),
    );
  });

  it('should throw NotFoundException when saving non-existent post', async () => {
    prisma.post.findUnique.mockResolvedValue(null);
    await expect(service.savePost(userA, 'nonexistent'))
      .rejects.toThrow(NotFoundException);
  });
});
