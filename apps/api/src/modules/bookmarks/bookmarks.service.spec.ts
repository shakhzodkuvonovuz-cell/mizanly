import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { BookmarksService } from './bookmarks.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('BookmarksService', () => {
  let service: BookmarksService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        BookmarksService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn().mockImplementation((promises) => Promise.all(promises)),
            $executeRaw: jest.fn().mockResolvedValue(1),
            savedPost: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              findMany: jest.fn(),
              groupBy: jest.fn(),
            },
            threadBookmark: {
              findUnique: jest.fn(),
              create: jest.fn(),
              delete: jest.fn(),
              findMany: jest.fn(),
            },
            videoBookmark: {
              findUnique: jest.fn(),
              create: jest.fn(),
              delete: jest.fn(),
              findMany: jest.fn(),
            },
            post: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            thread: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            video: {
              findUnique: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<BookmarksService>(BookmarksService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('savePost', () => {
    const userId = 'user1';
    const postId = 'post1';
    const collectionName = 'default';

    it('should save a post successfully', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: postId });
      prisma.savedPost.findUnique.mockResolvedValue(null);
      prisma.savedPost.create.mockResolvedValue({ userId, postId, collectionName });
      prisma.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));

      const result = await service.savePost(userId, postId, collectionName);
      expect(result).toEqual({ userId, postId, collectionName });
      expect(prisma.post.findUnique).toHaveBeenCalledWith({
        where: { id: postId, isRemoved: false },
        select: { id: true },
      });
      expect(prisma.savedPost.findUnique).toHaveBeenCalledWith({
        where: { userId_postId: { userId, postId } },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException if post not found', async () => {
      prisma.post.findUnique.mockResolvedValue(null);

      await expect(service.savePost(userId, postId, collectionName))
        .rejects.toThrow(NotFoundException);
    });

    it('should update collection if already saved with different collection', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: postId });
      prisma.savedPost.findUnique.mockResolvedValue({
        userId, postId, collectionName: 'old',
      });
      prisma.savedPost.update.mockResolvedValue({
        userId, postId, collectionName,
      });

      const result = await service.savePost(userId, postId, collectionName);
      expect(prisma.savedPost.update).toHaveBeenCalledWith({
        where: { userId_postId: { userId, postId } },
        data: { collectionName },
      });
      expect(result!.collectionName).toBe(collectionName);
    });
  });

  describe('unsavePost', () => {
    const userId = 'user1';
    const postId = 'post1';

    it('should unsave a post via interactive transaction', async () => {
      const mockTx = {
        savedPost: { delete: jest.fn().mockResolvedValue({}) },
        post: {
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };
      (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx));

      await service.unsavePost(userId, postId);
      expect(mockTx.savedPost.delete).toHaveBeenCalledWith({
        where: { userId_postId: { userId, postId } },
      });
      expect(mockTx.post.update).toHaveBeenCalledWith({
        where: { id: postId },
        data: { savesCount: { decrement: 1 } },
      });
    });

    it('should throw NotFoundException if post not saved (P2025)', async () => {
      const { PrismaClientKnownRequestError } = require('@prisma/client/runtime/library');
      (prisma.$transaction as jest.Mock).mockRejectedValue(
        new PrismaClientKnownRequestError('Not found', { code: 'P2025', clientVersion: '0' }),
      );

      await expect(service.unsavePost(userId, postId))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('saveThread', () => {
    const userId = 'user1';
    const threadId = 'thread1';

    it('should save a thread', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: threadId });
      prisma.threadBookmark.findUnique.mockResolvedValue(null);
      prisma.threadBookmark.create.mockResolvedValue({ userId, threadId });

      const result = await service.saveThread(userId, threadId);
      expect(result).toEqual({ userId, threadId });
    });

    it('should throw NotFoundException if thread not found', async () => {
      prisma.thread.findUnique.mockResolvedValue(null);

      await expect(service.saveThread(userId, threadId))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('unsaveThread', () => {
    const userId = 'user1';
    const threadId = 'thread1';

    it('should unsave a thread', async () => {
      prisma.threadBookmark.findUnique.mockResolvedValue({ userId, threadId });
      await service.unsaveThread(userId, threadId);
      expect(prisma.threadBookmark.delete).toHaveBeenCalledWith({
        where: { userId_threadId: { userId, threadId } },
      });
    });
  });

  describe('saveVideo', () => {
    const userId = 'user1';
    const videoId = 'video1';

    it('should save a video via batch transaction', async () => {
      prisma.video.findUnique.mockResolvedValue({ id: videoId });
      const mockBookmark = { userId, videoId };
      (prisma.$transaction as jest.Mock).mockResolvedValue([mockBookmark, {}]);

      const result = await service.saveVideo(userId, videoId);
      expect(result).toEqual(mockBookmark);
    });

    it('should throw NotFoundException if video not found', async () => {
      prisma.video.findUnique.mockResolvedValue(null);

      await expect(service.saveVideo(userId, videoId))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('unsaveVideo', () => {
    const userId = 'user1';
    const videoId = 'video1';

    it('should unsave a video via interactive transaction', async () => {
      const mockTx = {
        videoBookmark: { delete: jest.fn().mockResolvedValue({}) },
        video: {
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };
      (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx));

      await service.unsaveVideo(userId, videoId);
      expect(mockTx.videoBookmark.delete).toHaveBeenCalledWith({
        where: { userId_videoId: { userId, videoId } },
      });
    });
  });

  describe('getSavedPosts', () => {
    const userId = 'user1';
    const cursor = undefined;
    const limit = 20;

    it('should return paginated saved posts', async () => {
      const mockSavedPosts = [
        { postId: 'post1', post: { id: 'post1', content: 'test', user: {} } },
        { postId: 'post2', post: { id: 'post2', content: 'test2', user: {} } },
      ];
      prisma.savedPost.findMany.mockResolvedValue(mockSavedPosts);

      const result = await service.getSavedPosts(userId, undefined, cursor, limit);
      expect(result.data).toHaveLength(2);
      expect(result.meta.hasMore).toBe(false);
      expect(prisma.savedPost.findMany).toHaveBeenCalledWith({
        where: { userId },
        include: expect.any(Object),
        take: limit + 1,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should filter by collection', async () => {
      prisma.savedPost.findMany.mockResolvedValue([]);
      await service.getSavedPosts(userId, 'favorites', cursor, limit);
      expect(prisma.savedPost.findMany).toHaveBeenCalledWith({
        where: { userId, collectionName: 'favorites' },
        include: expect.any(Object),
        take: limit + 1,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getCollections', () => {
    const userId = 'user1';

    it('should return collections with counts', async () => {
      const mockGroups = [
        { collectionName: 'default', _count: { postId: 5 } },
        { collectionName: 'favorites', _count: { postId: 2 } },
      ];
      prisma.savedPost.groupBy.mockResolvedValue(mockGroups);

      const result = await service.getCollections(userId);
      expect(result).toEqual([
        { name: 'default', count: 5 },
        { name: 'favorites', count: 2 },
      ]);
    });
  });

  describe('moveToCollection', () => {
    const userId = 'user1';
    const postId = 'post1';
    const collectionName = 'new';

    it('should move saved post to new collection', async () => {
      prisma.savedPost.findUnique.mockResolvedValue({ userId, postId, collectionName: 'old' });
      prisma.savedPost.update.mockResolvedValue({ userId, postId, collectionName });

      const result = await service.moveToCollection(userId, postId, collectionName);
      expect(result!.collectionName).toBe(collectionName);
    });

    it('should throw NotFoundException if saved post not found', async () => {
      prisma.savedPost.findUnique.mockResolvedValue(null);

      await expect(service.moveToCollection(userId, postId, collectionName))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('isPostSaved', () => {
    const userId = 'user1';
    const postId = 'post1';

    it('should return saved true if saved', async () => {
      prisma.savedPost.findUnique.mockResolvedValue({ collectionName: 'default', createdAt: new Date() });
      const result = await service.isPostSaved(userId, postId);
      expect(result.saved).toBe(true);
      expect(result.collectionName).toBe('default');
    });

    it('should return saved false if not saved', async () => {
      prisma.savedPost.findUnique.mockResolvedValue(null);
      const result = await service.isPostSaved(userId, postId);
      expect(result.saved).toBe(false);
    });
  });
});