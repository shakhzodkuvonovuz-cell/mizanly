import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';
import { NotificationsService } from '../notifications/notifications.service';
import { ThreadsService } from './threads.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ThreadsService', () => {
  let service: ThreadsService;
  let prisma: any;
  let redis: any;
  let notifications: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        ThreadsService,
        {
          provide: PrismaService,
          useValue: {
            thread: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
            },
            threadReaction: {
              create: jest.fn(),
              delete: jest.fn(),
              findUnique: jest.fn(),
            },
            threadReply: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              delete: jest.fn(),
              update: jest.fn(),
            },
            threadReplyLike: {
              create: jest.fn(),
              delete: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
            threadBookmark: {
              create: jest.fn(),
              delete: jest.fn(),
              findUnique: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            follow: {
              findMany: jest.fn(),
            },
            block: {
              findMany: jest.fn(),
            },
            mute: {
              findMany: jest.fn(),
            },
            hashtag: {
              upsert: jest.fn(),
            },
            report: {
              create: jest.fn(),
            },
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: 'REDIS',
          useValue: {
            get: jest.fn(),
            setex: jest.fn(),
            del: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ThreadsService>(ThreadsService);
    prisma = module.get(PrismaService) as any;
    redis = module.get('REDIS');
    notifications = module.get(NotificationsService);
  });

  describe('createThread', () => {
    it('should create thread and increment user threadsCount', async () => {
      const userId = 'user-123';
      const dto = {
        content: 'Hello thread',
        visibility: 'PUBLIC' as const,
      };
      const mockThread = {
        id: 'thread-456',
        userId,
        content: dto.content,
        visibility: dto.visibility,
        mediaUrls: [],
        mediaTypes: [],
        hashtags: [],
        mentions: [],
        likesCount: 0,
        repliesCount: 0,
        repostsCount: 0,
        quotesCount: 0,
        viewsCount: 0,
        bookmarksCount: 0,
        hideLikesCount: false,
        isPinned: false,
        isSensitive: false,
        isRemoved: false,
        isChainHead: true,
        chainId: null,
        chainPosition: null,
        isQuotePost: false,
        quoteText: null,
        repostOfId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: {
          id: userId,
          username: 'testuser',
          displayName: 'Test User',
          avatarUrl: null,
          isVerified: false,
        },
        circle: null,
        poll: null,
        repostOf: null,
      };

      prisma.$transaction.mockResolvedValue([mockThread, {}]);
      prisma.thread.create.mockResolvedValue(mockThread as any);
      prisma.user.update.mockResolvedValue({} as any);
      prisma.hashtag.upsert.mockResolvedValue({} as any);

      const result = await service.create(userId, dto);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.thread.create).toHaveBeenCalledWith({
        data: {
          userId,
          content: dto.content,
          visibility: dto.visibility,
          circleId: undefined,
          mediaUrls: [],
          mediaTypes: [],
          hashtags: [],
          mentions: [],
          isQuotePost: false,
          quoteText: undefined,
          repostOfId: undefined,
          poll: undefined,
        },
        select: expect.any(Object),
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { threadsCount: { increment: 1 } },
      });
      expect(result).toEqual(mockThread);
    });

    it('should create thread with poll — creates thread + poll options', async () => {
      const userId = 'user-123';
      const dto = {
        content: 'Poll thread',
        visibility: 'PUBLIC' as const,
        poll: {
          question: 'What do you think?',
          options: [
            { text: 'Option 1' },
            { text: 'Option 2' },
          ],
          allowMultiple: false,
          endsAt: new Date(Date.now() + 86400000).toISOString(),
        },
      };
      const mockThread = {
        id: 'thread-456',
        userId,
        content: dto.content,
        visibility: dto.visibility,
        poll: {
          id: 'poll-789',
          question: dto.poll.question,
          endsAt: new Date(dto.poll.endsAt),
          allowMultiple: dto.poll.allowMultiple,
          totalVotes: 0,
          options: [
            { id: 'opt-1', text: 'Option 1', position: 0, votesCount: 0, _count: { votes: 0 } },
            { id: 'opt-2', text: 'Option 2', position: 1, votesCount: 0, _count: { votes: 0 } },
          ],
        },
        // ... other fields
      } as any;

      prisma.$transaction.mockResolvedValue([mockThread, {}]);
      prisma.thread.create.mockResolvedValue(mockThread);
      prisma.user.update.mockResolvedValue({} as any);
      prisma.hashtag.upsert.mockResolvedValue({} as any);

      const result = await service.create(userId, dto);

      expect(prisma.$transaction).toHaveBeenCalled();
      const threadCreateCall = prisma.thread.create.mock.calls[0];
      expect(threadCreateCall[0].data.poll).toBeDefined();
      expect(threadCreateCall[0].data.poll.create.question).toBe(dto.poll.question);
      expect(result).toEqual(mockThread);
    });
  });

  describe('deleteThread', () => {
    it('should soft-delete and decrement count', async () => {
      const userId = 'user-123';
      const threadId = 'thread-456';
      const mockThread = {
        id: threadId,
        userId,
        isRemoved: false,
      };

      prisma.thread.findUnique.mockResolvedValue(mockThread as any);
      prisma.$transaction.mockResolvedValue([{ ...mockThread, isRemoved: true }, 1]);
      prisma.thread.update.mockResolvedValue({ ...mockThread, isRemoved: true } as any);
      prisma.$executeRaw.mockResolvedValue(1 as any);

      const result = await service.delete(threadId, userId);

      expect(prisma.thread.findUnique).toHaveBeenCalledWith({ where: { id: threadId } });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.thread.update).toHaveBeenCalledWith({
        where: { id: threadId },
        data: { isRemoved: true },
      });
      expect(result).toEqual({ deleted: true });
    });

    it('should throw ForbiddenException for non-author', async () => {
      const userId = 'user-123';
      const threadId = 'thread-456';
      const mockThread = {
        id: threadId,
        userId: 'different-user',
        isRemoved: false,
      };

      prisma.thread.findUnique.mockResolvedValue(mockThread as any);

      await expect(service.delete(threadId, userId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('likeReply', () => {
    it('should create ThreadReplyLike and increment count', async () => {
      const userId = 'user-123';
      const threadId = 'thread-456';
      const replyId = 'reply-789';
      const mockReply = {
        id: replyId,
        threadId,
        userId: 'reply-owner',
        likesCount: 5,
      };

      prisma.threadReply.findUnique.mockResolvedValue(mockReply as any);
      prisma.threadReplyLike.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockResolvedValue([{}, { ...mockReply, likesCount: 6 }]);
      prisma.threadReplyLike.create.mockResolvedValue({} as any);
      prisma.threadReply.update.mockResolvedValue({ ...mockReply, likesCount: 6 } as any);

      const result = await service.likeReply(threadId, replyId, userId);

      expect(prisma.threadReply.findUnique).toHaveBeenCalledWith({ where: { id: replyId } });
      expect(prisma.threadReplyLike.findUnique).toHaveBeenCalledWith({
        where: { userId_replyId: { userId, replyId } },
      });
      expect(prisma.threadReplyLike.create).toHaveBeenCalledWith({
        data: { userId, replyId },
      });
      expect(prisma.threadReply.update).toHaveBeenCalledWith({
        where: { id: replyId },
        data: { likesCount: { increment: 1 } },
      });
      expect(result).toEqual({ liked: true });
    });

    it('should throw ConflictException if already liked', async () => {
      const userId = 'user-123';
      const threadId = 'thread-456';
      const replyId = 'reply-789';
      const mockReply = {
        id: replyId,
        threadId,
      };
      const mockLike = {
        userId,
        replyId,
      };

      prisma.threadReply.findUnique.mockResolvedValue(mockReply as any);
      prisma.threadReplyLike.findUnique.mockResolvedValue(mockLike as any);

      await expect(service.likeReply(threadId, replyId, userId)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('unlikeReply', () => {
    it('should delete like and decrement count', async () => {
      const userId = 'user-123';
      const threadId = 'thread-456';
      const replyId = 'reply-789';
      const mockLike = {
        userId,
        replyId,
      };

      prisma.threadReplyLike.findUnique.mockResolvedValue(mockLike as any);
      prisma.$transaction.mockResolvedValue([{}, 1]);
      prisma.threadReplyLike.delete.mockResolvedValue({} as any);
      prisma.$executeRaw.mockResolvedValue(1 as any);

      const result = await service.unlikeReply(threadId, replyId, userId);

      expect(prisma.threadReplyLike.findUnique).toHaveBeenCalledWith({
        where: { userId_replyId: { userId, replyId } },
      });
      expect(prisma.threadReplyLike.delete).toHaveBeenCalledWith({
        where: { userId_replyId: { userId, replyId } },
      });
      expect(result).toEqual({ liked: false });
    });
  });

  describe('getFeed', () => {
    it('should return threads sorted by engagement score for trending', async () => {
      const userId = 'user-123';
      const mockThreads = [
        {
          id: 'thread-1',
          content: 'Trending thread 1',
          likesCount: 100,
          user: { id: 'user-1', username: 'user1', displayName: 'User 1', avatarUrl: null, isVerified: false },
          // ... other required fields
        } as any,
        {
          id: 'thread-2',
          content: 'Trending thread 2',
          likesCount: 50,
          user: { id: 'user-2', username: 'user2', displayName: 'User 2', avatarUrl: null, isVerified: false },
        } as any,
      ];

      prisma.follow.findMany.mockResolvedValue([]);
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.thread.findMany.mockResolvedValue(mockThreads);

      const result = await service.getFeed(userId, 'trending');

      expect(prisma.thread.findMany).toHaveBeenCalledWith({
        where: {
          isRemoved: false,
          isChainHead: true,
          visibility: 'PUBLIC',
          user: { isPrivate: false, isDeactivated: false },
        },
        select: expect.any(Object),
        take: 21,
        orderBy: { likesCount: 'desc' },
      });
      expect(result.data).toHaveLength(2);
    });
  });

  describe('addReply', () => {
    it('should create reply and increment repliesCount', async () => {
      const userId = 'user-123';
      const threadId = 'thread-456';
      const content = 'This is a reply';
      const mockThread = {
        id: threadId,
        userId: 'thread-owner',
        isRemoved: false,
      };
      const mockReply = {
        id: 'reply-789',
        threadId,
        userId,
        content,
        mediaUrls: [],
        likesCount: 0,
        createdAt: new Date(),
        parentId: null,
        user: {
          id: userId,
          username: 'replyuser',
          displayName: 'Reply User',
          avatarUrl: null,
          isVerified: false,
        },
        _count: { replies: 0 },
      } as any;

      prisma.thread.findUnique.mockResolvedValue(mockThread as any);
      prisma.$transaction.mockResolvedValue([mockReply, {}]);
      prisma.threadReply.create.mockResolvedValue(mockReply);
      prisma.thread.update.mockResolvedValue({} as any);
      notifications.create.mockResolvedValue(undefined);

      const result = await service.addReply(threadId, userId, content);

      expect(prisma.thread.findUnique).toHaveBeenCalledWith({ where: { id: threadId } });
      expect(prisma.threadReply.create).toHaveBeenCalledWith({
        data: { threadId, userId, content, parentId: undefined },
        select: expect.any(Object),
      });
      expect(prisma.thread.update).toHaveBeenCalledWith({
        where: { id: threadId },
        data: { repliesCount: { increment: 1 } },
      });
      expect(notifications.create).toHaveBeenCalled();
      expect(result).toEqual(mockReply);
    });
  });

  describe('report', () => {
    it('should create report record', async () => {
      const userId = 'user-123';
      const threadId = 'thread-456';
      const reason = 'SPAM';
      const mockReport = {
        id: 'report-789',
        reporterId: userId,
        description: `thread:${threadId}`,
        reason: 'SPAM',
        createdAt: new Date(),
      } as any;

      prisma.thread.findUnique.mockResolvedValue({ id: threadId, isRemoved: false });
      prisma.report.create.mockResolvedValue(mockReport);

      const result = await service.report(threadId, userId, reason);

      expect(prisma.report.create).toHaveBeenCalledWith({
        data: {
          reporterId: userId,
          description: `thread:${threadId}`,
          reason: 'SPAM',
        },
      });
      expect(result).toEqual({ reported: true });
    });
  });
});