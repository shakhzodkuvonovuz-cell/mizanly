import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ReelsService } from './reels.service';
import { globalMockProviders } from '../../common/test/mock-providers';
import { NotificationsService } from '../notifications/notifications.service';
import { StreamService } from '../stream/stream.service';

describe('ReelsService — authorization matrix', () => {
  let service: ReelsService;
  let prisma: any;
  const userA = 'user-a';
  const userB = 'user-b';

  const mockReelByA = {
    id: 'reel-1', userId: userA, status: 'READY', isRemoved: false,
    likesCount: 0, streamId: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        ReelsService,
        {
          provide: PrismaService,
          useValue: {
            reel: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
            reelReaction: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            reelInteraction: { upsert: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            reelComment: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), delete: jest.fn(), update: jest.fn() },
            user: { update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            block: { findMany: jest.fn().mockResolvedValue([]) },
            mute: { findMany: jest.fn().mockResolvedValue([]) },
            hashtag: { upsert: jest.fn() },
            report: { create: jest.fn() },
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
          },
        },
        { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({ id: 'n-1' }) } },
        { provide: StreamService, useValue: { uploadFromUrl: jest.fn(), deleteVideo: jest.fn() } },
        { provide: 'REDIS', useValue: { get: jest.fn().mockResolvedValue(null), setex: jest.fn(), del: jest.fn() } },
      ],
    }).compile();

    service = module.get<ReelsService>(ReelsService);
    prisma = module.get(PrismaService);
  });

  describe('delete — ownership', () => {
    it('should allow owner to delete', async () => {
      prisma.reel.findUnique.mockResolvedValue(mockReelByA);
      prisma.$transaction.mockResolvedValue([{}, {}]);
      const result = await service.delete('reel-1', userA);
      expect(result.deleted).toBe(true);
    });

    it('should throw ForbiddenException when non-owner deletes', async () => {
      prisma.reel.findUnique.mockResolvedValue(mockReelByA);
      await expect(service.delete('reel-1', userB)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('like — any user', () => {
    it('should allow any user to like', async () => {
      prisma.reel.findUnique.mockResolvedValue(mockReelByA);
      prisma.$transaction.mockResolvedValue([{}, {}, {}]);
      const result = await service.like('reel-1', userB);
      expect(result.liked).toBe(true);
    });
  });

  describe('deleteComment — ownership', () => {
    it('should allow comment author to delete', async () => {
      prisma.reelComment.findUnique.mockResolvedValue({ id: 'c-1', userId: userA, reelId: 'reel-1' });
      prisma.$transaction.mockResolvedValue([{}, {}]);
      const result = await service.deleteComment('reel-1', 'c-1', userA);
      expect(result.deleted).toBe(true);
    });

    it('should throw ForbiddenException when non-author deletes comment', async () => {
      prisma.reelComment.findUnique.mockResolvedValue({ id: 'c-1', userId: userA, reelId: 'reel-1' });
      await expect(service.deleteComment('reel-1', 'c-1', userB)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('archive — ownership', () => {
    it('should allow owner to archive', async () => {
      prisma.reel.findUnique.mockResolvedValue(mockReelByA);
      prisma.reel.update.mockResolvedValue({ ...mockReelByA, isArchived: true });
      const result = await service.archive('reel-1', userA);
      expect(result).toBeDefined();
      expect(prisma.reel.update).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when non-owner archives', async () => {
      prisma.reel.findUnique.mockResolvedValue(mockReelByA);
      await expect(service.archive('reel-1', userB)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getById — not found', () => {
    it('should throw NotFoundException for non-existent reel', async () => {
      prisma.reel.findUnique.mockResolvedValue(null);
      await expect(service.getById('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for removed reel', async () => {
      prisma.reel.findUnique.mockResolvedValue({ ...mockReelByA, isRemoved: true });
      await expect(service.getById('reel-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for PROCESSING reel', async () => {
      prisma.reel.findUnique.mockResolvedValue({ ...mockReelByA, status: 'PROCESSING' });
      await expect(service.getById('reel-1')).rejects.toThrow(NotFoundException);
    });
  });
});
