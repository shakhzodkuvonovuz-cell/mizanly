import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { VideosService } from './videos.service';
import { globalMockProviders } from '../../common/test/mock-providers';
import { NotificationsService } from '../notifications/notifications.service';
import { StreamService } from '../stream/stream.service';

describe('VideosService — authorization matrix', () => {
  let service: VideosService;
  let prisma: any;
  const userA = 'user-a';
  const userB = 'user-b';
  const mockVideoByA = {
    id: 'video-1', userId: userA, channelId: 'ch-1', status: 'PUBLISHED', isRemoved: false,
    channel: { userId: userA },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
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
            $transaction: jest.fn(),
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

  it('should allow owner to update video', async () => {
    prisma.video.findUnique.mockResolvedValue(mockVideoByA);
    prisma.video.update.mockResolvedValue({ ...mockVideoByA, title: 'Updated' });
    const result = await service.update('video-1', userA, { title: 'Updated' } as any);
    expect(result.title).toBe('Updated');
  });

  it('should throw ForbiddenException when non-owner updates video', async () => {
    prisma.video.findUnique.mockResolvedValue(mockVideoByA);
    await expect(service.update('video-1', userB, { title: 'Hacked' } as any))
      .rejects.toThrow(ForbiddenException);
  });

  it('should allow owner to delete video', async () => {
    prisma.video.findUnique.mockResolvedValue(mockVideoByA);
    prisma.$transaction.mockResolvedValue([{}, {}]);
    const result = await service.delete('video-1', userA);
    expect(result.deleted).toBe(true);
  });

  it('should throw ForbiddenException when non-owner deletes video', async () => {
    prisma.video.findUnique.mockResolvedValue(mockVideoByA);
    await expect(service.delete('video-1', userB)).rejects.toThrow(ForbiddenException);
  });

  it('should throw NotFoundException for non-PUBLISHED video', async () => {
    prisma.video.findUnique.mockResolvedValue({ ...mockVideoByA, status: 'PROCESSING' });
    await expect(service.getById('video-1')).rejects.toThrow(NotFoundException);
  });

  it('should allow any user to like a video', async () => {
    prisma.video.findUnique.mockResolvedValue(mockVideoByA);
    prisma.videoReaction.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockResolvedValue([{}, {}, {}]);
    const result = await service.like('video-1', userB);
    expect(result.liked).toBe(true);
  });

  it('should allow any user to view a video', async () => {
    prisma.video.findUnique.mockResolvedValue(mockVideoByA);
    prisma.$transaction.mockResolvedValue([{}, {}, {}]);
    const result = await service.view('video-1', userB);
    expect(result.viewed).toBe(true);
  });

  it('should allow per-user progress tracking', async () => {
    prisma.watchHistory.upsert.mockResolvedValue({ progress: 50 });
    const result = await service.updateProgress('video-1', userA, 50);
    expect(result.updated).toBe(true);
  });

  it('should parse chapters only for video owner', async () => {
    prisma.video.findFirst.mockResolvedValue(null); // findFirst with userId check returns null
    const result = await service.parseChaptersFromDescription('video-1', userB);
    expect(result).toEqual([]);
  });

  it('should throw NotFoundException for non-existent video', async () => {
    prisma.video.findUnique.mockResolvedValue(null);
    await expect(service.getById('nonexistent')).rejects.toThrow(NotFoundException);
  });
});
