import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { StoriesService } from './stories.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('StoriesService — 24-Hour Expiry', () => {
  let service: StoriesService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        StoriesService,
        {
          provide: PrismaService,
          useValue: {
            story: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn(),
              update: jest.fn().mockResolvedValue({}),
              delete: jest.fn(),
            },
            storyView: {
              findUnique: jest.fn().mockResolvedValue(null),
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn().mockResolvedValue({}),
              upsert: jest.fn().mockReturnValue({ catch: jest.fn() }),
            },
            storyHighlightAlbum: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              count: jest.fn().mockResolvedValue(0),
            },
            storyStickerResponse: {
              findFirst: jest.fn().mockResolvedValue(null),
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn(),
              update: jest.fn(),
            },
            follow: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            block: {
              findFirst: jest.fn().mockResolvedValue(null),
              findMany: jest.fn().mockResolvedValue([]),
            },
            mute: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            restrict: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            conversation: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn(),
              update: jest.fn(),
            },
            message: {
              create: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            $transaction: jest.fn().mockImplementation(async (arr: unknown) => {
              return Promise.all(arr as Promise<unknown>[]);
            }),
            $queryRaw: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<StoriesService>(StoriesService);
    prisma = module.get(PrismaService) as any;
  });

  describe('getFeedStories — expired stories filtered from feed', () => {
    it('should only query stories where expiresAt > now', async () => {
      const userId = 'user-1';
      prisma.follow.findMany.mockResolvedValue([
        { followingId: 'user-2' },
      ]);
      prisma.story.findMany.mockResolvedValue([]);
      prisma.storyView.findMany.mockResolvedValue([]);

      await service.getFeedStories(userId);

      const queryArgs = prisma.story.findMany.mock.calls[0][0];
      expect(queryArgs.where.expiresAt).toEqual({ gt: expect.any(Date) });

      // The "gt" date should be approximately "now"
      const filterDate = queryArgs.where.expiresAt.gt as Date;
      const now = new Date();
      const diffMs = Math.abs(now.getTime() - filterDate.getTime());
      expect(diffMs).toBeLessThan(5000); // within 5 seconds of now
    });

    it('should not include archived stories in feed', async () => {
      const userId = 'user-1';
      prisma.follow.findMany.mockResolvedValue([]);
      prisma.story.findMany.mockResolvedValue([]);
      prisma.storyView.findMany.mockResolvedValue([]);

      await service.getFeedStories(userId);

      const queryArgs = prisma.story.findMany.mock.calls[0][0];
      expect(queryArgs.where.isArchived).toBe(false);
    });

    it('should include stories from followed users and self', async () => {
      const userId = 'user-1';
      prisma.follow.findMany.mockResolvedValue([
        { followingId: 'user-2' },
        { followingId: 'user-3' },
      ]);
      prisma.story.findMany.mockResolvedValue([]);
      prisma.storyView.findMany.mockResolvedValue([]);

      await service.getFeedStories(userId);

      const queryArgs = prisma.story.findMany.mock.calls[0][0];
      const userIds = queryArgs.where.userId.in;
      expect(userIds).toContain('user-1'); // self
      expect(userIds).toContain('user-2');
      expect(userIds).toContain('user-3');
    });

    it('should group stories by user and mark unread status', async () => {
      const userId = 'user-viewer';
      prisma.follow.findMany.mockResolvedValue([
        { followingId: 'user-author' },
      ]);

      const mockStories = [
        {
          id: 'story-1',
          userId: 'user-author',
          mediaUrl: 'https://example.com/img1.jpg',
          mediaType: 'image/jpeg',
          closeFriendsOnly: false,
          subscribersOnly: false,
          expiresAt: new Date(Date.now() + 20 * 60 * 60 * 1000),
          createdAt: new Date(),
          user: { id: 'user-author', username: 'author', displayName: 'Author', avatarUrl: null, isVerified: false },
        },
        {
          id: 'story-2',
          userId: 'user-author',
          mediaUrl: 'https://example.com/img2.jpg',
          mediaType: 'image/jpeg',
          closeFriendsOnly: false,
          subscribersOnly: false,
          expiresAt: new Date(Date.now() + 20 * 60 * 60 * 1000),
          createdAt: new Date(),
          user: { id: 'user-author', username: 'author', displayName: 'Author', avatarUrl: null, isVerified: false },
        },
      ];
      prisma.story.findMany.mockResolvedValue(mockStories);

      // Viewer has seen story-1 but not story-2
      prisma.storyView.findMany.mockResolvedValue([{ storyId: 'story-1' }]);

      const result = await service.getFeedStories(userId);

      expect(result.length).toBe(1); // One user group
      expect(result[0].stories).toHaveLength(2);
      expect(result[0].hasUnread).toBe(true); // story-2 is unseen
    });
  });

  describe('create — story sets correct expiresAt (24 hours)', () => {
    it('should set expiresAt to exactly 24 hours from creation', async () => {
      const userId = 'user-1';
      const beforeCreate = Date.now();

      const mockCreatedStory = {
        id: 'story-new',
        userId,
        mediaUrl: 'https://example.com/story.jpg',
        mediaType: 'image/jpeg',
        expiresAt: new Date(beforeCreate + 24 * 60 * 60 * 1000),
        createdAt: new Date(beforeCreate),
        user: { id: userId, username: 'user1', displayName: 'User', avatarUrl: null, isVerified: false },
      };
      prisma.story.create.mockResolvedValue(mockCreatedStory);

      await service.create(userId, {
        mediaUrl: 'https://example.com/story.jpg',
        mediaType: 'image/jpeg',
      });

      const createCall = prisma.story.create.mock.calls[0][0];
      const expiresAt = createCall.data.expiresAt as Date;
      const afterCreate = Date.now();

      // expiresAt should be ~24 hours from now
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;
      const lowerBound = beforeCreate + twentyFourHoursMs;
      const upperBound = afterCreate + twentyFourHoursMs;

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(lowerBound);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(upperBound);
    });

    it('should pass closeFriendsOnly and subscribersOnly flags', async () => {
      const userId = 'user-1';
      prisma.story.create.mockResolvedValue({
        id: 'story-cf',
        userId,
        closeFriendsOnly: true,
        subscribersOnly: false,
        user: { id: userId, username: 'user1', displayName: 'User', avatarUrl: null, isVerified: false },
      });

      await service.create(userId, {
        mediaUrl: 'https://example.com/story.jpg',
        mediaType: 'image/jpeg',
        closeFriendsOnly: true,
        subscribersOnly: false,
      });

      const createCall = prisma.story.create.mock.calls[0][0];
      expect(createCall.data.closeFriendsOnly).toBe(true);
      expect(createCall.data.subscribersOnly).toBe(false);
    });

    it('should default closeFriendsOnly and subscribersOnly to false', async () => {
      const userId = 'user-1';
      prisma.story.create.mockResolvedValue({
        id: 'story-default',
        userId,
        user: { id: userId, username: 'user1', displayName: 'User', avatarUrl: null, isVerified: false },
      });

      await service.create(userId, {
        mediaUrl: 'https://example.com/story.jpg',
        mediaType: 'image/jpeg',
      });

      const createCall = prisma.story.create.mock.calls[0][0];
      expect(createCall.data.closeFriendsOnly).toBe(false);
      expect(createCall.data.subscribersOnly).toBe(false);
    });
  });

  describe('getById — expired story access denied for non-owner', () => {
    it('should throw NotFoundException for expired story viewed by non-owner', async () => {
      const expiredStory = {
        id: 'story-expired',
        userId: 'user-author',
        expiresAt: new Date(Date.now() - 60 * 60 * 1000), // expired 1 hour ago
        isArchived: false,
      };
      prisma.story.findUnique.mockResolvedValue(expiredStory);

      await expect(
        service.getById('story-expired', 'user-viewer'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should allow owner to view their expired story', async () => {
      const expiredStory = {
        id: 'story-expired-own',
        userId: 'user-author',
        expiresAt: new Date(Date.now() - 60 * 60 * 1000), // expired 1 hour ago
        isArchived: false,
      };
      prisma.story.findUnique.mockResolvedValue(expiredStory);

      // Owner should be able to see their own expired story
      const result = await service.getById('story-expired-own', 'user-author');
      expect(result.id).toBe('story-expired-own');
    });

    it('should allow viewing a non-expired story', async () => {
      const activeStory = {
        id: 'story-active',
        userId: 'user-author',
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // expires in 12 hours
        isArchived: false,
      };
      prisma.story.findUnique.mockResolvedValue(activeStory);

      const result = await service.getById('story-active', 'user-viewer');
      expect(result.id).toBe('story-active');
    });

    it('should throw NotFoundException for archived story viewed by non-owner', async () => {
      const archivedStory = {
        id: 'story-archived',
        userId: 'user-author',
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
        isArchived: true,
      };
      prisma.story.findUnique.mockResolvedValue(archivedStory);

      await expect(
        service.getById('story-archived', 'user-viewer'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('markViewed — expired story rejection', () => {
    it('should reject viewing an expired story', async () => {
      const expiredStory = {
        id: 'story-expired-view',
        userId: 'user-author',
        expiresAt: new Date(Date.now() - 60 * 1000), // expired 1 minute ago
        isArchived: false,
      };
      prisma.story.findUnique.mockResolvedValue(expiredStory);

      await expect(
        service.markViewed('story-expired-view', 'user-viewer'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.markViewed('story-expired-view', 'user-viewer'),
      ).rejects.toThrow('Story has expired');
    });

    it('should reject viewing an archived story', async () => {
      const archivedStory = {
        id: 'story-archived-view',
        userId: 'user-author',
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
        isArchived: true,
      };
      prisma.story.findUnique.mockResolvedValue(archivedStory);

      await expect(
        service.markViewed('story-archived-view', 'user-viewer'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.markViewed('story-archived-view', 'user-viewer'),
      ).rejects.toThrow('Story is archived');
    });

    it('should increment viewsCount on first view', async () => {
      const activeStory = {
        id: 'story-first-view',
        userId: 'user-author',
        expiresAt: new Date(Date.now() + 20 * 60 * 60 * 1000),
        isArchived: false,
      };
      prisma.story.findUnique.mockResolvedValue(activeStory);
      prisma.storyView.findUnique.mockResolvedValue(null); // Not yet viewed

      const result = await service.markViewed('story-first-view', 'user-viewer');

      // $transaction is called with an array of Prisma client calls
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      // Verify storyView.create was called with correct data
      expect(prisma.storyView.create).toHaveBeenCalledWith({
        data: { storyId: 'story-first-view', viewerId: 'user-viewer' },
      });

      // Verify story.update was called with viewsCount increment
      expect(prisma.story.update).toHaveBeenCalledWith({
        where: { id: 'story-first-view' },
        data: { viewsCount: { increment: 1 } },
      });

      expect(result).toEqual({ viewed: true });
    });

    it('should not increment viewsCount on repeated view', async () => {
      const activeStory = {
        id: 'story-repeat-view',
        userId: 'user-author',
        expiresAt: new Date(Date.now() + 20 * 60 * 60 * 1000),
        isArchived: false,
      };
      prisma.story.findUnique.mockResolvedValue(activeStory);
      prisma.storyView.findUnique.mockResolvedValue({
        storyId: 'story-repeat-view',
        viewerId: 'user-viewer',
      }); // Already viewed

      const result = await service.markViewed('story-repeat-view', 'user-viewer');

      // Should NOT call $transaction for duplicate view
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result).toEqual({ viewed: true });
    });
  });
});
