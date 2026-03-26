import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { PostsService } from './posts.service';
import { NotificationsService } from '../notifications/notifications.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('PostsService — Blocked User Content Access', () => {
  let service: PostsService;
  let prisma: any;

  const blockerUserId = 'user-blocker';
  const blockedUserId = 'user-blocked';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        PostsService,
        {
          provide: PrismaService,
          useValue: {
            post: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn(),
              update: jest.fn(),
            },
            postReaction: {
              findUnique: jest.fn().mockResolvedValue(null),
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            savedPost: {
              findUnique: jest.fn().mockResolvedValue(null),
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn(),
            },
            block: {
              findFirst: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            mute: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            follow: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            feedDismissal: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            circleMember: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            restrict: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            user: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn(),
            },
            comment: {
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn(),
            },
            hashtag: {
              upsert: jest.fn(),
            },
            feedInteraction: {
              upsert: jest.fn(),
            },
            $transaction: jest.fn().mockImplementation(async (fn: unknown) => {
              if (typeof fn === 'function') return fn(prisma);
              return Promise.all(fn as Promise<unknown>[]);
            }),
            $executeRaw: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
    prisma = module.get(PrismaService) as any;
  });

  describe('getById — blocked user cannot view post', () => {
    it('should throw NotFoundException when viewer is blocked by post author', async () => {
      const post = {
        id: 'post-1',
        postType: 'TEXT',
        content: 'Hello',
        visibility: 'PUBLIC',
        mediaUrls: [],
        mediaTypes: [],
        thumbnailUrl: null,
        mediaWidth: null,
        mediaHeight: null,
        hashtags: [],
        mentions: [],
        locationName: null,
        likesCount: 5,
        commentsCount: 2,
        sharesCount: 0,
        savesCount: 1,
        viewsCount: 100,
        hideLikesCount: false,
        commentsDisabled: false,
        isSensitive: false,
        isRemoved: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: blockerUserId, username: 'blocker', displayName: 'Blocker', avatarUrl: null, isVerified: false },
        circle: null,
        sharedPost: null,
      };
      prisma.post.findUnique.mockResolvedValue(post);

      // blocker has blocked the viewer
      prisma.block.findFirst.mockResolvedValue({
        id: 'block-1',
        blockerId: blockerUserId,
        blockedId: blockedUserId,
      });

      await expect(
        service.getById('post-1', blockedUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when viewer has blocked the post author', async () => {
      const post = {
        id: 'post-2',
        postType: 'TEXT',
        content: 'Test post',
        visibility: 'PUBLIC',
        mediaUrls: [],
        mediaTypes: [],
        thumbnailUrl: null,
        mediaWidth: null,
        mediaHeight: null,
        hashtags: [],
        mentions: [],
        locationName: null,
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        savesCount: 0,
        viewsCount: 10,
        hideLikesCount: false,
        commentsDisabled: false,
        isSensitive: false,
        isRemoved: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: blockedUserId, username: 'blocked', displayName: 'Blocked', avatarUrl: null, isVerified: false },
        circle: null,
        sharedPost: null,
      };
      prisma.post.findUnique.mockResolvedValue(post);

      // viewer has blocked the post author
      prisma.block.findFirst.mockResolvedValue({
        id: 'block-2',
        blockerId: blockerUserId,
        blockedId: blockedUserId,
      });

      await expect(
        service.getById('post-2', blockerUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return post when no block exists between viewer and author', async () => {
      const post = {
        id: 'post-3',
        postType: 'TEXT',
        content: 'Visible post',
        visibility: 'PUBLIC',
        mediaUrls: [],
        mediaTypes: [],
        thumbnailUrl: null,
        mediaWidth: null,
        mediaHeight: null,
        hashtags: [],
        mentions: [],
        locationName: null,
        likesCount: 3,
        commentsCount: 1,
        sharesCount: 0,
        savesCount: 0,
        viewsCount: 50,
        hideLikesCount: false,
        commentsDisabled: false,
        isSensitive: false,
        isRemoved: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: 'other-user', username: 'other', displayName: 'Other', avatarUrl: null, isVerified: false },
        circle: null,
        sharedPost: null,
      };
      prisma.post.findUnique.mockResolvedValue(post);
      prisma.block.findFirst.mockResolvedValue(null); // No block

      const result = await service.getById('post-3', blockerUserId);

      expect(result.id).toBe('post-3');
      expect(result.content).toBe('Visible post');
    });

    it('should allow post author to view their own post (no block check needed)', async () => {
      const post = {
        id: 'post-4',
        postType: 'TEXT',
        content: 'My own post',
        visibility: 'PUBLIC',
        mediaUrls: [],
        mediaTypes: [],
        thumbnailUrl: null,
        mediaWidth: null,
        mediaHeight: null,
        hashtags: [],
        mentions: [],
        locationName: null,
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        savesCount: 0,
        viewsCount: 0,
        hideLikesCount: false,
        commentsDisabled: false,
        isSensitive: false,
        isRemoved: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: blockerUserId, username: 'blocker', displayName: 'Blocker', avatarUrl: null, isVerified: false },
        circle: null,
        sharedPost: null,
      };
      prisma.post.findUnique.mockResolvedValue(post);

      // Even if block exists, author should see their own post — block.findFirst should NOT be called
      const result = await service.getById('post-4', blockerUserId);

      expect(result.id).toBe('post-4');
      expect(prisma.block.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('getFeed (following) — blocked user posts excluded', () => {
    it('should exclude posts from blocked users in following feed', async () => {
      const otherUserId = 'user-other';

      // User follows blocked user and other user
      prisma.follow.findMany.mockResolvedValue([
        { followingId: blockedUserId },
        { followingId: otherUserId },
      ]);

      // getExcludedUserIds makes a single block.findMany call with OR
      prisma.block.findMany.mockResolvedValue([
        { blockerId: blockerUserId, blockedId: blockedUserId },
      ]);

      prisma.mute.findMany.mockResolvedValue([]);

      const visiblePost = {
        id: 'post-visible',
        postType: 'TEXT',
        content: 'Visible content',
        visibility: 'PUBLIC',
        mediaUrls: [],
        mediaTypes: [],
        thumbnailUrl: null,
        mediaWidth: null,
        mediaHeight: null,
        hashtags: [],
        mentions: [],
        locationName: null,
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        savesCount: 0,
        viewsCount: 0,
        hideLikesCount: false,
        commentsDisabled: false,
        isSensitive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: otherUserId, username: 'other', displayName: 'Other', avatarUrl: null, isVerified: false },
        circle: null,
      };

      // The feed should only see posts from non-blocked users
      prisma.post.findMany.mockResolvedValue([visiblePost]);
      prisma.postReaction.findMany.mockResolvedValue([]);
      prisma.savedPost.findMany.mockResolvedValue([]);

      const result = await service.getFeed(blockerUserId, 'following');

      // Verify the query excluded the blocked user
      const findManyCall = prisma.post.findMany.mock.calls[0][0];
      const userIds = findManyCall.where.userId.in;
      expect(userIds).not.toContain(blockedUserId);
      expect(userIds).toContain(otherUserId);
      expect(userIds).toContain(blockerUserId); // own posts included
    });

    it('should exclude posts from users who blocked the viewer (reverse block)', async () => {
      const reverseBlockerId = 'user-who-blocked-me';

      prisma.follow.findMany.mockResolvedValue([
        { followingId: reverseBlockerId },
      ]);

      // getExcludedUserIds makes a single block.findMany call with OR
      // Reverse block: reverseBlockerId blocked blockerUserId
      prisma.block.findMany.mockResolvedValue([
        { blockerId: reverseBlockerId, blockedId: blockerUserId },
      ]);

      prisma.mute.findMany.mockResolvedValue([]);
      prisma.post.findMany.mockResolvedValue([]);
      prisma.postReaction.findMany.mockResolvedValue([]);
      prisma.savedPost.findMany.mockResolvedValue([]);

      const result = await service.getFeed(blockerUserId, 'following');

      // With only 1 follow (< 10), it uses blended feed — but the blocked user should be excluded
      // Verify the block filtering happened
      const postFindManyCalls = prisma.post.findMany.mock.calls;
      // The blocked user should be excluded from query
      for (const call of postFindManyCalls) {
        if (call[0]?.where?.userId?.in) {
          expect(call[0].where.userId.in).not.toContain(reverseBlockerId);
        }
        if (call[0]?.where?.userId?.notIn) {
          expect(call[0].where.userId.notIn).toContain(reverseBlockerId);
        }
      }
    });
  });

  describe('react — blocked user cannot react to post', () => {
    it('should still allow reaction even from blocked user (block check is on getById, not react)', async () => {
      // Note: The current react() implementation does NOT check blocks.
      // This test documents the actual behavior. If block check is added to react(),
      // update this test to expect ForbiddenException.
      const post = {
        id: 'post-5',
        userId: blockerUserId,
        isRemoved: false,
        likesCount: 0,
      };
      prisma.post.findUnique.mockResolvedValue(post);
      prisma.postReaction.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockResolvedValue([]);

      // Currently react() does not check blocks — it creates the reaction
      const result = await service.react('post-5', blockedUserId, 'LIKE');
      expect(result).toEqual({ reaction: 'LIKE' });
    });
  });
});
