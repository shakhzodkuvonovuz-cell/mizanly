import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { PostsService } from './posts.service';
import { globalMockProviders } from '../../common/test/mock-providers';
import { NotificationsService } from '../notifications/notifications.service';

describe('PostsService — edge cases', () => {
  let service: PostsService;
  let prisma: any;
  let redis: any;

  const userId = 'user-edge-1';

  const mockPost = {
    id: 'post-1',
    userId,
    postType: 'TEXT',
    content: 'test',
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
    user: { id: userId, username: 'testuser', displayName: 'Test', avatarUrl: null, isVerified: false },
    circle: null,
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
            post: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
              findMany: jest.fn(),
              count: jest.fn(),
            },
            postReaction: {
              create: jest.fn(),
              update: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              delete: jest.fn(),
            },
            follow: { findMany: jest.fn() },
            block: { findMany: jest.fn() },
            mute: { findMany: jest.fn() },
            hashtag: { upsert: jest.fn() },
            user: { update: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
            comment: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              findMany: jest.fn(),
            },
            commentReaction: {
              create: jest.fn(),
              delete: jest.fn(),
              findUnique: jest.fn(),
            },
            savedPost: {
              create: jest.fn(),
              delete: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              upsert: jest.fn(),
            },
            feedDismissal: { upsert: jest.fn() },
            report: { create: jest.fn() },
            circleMember: { findMany: jest.fn().mockResolvedValue([]) },
            restrict: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
        {
          provide: NotificationsService,
          useValue: { create: jest.fn(), notifyLike: jest.fn(), notifyComment: jest.fn() },
        },
        {
          provide: 'REDIS',
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue('OK'),
            setex: jest.fn().mockResolvedValue('OK'),
            del: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
    prisma = module.get(PrismaService);
    redis = module.get('REDIS');
  });

  describe('create — input edge cases', () => {
    it('should handle Arabic content with RTL markers and hashtags', async () => {
      const arabicContent = 'بسم الله الرحمن الرحيم \u200F #حديث @user';

      prisma.$transaction.mockImplementation(async (cb: any) => {
        if (typeof cb === 'function') {
          return cb(prisma);
        }
        return cb;
      });
      prisma.post.create.mockResolvedValue({
        ...mockPost,
        content: arabicContent,
        hashtags: ['حديث'],
        mentions: ['user'],
      });
      prisma.user.update.mockResolvedValue({});
      prisma.hashtag.upsert.mockResolvedValue({});

      const result = await service.create(userId, {
        postType: 'TEXT',
        content: arabicContent,
        mentions: ['user'],
      });

      expect(result.content).toBeDefined();
      expect(prisma.post.create).toHaveBeenCalled();
    });

    it('should accept content at exactly 2000 characters (DTO max)', async () => {
      const maxContent = 'a'.repeat(2000);

      prisma.$transaction.mockImplementation(async (cb: any) => {
        if (typeof cb === 'function') return cb(prisma);
        return cb;
      });
      prisma.post.create.mockResolvedValue({ ...mockPost, content: maxContent });
      prisma.user.update.mockResolvedValue({});

      const result = await service.create(userId, {
        postType: 'TEXT',
        content: maxContent,
      });

      // Service should not reject at 2000 — DTO validation handles max length
      expect(result).toBeDefined();
      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
          }),
        }),
      );
    });

    it('should handle content with ONLY emoji characters', async () => {
      const emojiContent = '🕌🤲📿🌙⭐';

      prisma.$transaction.mockImplementation(async (cb: any) => {
        if (typeof cb === 'function') return cb(prisma);
        return cb;
      });
      prisma.post.create.mockResolvedValue({ ...mockPost, content: emojiContent });
      prisma.user.update.mockResolvedValue({});

      const result = await service.create(userId, {
        postType: 'TEXT',
        content: emojiContent,
      });

      expect(result).toBeDefined();
      expect(prisma.post.create).toHaveBeenCalled();
    });

    it('should handle content with zero-width characters (sanitized by sanitizeText)', async () => {
      const zwContent = 'Hello\u200B\u200C\u200D\uFEFF World';

      prisma.$transaction.mockImplementation(async (cb: any) => {
        if (typeof cb === 'function') return cb(prisma);
        return cb;
      });
      // sanitizeText strips null bytes and control chars but not zero-width chars
      // (zero-width chars are valid unicode, not control chars)
      prisma.post.create.mockResolvedValue({ ...mockPost, content: zwContent });
      prisma.user.update.mockResolvedValue({});

      const result = await service.create(userId, {
        postType: 'TEXT',
        content: zwContent,
      });

      expect(result).toBeDefined();
      expect(prisma.post.create).toHaveBeenCalled();
    });

    it('should strip null bytes from content via sanitizeText', async () => {
      const nullContent = 'hello\x00world';

      prisma.$transaction.mockImplementation(async (cb: any) => {
        if (typeof cb === 'function') return cb(prisma);
        return cb;
      });
      prisma.post.create.mockResolvedValue({ ...mockPost, content: 'helloworld' });
      prisma.user.update.mockResolvedValue({});

      await service.create(userId, {
        postType: 'TEXT',
        content: nullContent,
      });

      // Verify sanitizeText was applied — content passed to create should NOT contain null bytes
      const createCall = prisma.post.create.mock.calls[0][0];
      expect(createCall.data.content).not.toContain('\x00');
    });

    it('should strip HTML tags from content via sanitizeText', async () => {
      const htmlContent = '<script>alert("xss")</script>Hello';

      prisma.$transaction.mockImplementation(async (cb: any) => {
        if (typeof cb === 'function') return cb(prisma);
        return cb;
      });
      prisma.post.create.mockResolvedValue({ ...mockPost, content: 'Hello' });
      prisma.user.update.mockResolvedValue({});

      await service.create(userId, {
        postType: 'TEXT',
        content: htmlContent,
      });

      const createCall = prisma.post.create.mock.calls[0][0];
      // sanitizeText replaces /<[^>]*>/g with '' — so HTML is stripped
      expect(createCall.data.content).not.toContain('<script>');
      expect(createCall.data.content).not.toContain('</script>');
    });
  });

  describe('getFeed — limit edge cases', () => {
    beforeEach(() => {
      prisma.follow.findMany.mockResolvedValue([
        { followingId: 'u1' }, { followingId: 'u2' }, { followingId: 'u3' },
        { followingId: 'u4' }, { followingId: 'u5' }, { followingId: 'u6' },
        { followingId: 'u7' }, { followingId: 'u8' }, { followingId: 'u9' },
        { followingId: 'u10' },
      ]);
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.post.findMany.mockResolvedValue([]);
      prisma.postReaction.findMany.mockResolvedValue([]);
      prisma.savedPost.findMany.mockResolvedValue([]);
    });

    it('should return empty data when limit = 0', async () => {
      // With limit=0, findMany take=1 (0+1), returns empty since no posts
      const result = await service.getFeed(userId, 'following', undefined, 0);

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should throw or return empty when limit is negative (-1)', async () => {
      // With limit=-1, take=0, Prisma returns empty. But hasMore=(0>-1)=true,
      // then items is empty (slice 0, -1 = []), and items[items.length-1] is undefined.
      // This is a real edge case: negative limit causes TypeError.
      // Document the actual behavior: it throws a TypeError.
      await expect(service.getFeed(userId, 'following', undefined, -1))
        .rejects.toThrow(TypeError);
    });

    it('should handle very large limit (999999) — findMany still fetches', async () => {
      // The service uses take: limit + 1 directly; no explicit capping
      const result = await service.getFeed(userId, 'following', undefined, 999999);

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      // Verify it called findMany (didn't crash)
      expect(prisma.post.findMany).toHaveBeenCalled();
    });

    it('should handle cursor pointing to non-existent post gracefully', async () => {
      prisma.post.findMany.mockResolvedValue([]);

      const result = await service.getFeed(userId, 'following', 'not-a-valid-id');

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.meta.hasMore).toBe(false);
    });
  });
});
