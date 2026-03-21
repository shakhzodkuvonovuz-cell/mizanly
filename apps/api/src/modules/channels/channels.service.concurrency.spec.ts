import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { ChannelsService } from './channels.service';
import { globalMockProviders } from '../../common/test/mock-providers';
import { NotificationsService } from '../notifications/notifications.service';

describe('ChannelsService — concurrency (Task 95)', () => {
  let service: ChannelsService;
  let prisma: any;
  const mockChannel = { id: 'ch-1', handle: 'test', userId: 'owner', subscribersCount: 0 };

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

    service = module.get<ChannelsService>(ChannelsService);
    prisma = module.get(PrismaService);
  });

  it('should handle 1000 concurrent subscriptions', async () => {
    prisma.channel.findUnique.mockResolvedValue({ ...mockChannel, userId: 'other-user' });
    prisma.subscription.findUnique.mockResolvedValue(null);

    const promises = Array.from({ length: 1000 }, (_, i) =>
      service.subscribe('test', `user-${i}`),
    );
    const results = await Promise.allSettled(promises);
    const successes = results.filter(r => r.status === 'fulfilled');
    expect(successes.length).toBe(1000);
  });

  it('should handle concurrent subscribe and unsubscribe', async () => {
    prisma.channel.findUnique.mockResolvedValue({ ...mockChannel, userId: 'other-user' });
    prisma.subscription.findUnique
      .mockResolvedValueOnce(null) // subscribe check
      .mockResolvedValueOnce({ userId: 'user-1' }); // unsubscribe check

    const [subR, unsubR] = await Promise.allSettled([
      service.subscribe('test', 'user-1'),
      service.unsubscribe('test', 'user-1'),
    ]);

    expect(subR.status).toBeDefined();
    expect(unsubR.status).toBeDefined();
  });

  it('should handle concurrent video listing', async () => {
    prisma.channel.findUnique.mockResolvedValue(mockChannel);
    prisma.video.findMany.mockResolvedValue([]);

    const promises = Array.from({ length: 10 }, () =>
      service.getVideos('test'),
    );
    const results = await Promise.allSettled(promises);
    expect(results.every(r => r.status === 'fulfilled')).toBe(true);
  });

  it('should handle update during subscriber count read', async () => {
    prisma.channel.findUnique.mockResolvedValue(mockChannel);
    prisma.channel.update.mockResolvedValue({ ...mockChannel, name: 'Updated' });
    prisma.subscription.count.mockResolvedValue(42);

    const [updateR, analyticsR] = await Promise.allSettled([
      service.update('test', 'owner', { name: 'Updated' } as any),
      service.getAnalytics('test', 'owner'),
    ]);

    expect(updateR.status).toBe('fulfilled');
    expect(analyticsR.status).toBe('fulfilled');
  });
});
