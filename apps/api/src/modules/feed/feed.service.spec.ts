import { Test } from '@nestjs/testing';
import { FeedService } from './feed.service';
import { PrismaService } from '../../config/prisma.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('FeedService', () => {
  let service: FeedService;
  let prisma: Record<string, any>;
  beforeEach(async () => {
    prisma = { feedInteraction: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() }, feedDismissal: { upsert: jest.fn(), findMany: jest.fn(), delete: jest.fn() }, $queryRawUnsafe: jest.fn().mockResolvedValue([]) };
    const module = await Test.createTestingModule({ providers: [
        ...globalMockProviders,FeedService, { provide: PrismaService, useValue: prisma }] }).compile();
    service = module.get(FeedService);
  });
  it('logs interaction', async () => {
    prisma.feedInteraction.findFirst.mockResolvedValue(null);
    prisma.feedInteraction.create.mockResolvedValue({ id: 'fi1' });
    await service.logInteraction('u1', { postId: 'p1', space: 'SAF', viewed: true });
    expect(prisma.feedInteraction.create).toHaveBeenCalled();
  });
  it('dismisses content', async () => {
    prisma.feedDismissal.upsert.mockResolvedValue({});
    await service.dismiss('u1', 'p1', 'post');
    expect(prisma.feedDismissal.upsert).toHaveBeenCalled();
  });
  it('returns dismissed IDs', async () => {
    prisma.feedDismissal.findMany.mockResolvedValue([{ contentId: 'p1' }]);
    const ids = await service.getDismissedIds('u1', 'post');
    expect(ids).toEqual(['p1']);
  });

  describe('getNearbyContent', () => {
    beforeEach(() => {
      (prisma as any).post = {
        findMany: jest.fn(),
      };
    });

    it('should return location-tagged posts', async () => {
      const mockPosts = [
        { id: 'p1', content: 'Near me', locationName: 'Mosque Street', createdAt: new Date(), user: { id: 'u1', username: 'user1' } },
        { id: 'p2', content: 'Nearby cafe', locationName: 'Halal Cafe', createdAt: new Date(), user: { id: 'u2', username: 'user2' } },
      ];
      (prisma as any).post.findMany.mockResolvedValue(mockPosts);

      const result = await service.getNearbyContent(40.7128, -74.006, 25);
      expect(result.data).toHaveLength(2);
      expect(result.meta.hasMore).toBe(false);
      expect((prisma as any).post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ locationName: { not: null } }),
          take: 20,
        }),
      );
    });

    it('should paginate with cursor', async () => {
      const twentyPosts = Array.from({ length: 20 }, (_, i) => ({
        id: `p${i}`,
        content: `Post ${i}`,
        locationName: `Location ${i}`,
        createdAt: new Date(Date.now() - i * 60000),
        user: { id: 'u1', username: 'user1' },
      }));
      (prisma as any).post.findMany.mockResolvedValue(twentyPosts);

      const result = await service.getNearbyContent(40.7128, -74.006, 25);
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.cursor).toBeDefined();
    });

    it('should return empty data when no posts found', async () => {
      (prisma as any).post.findMany.mockResolvedValue([]);

      const result = await service.getNearbyContent(0, 0, 10);
      expect(result.data).toHaveLength(0);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('logInteraction — update existing', () => {
    it('should update existing interaction', async () => {
      prisma.feedInteraction.findFirst.mockResolvedValue({ id: 'fi-existing' });
      prisma.feedInteraction.update.mockResolvedValue({ id: 'fi-existing', liked: true });
      await service.logInteraction('u1', { postId: 'p1', space: 'SAF', liked: true });
      expect(prisma.feedInteraction.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'fi-existing' },
      }));
    });
  });

  describe('undismiss', () => {
    it('should undismiss content', async () => {
      prisma.feedDismissal.delete = jest.fn().mockResolvedValue({});
      const result = await service.undismiss('u1', 'p1', 'post');
      expect(result).toEqual({ undismissed: true });
    });
  });

  describe('getUserInterests', () => {
    beforeEach(() => {
      (prisma as any).post = { findMany: jest.fn().mockResolvedValue([]) };
    });

    it('should compute interest scores by space and hashtag', async () => {
      prisma.feedInteraction.findMany = jest.fn().mockResolvedValue([
        { space: 'SAF', viewDurationMs: 30000, liked: true, commented: false, shared: false, saved: false, postId: 'p1' },
        { space: 'SAF', viewDurationMs: 10000, liked: false, commented: true, shared: false, saved: false, postId: 'p2' },
        { space: 'MAJLIS', viewDurationMs: 5000, liked: false, commented: false, shared: true, saved: false, postId: 'p3' },
      ]);
      (prisma as any).post.findMany.mockResolvedValue([
        { id: 'p1', hashtags: ['quran'] },
        { id: 'p2', hashtags: ['islam'] },
        { id: 'p3', hashtags: [] },
      ]);
      const result = await service.getUserInterests('u1');
      expect(result.bySpace.SAF).toBeGreaterThan(0);
      expect(result.bySpace.MAJLIS).toBeGreaterThan(0);
      expect(result.byHashtag.quran).toBeGreaterThan(0);
    });

    it('should return empty scores for no interactions', async () => {
      prisma.feedInteraction.findMany = jest.fn().mockResolvedValue([]);
      const result = await service.getUserInterests('u1');
      expect(result.bySpace).toEqual({});
      expect(result.byHashtag).toEqual({});
    });
  });

  describe('getContentFilter', () => {
    beforeEach(() => {
      (prisma as any).contentFilterSetting = { findUnique: jest.fn() };
    });

    it('should return content filter settings', async () => {
      (prisma as any).contentFilterSetting.findUnique.mockResolvedValue({ userId: 'u1', hideMusic: true, strictnessLevel: 'strict' });
      const result = await service.getContentFilter('u1');
      expect(result.hideMusic).toBe(true);
    });

    it('should return null when no settings', async () => {
      (prisma as any).contentFilterSetting.findUnique.mockResolvedValue(null);
      const result = await service.getContentFilter('u1');
      expect(result).toBeNull();
    });
  });

  describe('featurePost', () => {
    beforeEach(() => {
      (prisma as any).post = { findMany: jest.fn(), update: jest.fn() };
    });

    it('should feature a post', async () => {
      (prisma as any).post.update.mockResolvedValue({ id: 'p1', isFeatured: true, featuredAt: new Date() });
      const result = await service.featurePost('p1', true);
      expect(result.isFeatured).toBe(true);
    });

    it('should unfeature a post', async () => {
      (prisma as any).post.update.mockResolvedValue({ id: 'p1', isFeatured: false, featuredAt: null });
      const result = await service.featurePost('p1', false);
      expect(result.isFeatured).toBe(false);
    });
  });

  describe('getUserFollowingCount', () => {
    beforeEach(() => {
      (prisma as any).follow = { count: jest.fn() };
    });

    it('should return follow count', async () => {
      (prisma as any).follow.count.mockResolvedValue(42);
      const result = await service.getUserFollowingCount('u1');
      expect(result).toBe(42);
    });
  });

  describe('getTrendingFeed — block/mute filtering', () => {
    beforeEach(() => {
      (prisma as any).post = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).block = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).mute = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).contentFilterSetting = { findUnique: jest.fn().mockResolvedValue(null) };
    });

    it('should filter blocked/muted users when authenticated', async () => {
      (prisma as any).block.findMany.mockResolvedValue([
        { blockerId: 'u1', blockedId: 'bad-user' },
      ]);
      (prisma as any).mute.findMany.mockResolvedValue([{ mutedId: 'muted-user' }]);

      await service.getTrendingFeed(undefined, 20, 'u1');

      expect((prisma as any).block.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ blockerId: 'u1' }, { blockedId: 'u1' }] },
        }),
      );
      expect((prisma as any).post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user: expect.objectContaining({
              id: { notIn: ['bad-user', 'muted-user'] },
            }),
          }),
        }),
      );
    });

    it('should not filter when no userId', async () => {
      await service.getTrendingFeed(undefined, 20);
      expect((prisma as any).block.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getFeaturedFeed — block/mute + scheduledAt', () => {
    beforeEach(() => {
      (prisma as any).post = { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() };
      (prisma as any).block = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).mute = { findMany: jest.fn().mockResolvedValue([]) };
    });

    it('should include scheduledAt: null and filter blocked users when authenticated', async () => {
      (prisma as any).block.findMany.mockResolvedValue([{ blockerId: 'u1', blockedId: 'blocked1' }]);
      (prisma as any).mute.findMany.mockResolvedValue([]);

      await service.getFeaturedFeed(undefined, 20, 'u1');

      expect((prisma as any).post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            scheduledAt: null,
            user: expect.objectContaining({
              id: { notIn: ['blocked1'] },
            }),
          }),
        }),
      );
    });
  });

  describe('featurePost — admin guard', () => {
    beforeEach(() => {
      (prisma as any).post = { findMany: jest.fn(), update: jest.fn() };
      (prisma as any).user = { findUnique: jest.fn(), findMany: jest.fn() };
    });

    it('should allow admin to feature a post', async () => {
      (prisma as any).user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      (prisma as any).post.update.mockResolvedValue({ id: 'p1', isFeatured: true, featuredAt: new Date() });

      const result = await service.featurePost('p1', true, 'admin-user');
      expect(result.isFeatured).toBe(true);
    });

    it('should reject non-admin users', async () => {
      (prisma as any).user.findUnique.mockResolvedValue({ role: 'USER' });

      await expect(service.featurePost('p1', true, 'regular-user')).rejects.toThrow('Admin access required');
      expect((prisma as any).post.update).not.toHaveBeenCalled();
    });
  });

  describe('getSuggestedUsers — block/mute filtering', () => {
    beforeEach(() => {
      (prisma as any).user = { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() };
      (prisma as any).follow = { findMany: jest.fn().mockResolvedValue([]), count: jest.fn() };
      (prisma as any).block = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).mute = { findMany: jest.fn().mockResolvedValue([]) };
    });

    it('should exclude blocked/muted users from suggestions', async () => {
      (prisma as any).block.findMany.mockResolvedValue([{ blockerId: 'u1', blockedId: 'bad1' }]);
      (prisma as any).mute.findMany.mockResolvedValue([{ mutedId: 'muted1' }]);
      (prisma as any).follow.findMany.mockResolvedValue([]);

      await service.getSuggestedUsers('u1', 5);

      expect((prisma as any).user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { notIn: expect.arrayContaining(['u1', 'bad1', 'muted1']) },
          }),
        }),
      );
    });
  });

  describe('getFrequentCreators — block/mute filtering', () => {
    beforeEach(() => {
      (prisma as any).feedInteraction = {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      };
      (prisma as any).user = { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() };
      (prisma as any).block = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).mute = { findMany: jest.fn().mockResolvedValue([]) };
    });

    it('should exclude blocked creators from frequent list', async () => {
      // Mock interactions with a blocked creator
      (prisma as any).feedInteraction.findMany.mockResolvedValue(
        Array.from({ length: 15 }, (_, i) => ({
          post: { userId: 'blocked-creator' },
        })),
      );
      (prisma as any).block.findMany.mockResolvedValue([{ blockerId: 'u1', blockedId: 'blocked-creator' }]);
      (prisma as any).mute.findMany.mockResolvedValue([]);

      const result = await service.getFrequentCreators('u1');
      expect(result).toEqual([]);
    });
  });
});