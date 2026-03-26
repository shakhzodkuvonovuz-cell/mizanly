import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { StoriesService } from './stories.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('StoriesService', () => {
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
            follow: {
              findMany: jest.fn(),
            },
            story: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            storyView: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              upsert: jest.fn().mockResolvedValue({}),
            },
            user: {
              findMany: jest.fn(),
              findUnique: jest.fn().mockResolvedValue({ isPrivate: false }),
            },
            block: {
              findMany: jest.fn().mockResolvedValue([]),
              findFirst: jest.fn(),
            },
            mute: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            restrict: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            storyHighlightAlbum: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              count: jest.fn(),
            },
            conversation: {
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            message: {
              create: jest.fn(),
            },
            storyStickerResponse: {
              findFirst: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn(),
              update: jest.fn(),
            },
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
            $queryRaw: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<StoriesService>(StoriesService);
    prisma = module.get(PrismaService) as any;
  });

  describe('getFeedStories', () => {
    it('should return grouped stories with view status', async () => {
      const userId = 'user-123';
      const mockFollows = [{ followingId: 'user-456' }];
      const mockStories = [
        {
          id: 'story-1',
          userId: 'user-123',
          mediaUrl: 'url1',
          mediaType: 'IMAGE',
          thumbnailUrl: null,
          duration: null,
          textOverlay: null,
          textColor: null,
          bgColor: null,
          viewsCount: 0,
          repliesCount: 0,
          isHighlight: false,
          highlightName: null,
          highlightAlbumId: null,
          stickerData: null,
          closeFriendsOnly: false,
          isArchived: false,
          expiresAt: new Date(Date.now() + 86400000),
          createdAt: new Date(),
          user: {
            id: 'user-123',
            username: 'user123',
            displayName: 'User 123',
            avatarUrl: null,
            isVerified: false,
          },
        },
        {
          id: 'story-2',
          userId: 'user-456',
          mediaUrl: 'url2',
          mediaType: 'VIDEO',
          thumbnailUrl: 'thumb',
          duration: 10,
          textOverlay: null,
          textColor: null,
          bgColor: null,
          viewsCount: 5,
          repliesCount: 0,
          isHighlight: false,
          highlightName: null,
          highlightAlbumId: null,
          stickerData: null,
          closeFriendsOnly: false,
          isArchived: false,
          expiresAt: new Date(Date.now() + 86400000),
          createdAt: new Date(),
          user: {
            id: 'user-456',
            username: 'user456',
            displayName: 'User 456',
            avatarUrl: null,
            isVerified: false,
          },
        },
      ];
      const mockViews = [{ storyId: 'story-1' }];

      prisma.follow.findMany.mockResolvedValue(mockFollows);
      prisma.story.findMany.mockResolvedValue(mockStories);
      prisma.storyView.findMany.mockResolvedValue(mockViews);

      const result = await service.getFeedStories(userId);

      expect(prisma.follow.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { followerId: userId },
        select: { followingId: true },
      }));
      expect(prisma.story.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          userId: { in: ['user-123', 'user-456'] },
          expiresAt: { gt: expect.any(Date) },
          isArchived: false,
          user: { isBanned: false, isDeactivated: false, isDeleted: false },
        },
        select: expect.any(Object),
        orderBy: { createdAt: 'desc' },
        take: 100,
      }));
      expect(prisma.storyView.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { viewerId: userId, storyId: { in: ['story-1', 'story-2'] } },
        select: { storyId: true },
      }));
      // Expect result to have groups
      expect(result).toHaveLength(2);
      expect(result[0].user.id).toBe('user-123');
      expect(result[0].hasUnread).toBe(false); // story-1 viewed
      expect(result[1].user.id).toBe('user-456');
      expect(result[1].hasUnread).toBe(true); // story-2 not viewed
    });

    it('should exclude blocked, muted, and restricted users from stories feed', async () => {
      const userId = 'user-123';
      prisma.follow.findMany.mockResolvedValue([
        { followingId: 'blocked-user' },
        { followingId: 'muted-user' },
        { followingId: 'restricted-user' },
        { followingId: 'normal-user' },
      ]);
      prisma.block.findMany.mockResolvedValue([
        { blockerId: userId, blockedId: 'blocked-user' },
      ]);
      prisma.mute.findMany.mockResolvedValue([
        { mutedId: 'muted-user' },
      ]);
      prisma.restrict.findMany.mockResolvedValue([
        { restrictedId: 'restricted-user' },
      ]);
      prisma.story.findMany.mockResolvedValue([]);
      prisma.storyView.findMany.mockResolvedValue([]);

      await service.getFeedStories(userId);

      // The story query should NOT include blocked/muted/restricted user IDs
      const storyCall = prisma.story.findMany.mock.calls[0][0];
      const queriedUserIds = storyCall.where.userId.in;
      expect(queriedUserIds).toContain(userId); // own stories always included
      expect(queriedUserIds).toContain('normal-user');
      expect(queriedUserIds).not.toContain('blocked-user');
      expect(queriedUserIds).not.toContain('muted-user');
      expect(queriedUserIds).not.toContain('restricted-user');
    });

    it('should exclude users who blocked the current user from stories feed', async () => {
      const userId = 'user-123';
      prisma.follow.findMany.mockResolvedValue([
        { followingId: 'reverse-blocker' },
      ]);
      prisma.block.findMany.mockResolvedValue([
        { blockerId: 'reverse-blocker', blockedId: userId }, // reverse block
      ]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.restrict.findMany.mockResolvedValue([]);
      prisma.story.findMany.mockResolvedValue([]);
      prisma.storyView.findMany.mockResolvedValue([]);

      await service.getFeedStories(userId);

      const storyCall = prisma.story.findMany.mock.calls[0][0];
      const queriedUserIds = storyCall.where.userId.in;
      expect(queriedUserIds).not.toContain('reverse-blocker');
    });
  });

  describe('create', () => {
    it('should create story with 24h expiry', async () => {
      const userId = 'user-123';
      const data = {
        mediaUrl: 'https://example.com/story.jpg',
        mediaType: 'IMAGE',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        duration: undefined,
        textOverlay: 'Hello',
        textColor: '#FFFFFF',
        bgColor: '#000000',
        stickerData: { type: 'emoji' },
        closeFriendsOnly: false,
      };
      const mockStory = {
        id: 'story-999',
        ...data,
        userId,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        user: {
          id: userId,
          username: 'user123',
          displayName: 'User 123',
          avatarUrl: null,
          isVerified: false,
        },
      };
      prisma.story.create.mockResolvedValue(mockStory);

      const result = await service.create(userId, data);

      expect(prisma.story.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            mediaUrl: data.mediaUrl,
            mediaType: data.mediaType,
            closeFriendsOnly: data.closeFriendsOnly,
            subscribersOnly: false,
            expiresAt: expect.any(Date),
          }),
        }),
      );
      expect(result).toEqual(mockStory);
    });
  });

  describe('getById', () => {
    it('should return story if found and not expired', async () => {
      const storyId = 'story-123';
      const mockStory = { id: storyId, mediaUrl: 'url', userId: 'user-1', isArchived: false, expiresAt: new Date(Date.now() + 86400000), user: { id: 'user-1' } };
      prisma.story.findUnique.mockResolvedValue(mockStory);

      const result = await service.getById(storyId, 'viewer-1');

      expect(prisma.story.findUnique).toHaveBeenCalledWith({
        where: { id: storyId },
      });
      expect(result).toEqual(mockStory);
    });

    it('should throw NotFoundException for expired story viewed by non-owner', async () => {
      const storyId = 'story-123';
      const mockStory = { id: storyId, userId: 'user-1', isArchived: false, expiresAt: new Date(Date.now() - 86400000) };
      prisma.story.findUnique.mockResolvedValue(mockStory);

      await expect(service.getById(storyId, 'viewer-1')).rejects.toThrow(NotFoundException);
    });

    it('should return expired story to owner', async () => {
      const storyId = 'story-123';
      const mockStory = { id: storyId, userId: 'user-1', isArchived: false, expiresAt: new Date(Date.now() - 86400000) };
      prisma.story.findUnique.mockResolvedValue(mockStory);

      const result = await service.getById(storyId, 'user-1');
      expect(result).toEqual(mockStory);
    });

    it('should throw NotFoundException if story not found', async () => {
      prisma.story.findUnique.mockResolvedValue(null);

      await expect(service.getById('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should archive story if user is owner', async () => {
      const storyId = 'story-123';
      const userId = 'user-123';
      const mockStory = { id: storyId, userId, isArchived: false };
      prisma.story.findUnique.mockResolvedValue(mockStory);
      prisma.story.update.mockResolvedValue({ ...mockStory, isArchived: true });

      const result = await service.delete(storyId, userId);

      expect(prisma.story.findUnique).toHaveBeenCalledWith({ where: { id: storyId } });
      expect(prisma.story.update).toHaveBeenCalledWith({
        where: { id: storyId },
        data: { isArchived: true },
      });
      expect(result).toEqual({ archived: true });
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      const storyId = 'story-123';
      const userId = 'user-123';
      const mockStory = { id: storyId, userId: 'different-user', isArchived: false };
      prisma.story.findUnique.mockResolvedValue(mockStory);

      await expect(service.delete(storyId, userId)).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when not found', async () => {
      prisma.story.findUnique.mockResolvedValue(null);
      await expect(service.delete('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('markViewed', () => {
    it('should create view and increment count if not already viewed', async () => {
      const storyId = 'story-123';
      const viewerId = 'user-456';
      const mockStory = { id: storyId, userId: 'owner' };
      prisma.story.findUnique.mockResolvedValue(mockStory);
      prisma.storyView.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.markViewed(storyId, viewerId);

      expect(prisma.story.findUnique).toHaveBeenCalledWith({ where: { id: storyId } });
      expect(prisma.storyView.findUnique).toHaveBeenCalledWith({
        where: { storyId_viewerId: { storyId, viewerId } },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual({ viewed: true });
    });

    it('should skip if already viewed', async () => {
      const storyId = 'story-123';
      const viewerId = 'user-456';
      const mockStory = { id: storyId, userId: 'owner' };
      const mockView = { storyId, viewerId };
      prisma.story.findUnique.mockResolvedValue(mockStory);
      prisma.storyView.findUnique.mockResolvedValue(mockView);

      const result = await service.markViewed(storyId, viewerId);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result).toEqual({ viewed: true });
    });

    it('should throw NotFoundException when story not found', async () => {
      prisma.story.findUnique.mockResolvedValue(null);
      await expect(service.markViewed('nonexistent', 'viewer-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create with subscribersOnly', () => {
    it('should create story with subscribersOnly flag', async () => {
      const userId = 'user-123';
      const data = {
        mediaUrl: 'https://example.com/story.jpg',
        mediaType: 'IMAGE',
        subscribersOnly: true,
      };
      const mockStory = {
        id: 'story-sub',
        ...data,
        userId,
        closeFriendsOnly: false,
        subscribersOnly: true,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        user: { id: userId, username: 'user123', displayName: 'User 123', avatarUrl: null, isVerified: false },
      };
      prisma.story.create.mockResolvedValue(mockStory);

      const result = await service.create(userId, data as any);
      expect(prisma.story.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ subscribersOnly: true }),
        }),
      );
      expect(result.subscribersOnly).toBe(true);
    });

    it('should default subscribersOnly to false', async () => {
      const data = { mediaUrl: 'https://example.com/story.jpg', mediaType: 'IMAGE' };
      prisma.story.create.mockResolvedValue({ id: 'story-default', ...data, subscribersOnly: false, closeFriendsOnly: false });

      await service.create('user-1', data as any);
      expect(prisma.story.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ subscribersOnly: false }),
        }),
      );
    });
  });

  describe('getViewers', () => {
    it('should return viewers for story owner', async () => {
      prisma.story.findUnique.mockResolvedValue({ id: 'story-1', userId: 'user-1' });
      prisma.storyView.findMany.mockResolvedValue([
        { viewerId: 'v1', createdAt: new Date() },
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'v1', username: 'viewer', displayName: 'Viewer', avatarUrl: null, isVerified: false },
      ]);

      const result = await service.getViewers('story-1', 'user-1');
      expect(result.data).toHaveLength(1);
    });

    it('should throw ForbiddenException for non-owner', async () => {
      prisma.story.findUnique.mockResolvedValue({ id: 'story-1', userId: 'other' });
      await expect(service.getViewers('story-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getHighlights', () => {
    it('should return user highlights', async () => {
      prisma.storyHighlightAlbum.findMany.mockResolvedValue([
        { id: 'hl-1', title: 'Travel', stories: [{ id: 'story-1' }] },
      ]);
      const result = await service.getHighlights('user-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('createHighlight', () => {
    it('should create highlight album', async () => {
      prisma.storyHighlightAlbum.create.mockResolvedValue({ id: 'hl-1', title: 'Travel' });
      const result = await service.createHighlight('user-1', 'Travel');
      expect(result.title).toBe('Travel');
    });
  });

  describe('deleteHighlight', () => {
    it('should delete highlight for owner', async () => {
      prisma.storyHighlightAlbum.findUnique.mockResolvedValue({ id: 'hl-1', userId: 'user-1' });
      prisma.storyHighlightAlbum.delete.mockResolvedValue({});
      const result = await service.deleteHighlight('hl-1', 'user-1');
      expect(result).toEqual({ deleted: true });
    });

    it('should throw ForbiddenException for non-owner', async () => {
      prisma.storyHighlightAlbum.findUnique.mockResolvedValue({ id: 'hl-1', userId: 'other' });
      await expect(service.deleteHighlight('hl-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getArchived', () => {
    it('should return archived stories', async () => {
      prisma.story.findMany.mockResolvedValue([{ id: 'story-1', isArchived: true }]);
      const result = await service.getArchived('user-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('unarchive', () => {
    it('should unarchive story for owner', async () => {
      prisma.story.findUnique.mockResolvedValue({ id: 'story-1', userId: 'user-1', isArchived: true });
      prisma.story.update.mockResolvedValue({});
      const result = await service.unarchive('story-1', 'user-1');
      expect(result).toEqual({ unarchived: true });
    });

    it('should throw ForbiddenException for non-owner', async () => {
      prisma.story.findUnique.mockResolvedValue({ id: 'story-1', userId: 'other' });
      await expect(service.unarchive('story-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });
});