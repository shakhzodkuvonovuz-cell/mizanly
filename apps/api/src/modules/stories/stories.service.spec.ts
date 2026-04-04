import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { StoriesService } from './stories.service';
import { ContentSafetyService } from '../moderation/content-safety.service';
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
              updateMany: jest.fn(),
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
              upsert: jest.fn(),
            },
            report: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn(),
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

  // --- R2 Tab4 Part 2: Story text moderation tests (X08-#14) ---

  describe('create story text moderation', () => {
    let contentSafety: any;

    beforeEach(() => {
      contentSafety = service['contentSafety'];
    });

    it('should moderate textOverlay content on story creation', async () => {
      contentSafety.moderateText.mockClear();
      contentSafety.moderateText.mockResolvedValue({ safe: true, flags: [] });
      prisma.story.create.mockResolvedValue({
        id: 'story-new', userId: 'user-1', mediaUrl: 'https://media.mizanly.app/test.jpg',
        textOverlay: 'Bismillah', user: { id: 'user-1', username: 'test', displayName: 'Test', avatarUrl: null, isVerified: false },
      });
      prisma.user.findMany.mockResolvedValue([]);

      await service.create('user-1', {
        mediaUrl: 'https://media.mizanly.app/test.jpg',
        mediaType: 'image',
        textOverlay: 'Bismillah',
      });

      expect(contentSafety.moderateText).toHaveBeenCalledWith('Bismillah');
      expect(prisma.story.create).toHaveBeenCalled();
    });

    it('should reject story creation when textOverlay is flagged', async () => {
      contentSafety.moderateText.mockClear();
      contentSafety.moderateText.mockResolvedValue({ safe: false, flags: ['hate_speech'] });

      await expect(
        service.create('user-1', {
          mediaUrl: 'https://media.mizanly.app/test.jpg',
          mediaType: 'image',
          textOverlay: 'hate speech text',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.story.create).not.toHaveBeenCalled();
    });

    it('should moderate stickerData content on story creation', async () => {
      contentSafety.moderateText.mockClear();
      contentSafety.moderateText.mockResolvedValue({ safe: true, flags: [] });
      prisma.story.create.mockResolvedValue({
        id: 'story-new', userId: 'user-1', mediaUrl: 'https://media.mizanly.app/test.jpg',
        stickerData: { question: 'What is your fav surah?' },
        user: { id: 'user-1', username: 'test', displayName: 'Test', avatarUrl: null, isVerified: false },
      });
      prisma.user.findMany.mockResolvedValue([]);

      await service.create('user-1', {
        mediaUrl: 'https://media.mizanly.app/test.jpg',
        mediaType: 'image',
        stickerData: { question: 'What is your fav surah?' },
      });

      expect(contentSafety.moderateText).toHaveBeenCalledWith(
        expect.stringContaining('What is your fav surah?'),
      );
    });

    it('should skip moderation when no text content', async () => {
      contentSafety.moderateText.mockClear();
      prisma.story.create.mockResolvedValue({
        id: 'story-new', userId: 'user-1', mediaUrl: 'https://media.mizanly.app/test.jpg',
        user: { id: 'user-1', username: 'test', displayName: 'Test', avatarUrl: null, isVerified: false },
      });
      prisma.user.findMany.mockResolvedValue([]);

      await service.create('user-1', {
        mediaUrl: 'https://media.mizanly.app/test.jpg',
        mediaType: 'image',
      });

      expect(contentSafety.moderateText).not.toHaveBeenCalled();
      expect(prisma.story.create).toHaveBeenCalled();
    });
  });

  // ── W7-T1 T07: replyToStory() (C severity, 97 lines completely untested) ──
  describe('replyToStory', () => {
    const mockStory = { id: 's1', userId: 'owner-1', isArchived: false, expiresAt: new Date(Date.now() + 86400000) };

    beforeEach(() => {
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => fn(prisma));
    });

    it('should throw NotFoundException for nonexistent story', async () => {
      prisma.story.findUnique.mockResolvedValue(null);
      await expect(service.replyToStory('missing', 'u1', 'hi')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for archived story', async () => {
      prisma.story.findUnique.mockResolvedValue({ ...mockStory, isArchived: true });
      await expect(service.replyToStory('s1', 'u1', 'hi')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for expired story', async () => {
      prisma.story.findUnique.mockResolvedValue({ ...mockStory, expiresAt: new Date('2020-01-01') });
      await expect(service.replyToStory('s1', 'u1', 'hi')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for self-reply', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory);
      await expect(service.replyToStory('s1', 'owner-1', 'hi')).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException when blocked', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory);
      prisma.block.findFirst.mockResolvedValue({ id: 'block-1' });
      await expect(service.replyToStory('s1', 'blocked-user', 'hi')).rejects.toThrow(ForbiddenException);
    });

    it('should create DM conversation and message when no existing DM', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory);
      prisma.block.findFirst.mockResolvedValue(null);
      prisma.conversation.findFirst.mockResolvedValue(null);
      const newConvo = { id: 'convo-new' };
      prisma.conversation.create.mockResolvedValue(newConvo);
      const msg = { id: 'msg-1', content: 'hi', messageType: 'STORY_REPLY', sender: { id: 'u1' }, createdAt: new Date() };
      prisma.message.create.mockResolvedValue(msg);
      prisma.story.update.mockResolvedValue({});
      prisma.conversation.update.mockResolvedValue({});

      const result = await service.replyToStory('s1', 'u1', 'hi');

      expect(prisma.conversation.create).toHaveBeenCalled();
      expect(prisma.message.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ messageType: 'STORY_REPLY', conversationId: 'convo-new' }),
      }));
      expect(result.id).toBe('msg-1');
    });

    it('should use existing DM conversation if found', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory);
      prisma.block.findFirst.mockResolvedValue(null);
      const existingConvo = { id: 'convo-existing' };
      prisma.conversation.findFirst.mockResolvedValue(existingConvo);
      const msg = { id: 'msg-2', content: 'reply', messageType: 'STORY_REPLY', sender: { id: 'u1' }, createdAt: new Date() };
      prisma.message.create.mockResolvedValue(msg);
      prisma.story.update.mockResolvedValue({});
      prisma.conversation.update.mockResolvedValue({});

      const result = await service.replyToStory('s1', 'u1', 'reply');

      expect(prisma.conversation.create).not.toHaveBeenCalled();
      expect(result.id).toBe('msg-2');
    });
  });

  // ── W7-T1 T07: getReactionSummary() (H severity) ──
  describe('getReactionSummary', () => {
    it('should throw NotFoundException for nonexistent story', async () => {
      prisma.story.findUnique.mockResolvedValue(null);
      await expect(service.getReactionSummary('missing', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for non-owner', async () => {
      prisma.story.findUnique.mockResolvedValue({ id: 's1', userId: 'owner-1' });
      await expect(service.getReactionSummary('s1', 'other')).rejects.toThrow(ForbiddenException);
    });

    it('should return emoji counts from raw query', async () => {
      prisma.story.findUnique.mockResolvedValue({ id: 's1', userId: 'u1' });
      prisma.$queryRaw.mockResolvedValue([
        { emoji: '❤️', count: BigInt(5) },
        { emoji: '😂', count: BigInt(3) },
      ]);

      const result = await service.getReactionSummary('s1', 'u1');

      expect(result).toEqual([
        { emoji: '❤️', count: 5 },
        { emoji: '😂', count: 3 },
      ]);
    });
  });

  // ── W7-T1 T07: createHighlight() 100 limit (M severity) ──
  describe('createHighlight — 100 album limit', () => {
    it('should throw BadRequestException when user already has 100 highlights', async () => {
      prisma.storyHighlightAlbum.count.mockResolvedValue(100);
      await expect(service.createHighlight('u1', 'New Album')).rejects.toThrow(BadRequestException);
    });

    it('should create highlight when under limit', async () => {
      prisma.storyHighlightAlbum.count.mockResolvedValue(5);
      prisma.storyHighlightAlbum.create.mockResolvedValue({ id: 'hl-1', title: 'New' });
      const result = await service.createHighlight('u1', 'New');
      expect(result.id).toBe('hl-1');
    });
  });

  // ── W7-T1 T07: updateHighlight() service-level errors (M severity) ──
  describe('updateHighlight — service-level errors', () => {
    it('should throw NotFoundException for nonexistent album', async () => {
      prisma.storyHighlightAlbum.findUnique.mockResolvedValue(null);
      await expect(service.updateHighlight('missing', 'u1', { title: 'New' })).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for non-owner', async () => {
      prisma.storyHighlightAlbum.findUnique.mockResolvedValue({ id: 'hl-1', userId: 'other' });
      await expect(service.updateHighlight('hl-1', 'u1', { title: 'New' })).rejects.toThrow(ForbiddenException);
    });

    it('should update highlight for owner', async () => {
      prisma.storyHighlightAlbum.findUnique.mockResolvedValue({ id: 'hl-1', userId: 'u1' });
      prisma.storyHighlightAlbum.update.mockResolvedValue({ id: 'hl-1', title: 'Updated' });
      const result = await service.updateHighlight('hl-1', 'u1', { title: 'Updated' });
      expect(result.title).toBe('Updated');
    });
  });

  // ── W7-T1 T07: submitStickerResponse() (M severity) ──
  describe('submitStickerResponse', () => {
    it('should throw NotFoundException for nonexistent story', async () => {
      prisma.story.findUnique.mockResolvedValue(null);
      await expect(service.submitStickerResponse('missing', 'u1', 'emoji' as any, { emoji: '❤️' })).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for archived story', async () => {
      prisma.story.findUnique.mockResolvedValue({ id: 's1', userId: 'owner', isArchived: true });
      await expect(service.submitStickerResponse('s1', 'u1', 'emoji' as any, { emoji: '❤️' })).rejects.toThrow(BadRequestException);
    });

    it('should upsert sticker response for valid story', async () => {
      prisma.story.findUnique.mockResolvedValue({ id: 's1', userId: 'owner', isArchived: false, expiresAt: new Date(Date.now() + 86400000), closeFriendsOnly: false });
      prisma.block.findFirst.mockResolvedValue(null);
      prisma.storyStickerResponse.upsert.mockResolvedValue({ storyId: 's1', stickerType: 'emoji' });

      const result = await service.submitStickerResponse('s1', 'u1', 'emoji' as any, { emoji: '❤️' });

      expect(prisma.storyStickerResponse.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { storyId_userId_stickerType: { storyId: 's1', userId: 'u1', stickerType: 'emoji' } },
      }));
      expect(result.storyId).toBe('s1');
    });
  });

  // ── W7-T1 T07: getStickerResponses() (M severity) ──
  describe('getStickerResponses', () => {
    it('should throw ForbiddenException for non-owner', async () => {
      prisma.story.findUnique.mockResolvedValue({ id: 's1', userId: 'owner' });
      await expect(service.getStickerResponses('s1', 'other')).rejects.toThrow(ForbiddenException);
    });

    it('should return responses for owner with optional stickerType filter', async () => {
      prisma.story.findUnique.mockResolvedValue({ id: 's1', userId: 'u1' });
      prisma.storyStickerResponse.findMany.mockResolvedValue([{ stickerType: 'poll', responseData: {} }]);
      const result = await service.getStickerResponses('s1', 'u1', 'poll' as any);
      expect(prisma.storyStickerResponse.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { storyId: 's1', stickerType: 'poll' },
      }));
      expect(result).toHaveLength(1);
    });
  });

  // ── W7-T1 T07: getStickerSummary() (M severity) ──
  describe('getStickerSummary', () => {
    it('should throw ForbiddenException for non-owner', async () => {
      prisma.story.findUnique.mockResolvedValue({ id: 's1', userId: 'owner' });
      await expect(service.getStickerSummary('s1', 'other')).rejects.toThrow(ForbiddenException);
    });

    it('should aggregate responses by stickerType and answer', async () => {
      prisma.story.findUnique.mockResolvedValue({ id: 's1', userId: 'u1' });
      prisma.storyStickerResponse.findMany.mockResolvedValue([
        { stickerType: 'poll', responseData: { answer: 'Yes' } },
        { stickerType: 'poll', responseData: { answer: 'Yes' } },
        { stickerType: 'poll', responseData: { answer: 'No' } },
        { stickerType: 'quiz', responseData: { answer: 'A' } },
      ]);

      const result = await service.getStickerSummary('s1', 'u1');

      expect(result.poll).toEqual({ Yes: 2, No: 1 });
      expect(result.quiz).toEqual({ A: 1 });
    });
  });

  describe('getHighlightAlbum', () => {
    it('returns album with stories', async () => {
      const mockAlbum = {
        id: 'album1',
        title: 'My Highlights',
        coverUrl: null,
        stories: [
          { id: 's1', mediaUrl: 'url1', mediaType: 'image', thumbnailUrl: null, textOverlay: null, stickerData: null, duration: 5, createdAt: new Date() },
        ],
        user: { id: 'u1', username: 'user1', displayName: 'User 1', avatarUrl: null, isVerified: false },
      };
      prisma.storyHighlightAlbum.findUnique.mockResolvedValue(mockAlbum);

      const result = await service.getHighlightAlbum('album1');
      expect(result.id).toBe('album1');
      expect(result.stories).toHaveLength(1);
      expect(result.user.username).toBe('user1');
    });

    it('throws NotFoundException for non-existent album', async () => {
      prisma.storyHighlightAlbum.findUnique.mockResolvedValue(null);
      await expect(service.getHighlightAlbum('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('reactToStory', () => {
    it('creates emoji reaction via sticker response upsert', async () => {
      const mockStory = { id: 's1', userId: 'owner1', isArchived: false, expiresAt: new Date(Date.now() + 86400000) };
      prisma.story.findUnique.mockResolvedValue(mockStory);
      prisma.block.findFirst.mockResolvedValue(null);
      prisma.storyStickerResponse.upsert.mockResolvedValue({ id: 'resp1', stickerType: 'emoji', responseData: { emoji: '❤️' } });

      const result = await service.reactToStory('s1', 'u1', '❤️');
      expect(result.stickerType).toBe('emoji');
      expect(prisma.storyStickerResponse.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { storyId_userId_stickerType: { storyId: 's1', userId: 'u1', stickerType: 'emoji' } },
      }));
    });

    it('throws NotFoundException for non-existent story', async () => {
      prisma.story.findUnique.mockResolvedValue(null);
      await expect(service.reactToStory('nonexistent', 'u1', '❤️')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for archived story', async () => {
      prisma.story.findUnique.mockResolvedValue({ id: 's1', isArchived: true });
      await expect(service.reactToStory('s1', 'u1', '❤️')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for expired story', async () => {
      prisma.story.findUnique.mockResolvedValue({ id: 's1', isArchived: false, expiresAt: new Date(Date.now() - 86400000) });
      await expect(service.reactToStory('s1', 'u1', '❤️')).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when blocked', async () => {
      prisma.story.findUnique.mockResolvedValue({ id: 's1', userId: 'owner1', isArchived: false, expiresAt: new Date(Date.now() + 86400000) });
      prisma.block.findFirst.mockResolvedValue({ id: 'block1' });
      await expect(service.reactToStory('s1', 'u1', '❤️')).rejects.toThrow(ForbiddenException);
    });
  });
});