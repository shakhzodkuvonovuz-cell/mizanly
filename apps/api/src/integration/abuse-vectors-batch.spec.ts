/**
 * Batch abuse vector tests — Tasks 101-110
 * Tests that the app can't be exploited by malicious users.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { globalMockProviders } from '../common/test/mock-providers';
import { CommunitiesService } from '../modules/communities/communities.service';
import { ChannelsService } from '../modules/channels/channels.service';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { BookmarksService } from '../modules/bookmarks/bookmarks.service';

describe('Abuse Vectors — batch tests (Tasks 101-110)', () => {
  // ── Task 104: Hashtag abuse ──
  // Already covered in hashtags.service.edge.spec.ts

  // ── Task 102: Community/Group chat abuse ──
  describe('CommunitiesService — community abuse', () => {
    let service: CommunitiesService;
    let prisma: any;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders,
          CommunitiesService,
          {
            provide: PrismaService,
            useValue: {
              circle: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn() },
              circleMember: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
              circleRole: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn() },
              $transaction: jest.fn(),
            },
          },
        ],
      }).compile();

      service = module.get(CommunitiesService);
      prisma = module.get(PrismaService);
    });

    it('should throw NotFoundException when non-member tries to join non-existent community', async () => {
      prisma.circle.findUnique.mockResolvedValue(null);
      await expect(service.join('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when leaving non-existent community', async () => {
      prisma.circle.findUnique.mockResolvedValue(null);
      await expect(service.leave('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when non-owner tries to update community', async () => {
      prisma.circle.findUnique.mockResolvedValue({ id: 'c-1', ownerId: 'owner' });
      await expect(service.update('c-1', 'attacker', {} as any)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when non-owner tries to delete community', async () => {
      prisma.circle.findUnique.mockResolvedValue({ id: 'c-1', ownerId: 'owner' });
      await expect(service.delete('c-1', 'attacker')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── Task 109: Channel subscription abuse ──
  describe('ChannelsService — subscription abuse', () => {
    let service: ChannelsService;
    let prisma: any;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders,
          ChannelsService,
          {
            provide: PrismaService,
            useValue: {
              channel: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn() },
              subscription: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(), count: jest.fn().mockResolvedValue(0) },
              video: { findMany: jest.fn().mockResolvedValue([]) },
              $transaction: jest.fn().mockResolvedValue([{}, {}]),
              $executeRaw: jest.fn(),
            },
          },
          { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({ id: 'n-1' }) } },
          { provide: 'REDIS', useValue: { get: jest.fn().mockResolvedValue(null), setex: jest.fn(), del: jest.fn() } },
        ],
      }).compile();

      service = module.get(ChannelsService);
      prisma = module.get(PrismaService);
    });

    it('should throw BadRequestException for self-subscribe', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch-1', userId: 'user-1' });
      await expect(service.subscribe('test', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException for duplicate subscribe', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch-1', userId: 'other-user' });
      prisma.subscription.findUnique.mockResolvedValue({ userId: 'user-1' });
      await expect(service.subscribe('test', 'user-1')).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException for subscribing to non-existent channel', async () => {
      prisma.channel.findUnique.mockResolvedValue(null);
      await expect(service.subscribe('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for unsubscribing from non-existent channel', async () => {
      prisma.channel.findUnique.mockResolvedValue(null);
      await expect(service.unsubscribe('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ── Task 110: Bookmarks abuse ──
  describe('BookmarksService — bookmark abuse', () => {
    let service: BookmarksService;
    let prisma: any;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders,
          BookmarksService,
          {
            provide: PrismaService,
            useValue: {
              savedPost: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(), update: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
              threadBookmark: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
              videoBookmark: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
              post: { findUnique: jest.fn(), update: jest.fn() },
              thread: { findUnique: jest.fn(), update: jest.fn() },
              video: { findUnique: jest.fn() },
              $transaction: jest.fn(),
              $executeRaw: jest.fn(),
            },
          },
        ],
      }).compile();

      service = module.get(BookmarksService);
      prisma = module.get(PrismaService);
    });

    it('should throw NotFoundException when saving non-existent post', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(service.savePost('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should only query own bookmarks', async () => {
      const result = await service.getSavedPosts('user-1');
      expect(prisma.savedPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-1' }) }),
      );
    });

    it('should return false for non-saved post check', async () => {
      prisma.savedPost.findUnique.mockResolvedValue(null);
      const result = await service.isPostSaved('user-1', 'post-1');
      expect(result.saved).toBe(false);
    });

    it('should return false for non-saved thread check', async () => {
      prisma.threadBookmark.findUnique.mockResolvedValue(null);
      const result = await service.isThreadSaved('user-1', 'thread-1');
      expect(result.saved).toBe(false);
    });
  });
});
