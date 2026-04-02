import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PostsService } from './posts.service';
import { globalMockProviders } from '../../common/test/mock-providers';

/**
 * Tests for commentPermission enforcement in addComment.
 * Ensures FOLLOWERS and NOBODY permissions are enforced, not just stored.
 */
describe('PostsService — Comment Permission Enforcement', () => {
  let service: PostsService;
  let prisma: any;

  const postOwner = 'user-owner';
  const follower = 'user-follower';
  const stranger = 'user-stranger';

  function makePost(overrides: Record<string, unknown> = {}) {
    return {
      id: 'post-1',
      userId: postOwner,
      isRemoved: false,
      commentsDisabled: false,
      commentPermission: 'EVERYONE',
      ...overrides,
    };
  }

  const mockComment = {
    id: 'comment-1',
    content: 'Test comment',
    userId: follower,
    postId: 'post-1',
    user: { id: follower, username: 'follower', displayName: 'Follower', avatarUrl: null, isVerified: false },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        PostsService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
            $queryRaw: jest.fn(),
            post: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
            postReaction: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
            follow: { findMany: jest.fn(), findUnique: jest.fn() },
            block: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
            mute: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
            hashtag: { upsert: jest.fn() },
            report: { create: jest.fn().mockResolvedValue({}), findFirst: jest.fn().mockResolvedValue(null) },
            feedDismissal: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
            user: { update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
            comment: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
            commentReaction: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
            savedPost: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
            circleMember: { findMany: jest.fn().mockResolvedValue([]) },
            postTaggedUser: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
        {
          provide: NotificationsService,
          useValue: { notifyLike: jest.fn(), notifyComment: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'n1' }) },
        },
        {
          provide: 'REDIS',
          useValue: { get: jest.fn(), setex: jest.fn(), del: jest.fn(), publish: jest.fn().mockResolvedValue(1), pfadd: jest.fn().mockResolvedValue(1), pfcount: jest.fn().mockResolvedValue(0) },
        },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
    prisma = module.get(PrismaService) as any;
  });

  describe('commentPermission: EVERYONE', () => {
    it('should allow anyone to comment', async () => {
      prisma.post.findUnique.mockResolvedValue(makePost({ commentPermission: 'EVERYONE' }));
      prisma.$transaction.mockResolvedValue([mockComment, {}]);

      const result = await service.addComment('post-1', stranger, { content: 'Hello' });
      expect(result).toBeDefined();
    });
  });

  describe('commentPermission: NOBODY', () => {
    it('should block all comments', async () => {
      prisma.post.findUnique.mockResolvedValue(makePost({ commentPermission: 'NOBODY' }));

      await expect(
        service.addComment('post-1', follower, { content: 'Hello' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow post owner to comment even when NOBODY', async () => {
      prisma.post.findUnique.mockResolvedValue(makePost({ commentPermission: 'NOBODY' }));
      prisma.$transaction.mockResolvedValue([mockComment, {}]);

      const result = await service.addComment('post-1', postOwner, { content: 'My own post' });
      expect(result).toBeDefined();
    });
  });

  describe('commentPermission: FOLLOWERS', () => {
    it('should allow followers to comment', async () => {
      prisma.post.findUnique.mockResolvedValue(makePost({ commentPermission: 'FOLLOWERS' }));
      prisma.follow.findUnique.mockResolvedValue({ followerId: follower, followingId: postOwner });
      prisma.$transaction.mockResolvedValue([mockComment, {}]);

      const result = await service.addComment('post-1', follower, { content: 'Nice post!' });
      expect(result).toBeDefined();
    });

    it('should block non-followers', async () => {
      prisma.post.findUnique.mockResolvedValue(makePost({ commentPermission: 'FOLLOWERS' }));
      prisma.follow.findUnique.mockResolvedValue(null); // Not following

      await expect(
        service.addComment('post-1', stranger, { content: 'Hello' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow post owner to comment on their own post', async () => {
      prisma.post.findUnique.mockResolvedValue(makePost({ commentPermission: 'FOLLOWERS' }));
      prisma.$transaction.mockResolvedValue([{ ...mockComment, userId: postOwner }, {}]);

      // Post owner doesn't need to follow themselves
      const result = await service.addComment('post-1', postOwner, { content: 'My post' });
      expect(result).toBeDefined();
    });
  });

  describe('legacy commentsDisabled', () => {
    it('should still respect commentsDisabled=true', async () => {
      prisma.post.findUnique.mockResolvedValue(makePost({ commentsDisabled: true, commentPermission: 'EVERYONE' }));

      await expect(
        service.addComment('post-1', stranger, { content: 'Hello' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('edge cases', () => {
    it('should throw NotFoundException for non-existent post', async () => {
      prisma.post.findUnique.mockResolvedValue(null);

      await expect(
        service.addComment('nonexistent', stranger, { content: 'Hello' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for removed post', async () => {
      prisma.post.findUnique.mockResolvedValue(makePost({ isRemoved: true }));

      await expect(
        service.addComment('post-1', stranger, { content: 'Hello' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle null commentPermission (default to EVERYONE)', async () => {
      prisma.post.findUnique.mockResolvedValue(makePost({ commentPermission: null }));
      prisma.$transaction.mockResolvedValue([mockComment, {}]);

      const result = await service.addComment('post-1', stranger, { content: 'Hello' });
      expect(result).toBeDefined();
    });
  });
});
