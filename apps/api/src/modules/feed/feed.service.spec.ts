import { Test } from '@nestjs/testing';
import { FeedService } from './feed.service';
import { PrismaService } from '../../config/prisma.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('FeedService', () => {
  let service: FeedService;
  let prisma: Record<string, any>;
  beforeEach(async () => {
    prisma = { feedInteraction: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() }, feedDismissal: { upsert: jest.fn(), findMany: jest.fn(), delete: jest.fn() } };
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
});