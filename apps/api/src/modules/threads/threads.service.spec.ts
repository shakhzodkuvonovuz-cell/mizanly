import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
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
              findFirst: jest.fn(),
            },
            mute: {
              findMany: jest.fn(),
            },
            hashtag: {
              upsert: jest.fn(),
            },
            report: {
              create: jest.fn(),
              findFirst: jest.fn().mockResolvedValue(null),
            },
            feedDismissal: {
              upsert: jest.fn(),
            },
            pollOption: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            pollVote: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
            },
            poll: {
              update: jest.fn(),
            },
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
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
      const now = new Date();
      const mockThreads = [
        {
          id: 'thread-1',
          content: 'Trending thread 1',
          likesCount: 100,
          repliesCount: 20,
          repostsCount: 5,
          quotesCount: 3,
          viewsCount: 500,
          createdAt: now,
          user: { id: 'user-1', username: 'user1', displayName: 'User 1', avatarUrl: null, isVerified: false },
        } as any,
        {
          id: 'thread-2',
          content: 'Trending thread 2',
          likesCount: 50,
          repliesCount: 10,
          repostsCount: 2,
          quotesCount: 1,
          viewsCount: 200,
          createdAt: now,
          user: { id: 'user-2', username: 'user2', displayName: 'User 2', avatarUrl: null, isVerified: false },
        } as any,
      ];

      prisma.follow.findMany.mockResolvedValue([]);
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.thread.findMany.mockResolvedValue(mockThreads);

      const result = await service.getFeed(userId, 'trending');

      expect(prisma.thread.findMany).toHaveBeenCalled();
      expect(result.data).toHaveLength(2);
      // Higher engagement thread should be first
      expect(result.data[0].id).toBe('thread-1');
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

  // ═══════════════════════════════════════════════════════
  // getById
  // ═══════════════════════════════════════════════════════

  describe('getById', () => {
    const mockThread = {
      id: 'thread-1', content: 'Test thread', isRemoved: false,
      likesCount: 10, repliesCount: 5, repostsCount: 2,
      user: { id: 'owner', username: 'owner', displayName: 'Owner', avatarUrl: null, isVerified: false },
    };

    it('should return thread with viewer reaction and bookmark status', async () => {
      prisma.thread.findUnique.mockResolvedValue(mockThread);
      prisma.block.findFirst.mockResolvedValue(null);
      prisma.threadReaction.findUnique.mockResolvedValue({ reaction: 'LIKE' });
      prisma.threadBookmark.findUnique.mockResolvedValue({ userId: 'viewer' });

      const result = await service.getById('thread-1', 'viewer');
      expect(result.id).toBe('thread-1');
      expect(result.userReaction).toBe('LIKE');
      expect(result.isBookmarked).toBe(true);
    });

    it('should return thread without viewer context', async () => {
      prisma.thread.findUnique.mockResolvedValue(mockThread);

      const result = await service.getById('thread-1');
      expect(result.userReaction).toBeNull();
      expect(result.isBookmarked).toBe(false);
    });

    it('should throw NotFoundException when not found', async () => {
      prisma.thread.findUnique.mockResolvedValue(null);
      await expect(service.getById('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when removed', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...mockThread, isRemoved: true });
      await expect(service.getById('thread-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when viewer is blocked', async () => {
      prisma.thread.findUnique.mockResolvedValue(mockThread);
      prisma.block.findFirst.mockResolvedValue({ blockerId: 'viewer', blockedId: 'owner' });
      await expect(service.getById('thread-1', 'viewer')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // like / unlike
  // ═══════════════════════════════════════════════════════

  describe('like', () => {
    it('should throw BadRequestException when liking own thread', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 'thread-1', userId: 'user-1', isRemoved: false });

      await expect(service.like('thread-1', 'user-1')).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should like thread by another user', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 'thread-1', userId: 'owner-99', isRemoved: false });
      prisma.threadReaction.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.like('thread-1', 'user-1');
      expect(result).toEqual({ liked: true });
    });

    it('should throw NotFoundException for removed thread', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 'thread-1', isRemoved: true });
      await expect(service.like('thread-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if already liked', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 'thread-1', userId: 'owner', isRemoved: false });
      prisma.threadReaction.findUnique.mockResolvedValue({ reaction: 'LIKE' });
      await expect(service.like('thread-1', 'user-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('unlike', () => {
    it('should unlike thread', async () => {
      prisma.threadReaction.findUnique.mockResolvedValue({ reaction: 'LIKE' });
      prisma.$transaction.mockResolvedValue([{}, 1]);

      const result = await service.unlike('thread-1', 'user-1');
      expect(result).toEqual({ liked: false });
    });

    it('should throw NotFoundException if not liked', async () => {
      prisma.threadReaction.findUnique.mockResolvedValue(null);
      await expect(service.unlike('thread-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // bookmark / unbookmark
  // ═══════════════════════════════════════════════════════

  describe('bookmark', () => {
    it('should bookmark thread', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 'thread-1', isRemoved: false });
      prisma.threadBookmark.create.mockResolvedValue({});
      const result = await service.bookmark('thread-1', 'user-1');
      expect(result).toEqual({ bookmarked: true });
    });

    it('should throw NotFoundException for removed thread', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 'thread-1', isRemoved: true });
      await expect(service.bookmark('thread-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when thread not found', async () => {
      prisma.thread.findUnique.mockResolvedValue(null);
      await expect(service.bookmark('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('unbookmark', () => {
    it('should unbookmark thread', async () => {
      prisma.threadBookmark.findUnique.mockResolvedValue({ userId: 'user-1', threadId: 'thread-1' });
      prisma.threadBookmark.delete.mockResolvedValue({});
      const result = await service.unbookmark('thread-1', 'user-1');
      expect(result).toEqual({ bookmarked: false });
    });

    it('should throw NotFoundException if not bookmarked', async () => {
      prisma.threadBookmark.findUnique.mockResolvedValue(null);
      await expect(service.unbookmark('thread-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // getReplies
  // ═══════════════════════════════════════════════════════

  describe('getReplies', () => {
    it('should return replies with pagination', async () => {
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.threadReply.findMany.mockResolvedValue([
        { id: 'reply-1', content: 'Good point', user: { id: 'u1' } },
      ]);
      prisma.threadReplyLike.findMany.mockResolvedValue([]);

      const result = await service.getReplies('thread-1');
      expect(result.data).toHaveLength(1);
    });

    it('should return empty for thread with no replies', async () => {
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.threadReply.findMany.mockResolvedValue([]);

      const result = await service.getReplies('thread-1');
      expect(result.data).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════
  // deleteReply
  // ═══════════════════════════════════════════════════════

  describe('deleteReply', () => {
    it('should delete own reply', async () => {
      prisma.threadReply.findUnique.mockResolvedValue({ id: 'reply-1', userId: 'user-1', threadId: 'thread-1' });
      prisma.threadReply.update.mockResolvedValue({});
      prisma.$executeRaw.mockResolvedValue(1);

      const result = await service.deleteReply('reply-1', 'user-1');
      expect(result).toEqual({ deleted: true });
    });

    it('should throw ForbiddenException for non-author', async () => {
      prisma.threadReply.findUnique.mockResolvedValue({ id: 'reply-1', userId: 'other', threadId: 'thread-1' });
      await expect(service.deleteReply('reply-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when reply not found', async () => {
      prisma.threadReply.findUnique.mockResolvedValue(null);
      await expect(service.deleteReply('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // dismiss
  // ═══════════════════════════════════════════════════════

  describe('dismiss', () => {
    it('should dismiss thread from feed', async () => {
      prisma.feedDismissal = { upsert: jest.fn().mockResolvedValue({}) };
      const result = await service.dismiss('thread-1', 'user-1');
      expect(result).toEqual({ dismissed: true });
    });
  });

  // ═══════════════════════════════════════════════════════
  // getShareLink / isBookmarked
  // ═══════════════════════════════════════════════════════

  describe('getShareLink', () => {
    it('should return share URL', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 'thread-1', isRemoved: false });
      const result = await service.getShareLink('thread-1');
      expect(result.url).toContain('thread-1');
    });
  });

  describe('isBookmarked', () => {
    it('should return bookmarked true when bookmarked', async () => {
      prisma.threadBookmark.findUnique.mockResolvedValue({ userId: 'user-1', threadId: 'thread-1' });
      const result = await service.isBookmarked('thread-1', 'user-1');
      expect(result).toEqual({ bookmarked: true });
    });

    it('should return bookmarked false when not bookmarked', async () => {
      prisma.threadBookmark.findUnique.mockResolvedValue(null);
      const result = await service.isBookmarked('thread-1', 'user-1');
      expect(result).toEqual({ bookmarked: false });
    });
  });

  // ═══════════════════════════════════════════════════════
  // getFeed
  // ═══════════════════════════════════════════════════════

  describe('getFeed', () => {
    it('should return empty feed for user with follows but no posts', async () => {
      prisma.follow.findMany.mockResolvedValue(
        Array(15).fill(null).map((_, i) => ({ followingId: `f-${i}` })),
      );
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.thread.findMany.mockResolvedValue([]);
      prisma.threadReaction.findUnique.mockResolvedValue(null);
      prisma.threadBookmark.findUnique.mockResolvedValue(null);

      const result = await service.getFeed('user-1', 'following');
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should fall back to trending when user has zero follows', async () => {
      prisma.follow.findMany.mockResolvedValue([]);
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.thread.findMany.mockResolvedValue([]);

      const result = await service.getFeed('user-1', 'following');
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════
  // getUserThreads
  // ═══════════════════════════════════════════════════════

  describe('getUserThreads', () => {
    it('should return empty threads for user with no threads', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'testuser' });
      prisma.thread.findMany.mockResolvedValue([]);

      const result = await service.getUserThreads('testuser');
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should throw NotFoundException for non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getUserThreads('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // repost / unrepost
  // ═══════════════════════════════════════════════════════

  describe('repost', () => {
    it('should create repost and increment repostsCount', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 'thread-1', userId: 'owner', isRemoved: false });
      prisma.thread.findFirst.mockResolvedValue(null);
      const repostThread = { id: 'repost-1', userId: 'user-1', repostOfId: 'thread-1', user: { id: 'user-1' } };
      prisma.$transaction.mockResolvedValue([repostThread, {}]);

      const result = await service.repost('thread-1', 'user-1');
      expect(result.repostOfId).toBe('thread-1');
    });

    it('should throw BadRequestException when reposting own thread', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 'thread-1', userId: 'user-1', isRemoved: false });
      await expect(service.repost('thread-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when already reposted', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 'thread-1', userId: 'owner', isRemoved: false });
      prisma.thread.findFirst.mockResolvedValue({ id: 'repost-1' });
      await expect(service.repost('thread-1', 'user-1')).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException when thread not found', async () => {
      prisma.thread.findUnique.mockResolvedValue(null);
      await expect(service.repost('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when thread is removed', async () => {
      prisma.thread.findUnique.mockResolvedValue({ id: 'thread-1', userId: 'owner', isRemoved: true });
      await expect(service.repost('thread-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('unrepost', () => {
    it('should remove repost and decrement count', async () => {
      prisma.thread.findFirst.mockResolvedValue({ id: 'repost-1', userId: 'user-1', repostOfId: 'thread-1' });
      prisma.$transaction.mockResolvedValue([{}, 1]);

      const result = await service.unrepost('thread-1', 'user-1');
      expect(result).toEqual({ reposted: false });
    });

    it('should throw NotFoundException when no repost exists', async () => {
      prisma.thread.findFirst.mockResolvedValue(null);
      await expect(service.unrepost('thread-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // votePoll
  // ═══════════════════════════════════════════════════════

  describe('votePoll', () => {
    const mockOption = {
      id: 'opt-1', pollId: 'poll-1', text: 'Option A', votesCount: 0,
      poll: { id: 'poll-1', endsAt: null, allowMultiple: false, totalVotes: 0 },
    };

    it('should cast vote and increment counts', async () => {
      prisma.pollOption.findUnique.mockResolvedValue(mockOption);
      prisma.pollVote.findUnique.mockResolvedValue(null);
      prisma.pollVote.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockResolvedValue([{}, {}, {}]);

      const result = await service.votePoll('opt-1', 'user-1');
      expect(result).toEqual({ voted: true });
    });

    it('should throw NotFoundException for nonexistent option', async () => {
      prisma.pollOption.findUnique.mockResolvedValue(null);
      await expect(service.votePoll('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when poll has ended', async () => {
      const expiredOption = {
        ...mockOption,
        poll: { ...mockOption.poll, endsAt: new Date(Date.now() - 86400000) },
      };
      prisma.pollOption.findUnique.mockResolvedValue(expiredOption);
      await expect(service.votePoll('opt-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when already voted on same option', async () => {
      prisma.pollOption.findUnique.mockResolvedValue(mockOption);
      prisma.pollVote.findUnique.mockResolvedValue({ userId: 'user-1', optionId: 'opt-1' });
      await expect(service.votePoll('opt-1', 'user-1')).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when already voted on poll (single choice)', async () => {
      prisma.pollOption.findUnique.mockResolvedValue(mockOption);
      prisma.pollVote.findUnique.mockResolvedValue(null);
      prisma.pollVote.findFirst.mockResolvedValue({ userId: 'user-1', optionId: 'opt-2' });
      await expect(service.votePoll('opt-1', 'user-1')).rejects.toThrow(ConflictException);
    });
  });
});