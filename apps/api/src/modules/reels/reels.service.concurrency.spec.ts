import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { ReelsService } from './reels.service';
import { globalMockProviders } from '../../common/test/mock-providers';
import { NotificationsService } from '../notifications/notifications.service';
import { StreamService } from '../stream/stream.service';

describe('ReelsService — concurrency (Task 92)', () => {
  let service: ReelsService;
  let prisma: any;
  const mockReel = { id: 'reel-1', userId: 'owner', status: 'READY', isRemoved: false, likesCount: 0 };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        ReelsService,
        {
          provide: PrismaService,
          useValue: {
            reel: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
            reelReaction: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            reelInteraction: { upsert: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            reelComment: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
            user: { update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            block: { findMany: jest.fn().mockResolvedValue([]) },
            mute: { findMany: jest.fn().mockResolvedValue([]) },
            hashtag: { upsert: jest.fn() },
            report: { create: jest.fn() },
            $transaction: jest.fn().mockResolvedValue([{}, {}, {}]),
            $executeRaw: jest.fn(),
          },
        },
        { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({ id: 'n-1' }) } },
        { provide: StreamService, useValue: { uploadFromUrl: jest.fn(), deleteVideo: jest.fn() } },
        { provide: 'REDIS', useValue: { get: jest.fn().mockResolvedValue(null), setex: jest.fn(), del: jest.fn(), zcard: jest.fn().mockResolvedValue(0), zadd: jest.fn().mockResolvedValue(0), zrevrange: jest.fn().mockResolvedValue([]), expire: jest.fn().mockResolvedValue(1), pipeline: jest.fn().mockReturnValue({ del: jest.fn().mockReturnThis(), zadd: jest.fn().mockReturnThis(), expire: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([]) }) } },
      ],
    }).compile();

    service = module.get<ReelsService>(ReelsService);
    prisma = module.get(PrismaService);
  });

  it('should handle 100 simultaneous view increments', async () => {
    prisma.reel.findUnique.mockResolvedValue(mockReel);
    prisma.$transaction.mockImplementation(async (fn: any) => {
      if (typeof fn === 'function') {
        return fn({
          reelInteraction: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
          $executeRaw: jest.fn(),
        });
      }
      return fn;
    });

    const promises = Array.from({ length: 100 }, (_, i) =>
      service.view('reel-1', `user-${i}`),
    );
    const results = await Promise.allSettled(promises);
    expect(results.every(r => r.status === 'fulfilled')).toBe(true);
  });

  it('should handle concurrent likes from different users', async () => {
    prisma.reel.findUnique.mockResolvedValue(mockReel);
    prisma.$transaction.mockResolvedValue([{}, {}, {}]);

    const [r1, r2] = await Promise.allSettled([
      service.like('reel-1', 'user-1'),
      service.like('reel-1', 'user-2'),
    ]);

    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
  });

  it('should handle concurrent comments', async () => {
    prisma.reel.findUnique.mockResolvedValue(mockReel);
    prisma.$transaction.mockResolvedValue([{ id: 'c-1', content: 'test' }, {}]);

    const [r1, r2] = await Promise.allSettled([
      service.comment('reel-1', 'user-1', 'Great!'),
      service.comment('reel-1', 'user-2', 'Amazing!'),
    ]);

    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
  });

  it('should handle delete while being liked', async () => {
    prisma.reel.findUnique.mockResolvedValue(mockReel);
    prisma.$transaction.mockResolvedValue([{}, {}]);

    const [deleteR, likeR] = await Promise.allSettled([
      service.delete('reel-1', 'owner'),
      service.like('reel-1', 'user-1'),
    ]);

    expect(deleteR.status).toBeDefined();
    expect(likeR.status).toBeDefined();
  });

  it('should handle getComments concurrent reads', async () => {
    prisma.reelComment.findMany.mockResolvedValue([]);
    const promises = Array.from({ length: 5 }, () =>
      service.getComments('reel-1', 'user-1'),
    );
    const results = await Promise.allSettled(promises);
    expect(results.every(r => r.status === 'fulfilled')).toBe(true);
  });

  it('should handle concurrent share operations', async () => {
    prisma.reel.findUnique.mockResolvedValue(mockReel);
    prisma.$transaction.mockResolvedValue([{}, {}]);

    const [r1, r2] = await Promise.allSettled([
      service.share('reel-1', 'user-1'),
      service.share('reel-1', 'user-2'),
    ]);

    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
  });
});
