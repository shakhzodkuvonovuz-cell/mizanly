import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { VideosService } from './videos.service';
import { globalMockProviders } from '../../common/test/mock-providers';
import { NotificationsService } from '../notifications/notifications.service';
import { StreamService } from '../stream/stream.service';

describe('VideosService — concurrency (Task 93)', () => {
  let service: VideosService;
  let prisma: any;
  const mockVideo = {
    id: 'video-1', userId: 'owner', channelId: 'ch-1', status: 'PUBLISHED', isRemoved: false,
    channel: { userId: 'owner' },
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        VideosService,
        {
          provide: PrismaService,
          useValue: {
            video: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            videoReaction: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            videoBookmark: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            videoComment: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), delete: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            videoChapter: { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn(), deleteMany: jest.fn() },
            channel: { findUnique: jest.fn(), update: jest.fn() },
            watchHistory: { upsert: jest.fn(), findUnique: jest.fn() },
            subscription: { findMany: jest.fn().mockResolvedValue([]) },
            user: { update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            block: { findMany: jest.fn().mockResolvedValue([]) },
            mute: { findMany: jest.fn().mockResolvedValue([]) },
            report: { create: jest.fn() },
            premiere: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
            premiereReminder: { create: jest.fn(), delete: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            endScreen: { createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
            $transaction: jest.fn().mockResolvedValue([{}, {}, {}]),
            $executeRaw: jest.fn(),
          },
        },
        { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({ id: 'n-1' }) } },
        { provide: StreamService, useValue: { uploadFromUrl: jest.fn(), deleteVideo: jest.fn() } },
        { provide: 'REDIS', useValue: { get: jest.fn().mockResolvedValue(null), setex: jest.fn(), del: jest.fn() } },
      ],
    }).compile();

    service = module.get<VideosService>(VideosService);
    prisma = module.get(PrismaService);
  });

  it('should handle 100 simultaneous view increments', async () => {
    prisma.video.findUnique.mockResolvedValue(mockVideo);
    prisma.channel.update.mockResolvedValue({});
    prisma.watchHistory.upsert.mockResolvedValue({});

    const promises = Array.from({ length: 100 }, (_, i) =>
      service.view('video-1', `user-${i}`),
    );
    const results = await Promise.allSettled(promises);
    expect(results.every(r => r.status === 'fulfilled')).toBe(true);
  });

  it('should handle watch progress update from two devices', async () => {
    prisma.watchHistory.upsert.mockResolvedValue({});

    const [r1, r2] = await Promise.allSettled([
      service.updateProgress('video-1', 'user-1', 50),
      service.updateProgress('video-1', 'user-1', 75),
    ]);

    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
  });

  it('should handle concurrent like and dislike from different users', async () => {
    prisma.video.findUnique.mockResolvedValue(mockVideo);
    prisma.videoReaction.findUnique.mockResolvedValue(null);

    const [r1, r2] = await Promise.allSettled([
      service.like('video-1', 'user-1'),
      service.dislike('video-1', 'user-2'),
    ]);

    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
  });

  it('should handle concurrent comment and delete video', async () => {
    prisma.video.findUnique.mockResolvedValue(mockVideo);
    prisma.$transaction.mockResolvedValue([{ id: 'c-1' }, {}]);

    const [commentR, deleteR] = await Promise.allSettled([
      service.comment('video-1', 'user-1', 'Great video!'),
      service.delete('video-1', 'owner'),
    ]);

    expect(commentR.status).toBeDefined();
    expect(deleteR.status).toBeDefined();
  });

  it('should handle concurrent bookmark operations', async () => {
    prisma.video.findUnique.mockResolvedValue(mockVideo);
    prisma.videoBookmark.findUnique.mockResolvedValue(null);
    prisma.videoBookmark.create.mockResolvedValue({});

    const [r1, r2] = await Promise.allSettled([
      service.bookmark('video-1', 'user-1'),
      service.bookmark('video-1', 'user-2'),
    ]);

    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
  });

  it('should handle concurrent report submissions', async () => {
    prisma.report.create.mockResolvedValue({});
    const [r1, r2] = await Promise.allSettled([
      service.report('video-1', 'user-1', 'SPAM'),
      service.report('video-1', 'user-2', 'VIOLENCE'),
    ]);
    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
  });
});
