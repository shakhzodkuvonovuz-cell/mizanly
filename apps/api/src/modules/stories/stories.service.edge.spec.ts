import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { StoriesService } from './stories.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('StoriesService — edge cases', () => {
  let service: StoriesService;
  let prisma: any;

  const userId = 'user-edge-1';

  const mockStory = {
    id: 'story-1',
    userId,
    mediaUrl: 'https://example.com/img.jpg',
    mediaType: 'image/jpeg',
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
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    user: { id: userId, username: 'testuser', displayName: 'Test', avatarUrl: null, isVerified: false },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        StoriesService,
        {
          provide: PrismaService,
          useValue: {
            story: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            storyView: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            storyHighlightAlbum: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn(),
              delete: jest.fn(),
              count: jest.fn().mockResolvedValue(0),
            },
            storyStickerResponse: {
              create: jest.fn(),
              findFirst: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn(),
            },
            follow: { findMany: jest.fn() },
            block: { findFirst: jest.fn() },
            user: { findMany: jest.fn().mockResolvedValue([]) },
            conversation: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
            message: { create: jest.fn() },
            $transaction: jest.fn(),
            $queryRaw: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<StoriesService>(StoriesService);
    prisma = module.get(PrismaService);
  });

  describe('create — input edge cases', () => {
    it('should handle Arabic text overlay', async () => {
      prisma.story.create.mockResolvedValue({
        ...mockStory,
        textOverlay: 'بسم الله الرحمن الرحيم',
      });

      const result = await service.create(userId, {
        mediaUrl: 'https://example.com/img.jpg',
        mediaType: 'image/jpeg',
        textOverlay: 'بسم الله الرحمن الرحيم',
      });

      expect(result.textOverlay).toBe('بسم الله الرحمن الرحيم');
    });
  });

  describe('markViewed — edge cases', () => {
    it('should be idempotent when same user views same story twice', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory);
      // First call — no existing view
      prisma.storyView.findUnique.mockResolvedValueOnce(null);
      prisma.$transaction.mockResolvedValueOnce([{}, {}]);

      const result1 = await service.markViewed('story-1', 'viewer-1');
      expect(result1.viewed).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      // Second call — already viewed
      prisma.storyView.findUnique.mockResolvedValueOnce({ storyId: 'story-1', viewerId: 'viewer-1' });

      const result2 = await service.markViewed('story-1', 'viewer-1');
      expect(result2.viewed).toBe(true);
      // Transaction should NOT be called again (skipped for already-viewed)
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('getViewers — edge cases', () => {
    it('should return empty array for story with 0 views', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory);
      prisma.storyView.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);

      const result = await service.getViewers('story-1', userId);
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('getFeedStories — edge cases', () => {
    it('should return empty result when user follows nobody and has no stories', async () => {
      prisma.follow.findMany.mockResolvedValue([]);
      prisma.story.findMany.mockResolvedValue([]);
      prisma.storyView.findMany.mockResolvedValue([]);

      const result = await service.getFeedStories(userId);
      expect(result).toEqual([]);
    });
  });

  describe('getHighlights — edge cases', () => {
    it('should return empty array for user with 0 highlights', async () => {
      prisma.storyHighlightAlbum.findMany.mockResolvedValue([]);

      const result = await service.getHighlights(userId);
      expect(result).toEqual([]);
    });
  });

  describe('createHighlight — edge cases', () => {
    it('should accept Arabic highlight name', async () => {
      prisma.storyHighlightAlbum.count.mockResolvedValue(0);
      prisma.storyHighlightAlbum.create.mockResolvedValue({
        id: 'album-1',
        userId,
        title: 'أبرز القصص',
        coverUrl: null,
        position: 0,
      });

      const result = await service.createHighlight(userId, 'أبرز القصص');
      expect(result.title).toBe('أبرز القصص');
    });
  });

  describe('addStoryToHighlight — edge cases', () => {
    it('should throw ForbiddenException when user does not own the story', async () => {
      prisma.story.findUnique.mockResolvedValue({ ...mockStory, userId: 'other-user' });
      prisma.storyHighlightAlbum.findUnique.mockResolvedValue({ id: 'album-1', userId });

      await expect(service.addStoryToHighlight('story-1', 'album-1', userId))
        .rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when story does not exist', async () => {
      prisma.story.findUnique.mockResolvedValue(null);
      prisma.storyHighlightAlbum.findUnique.mockResolvedValue({ id: 'album-1', userId });

      await expect(service.addStoryToHighlight('nonexistent', 'album-1', userId))
        .rejects.toThrow(NotFoundException);
    });
  });
});
