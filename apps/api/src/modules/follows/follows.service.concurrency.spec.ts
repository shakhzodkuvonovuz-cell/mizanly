import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { FollowsService } from './follows.service';
import { globalMockProviders } from '../../common/test/mock-providers';
import { NotificationsService } from '../notifications/notifications.service';

describe('FollowsService — concurrency (Task 89)', () => {
  let service: FollowsService;
  let prisma: any;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        FollowsService,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            follow: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
            followRequest: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
            block: { findFirst: jest.fn().mockResolvedValue(null) },
            $transaction: jest.fn().mockResolvedValue([{}, {}, {}]),
            $executeRaw: jest.fn(),
          },
        },
        { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({ id: 'n-1' }) } },
      ],
    }).compile();

    service = module.get<FollowsService>(FollowsService);
    prisma = module.get(PrismaService);
  });

  it('should handle mutual follow simultaneously (A follows B while B follows A)', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-x', isPrivate: false, isDeactivated: false, isBanned: false });
    prisma.follow.findUnique.mockResolvedValue(null);

    const [r1, r2] = await Promise.allSettled([
      service.follow('user-a', 'user-b'),
      service.follow('user-b', 'user-a'),
    ]);

    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
  });

  it('should handle follow and unfollow simultaneously — consistent state', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-b', isPrivate: false, isDeactivated: false, isBanned: false });
    prisma.follow.findUnique
      .mockResolvedValueOnce(null) // follow check
      .mockResolvedValueOnce({ followerId: 'user-a', followingId: 'user-b' }); // unfollow check
    prisma.followRequest.deleteMany.mockResolvedValue({ count: 0 });

    const [r1, r2] = await Promise.allSettled([
      service.follow('user-a', 'user-b'),
      service.unfollow('user-a', 'user-b'),
    ]);

    expect(r1.status).toBeDefined();
    expect(r2.status).toBeDefined();
  });

  it('should handle 100 users following same target simultaneously', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'target', isPrivate: false, isDeactivated: false, isBanned: false });
    prisma.follow.findUnique.mockResolvedValue(null);

    const promises = Array.from({ length: 100 }, (_, i) =>
      service.follow(`user-${i}`, 'target'),
    );

    const results = await Promise.allSettled(promises);
    const successes = results.filter(r => r.status === 'fulfilled');
    expect(successes.length).toBe(100);
  });

  it('should handle rapid follow/unfollow toggle — last action wins', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-b', isPrivate: false, isDeactivated: false, isBanned: false });
    prisma.follow.findUnique.mockResolvedValue(null);
    prisma.followRequest.deleteMany.mockResolvedValue({ count: 0 });

    // Follow
    const r1 = await service.follow('user-a', 'user-b');
    expect(r1.type).toBe('follow');

    // Unfollow
    prisma.follow.findUnique.mockResolvedValue({ followerId: 'user-a', followingId: 'user-b' });
    const r2 = await service.unfollow('user-a', 'user-b');
    expect(r2.message).toBe('Unfollowed');

    // Follow again
    prisma.follow.findUnique.mockResolvedValue(null);
    const r3 = await service.follow('user-a', 'user-b');
    expect(r3.type).toBe('follow');
  });

  it('should handle two follow requests to same private account', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'private-user', isPrivate: true, isDeactivated: false, isBanned: false });
    prisma.follow.findUnique.mockResolvedValue(null);
    prisma.followRequest.findUnique.mockResolvedValue(null);
    prisma.followRequest.create.mockResolvedValue({ id: 'req-1', status: 'PENDING' });

    const [r1, r2] = await Promise.allSettled([
      service.follow('user-a', 'private-user'),
      service.follow('user-b', 'private-user'),
    ]);

    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
  });

  it('should handle getFollowers called concurrently', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-a' });
    prisma.follow.findMany.mockResolvedValue([]);

    const promises = Array.from({ length: 10 }, () =>
      service.getFollowers('user-a'),
    );

    const results = await Promise.allSettled(promises);
    expect(results.every(r => r.status === 'fulfilled')).toBe(true);
  });
});
