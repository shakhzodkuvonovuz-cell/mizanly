import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ReelsService } from './reels.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StreamService } from '../stream/stream.service';
import { GamificationService } from '../gamification/gamification.service';
import { globalMockProviders } from '../../common/test/mock-providers';

/**
 * W7-T5 / T03: reels service gaps — updateReel, publishTrial, saveDraft, getDrafts, deleteDraft,
 * getDownloadUrl, getByAudioTrack, getDuets, getStitches, likeComment, unlikeComment,
 * recordView, recordLoop, getAccessibilityReport
 */
describe('ReelsService — W7 T03 gaps', () => {
  let service: ReelsService;
  let prisma: any;

  const mockReel = {
    id: 'reel-1', userId: 'user-1', videoUrl: 'url', caption: 'test',
    status: 'READY', isRemoved: false, isTrial: false, scheduledAt: null,
    hashtags: [], user: { id: 'user-1', username: 'u1' },
    likesCount: 0, commentsCount: 0, sharesCount: 0, viewsCount: 0,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        ReelsService,
        {
          provide: PrismaService,
          useValue: {
            reel: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
            reelReaction: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            reelInteraction: { create: jest.fn(), upsert: jest.fn(), delete: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            reelView: { create: jest.fn(), findUnique: jest.fn() },
            reelComment: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            reelCommentReaction: { create: jest.fn(), deleteMany: jest.fn() },
            reelTaggedUser: { createMany: jest.fn(), findMany: jest.fn() },
            user: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            follow: { findUnique: jest.fn() },
            block: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
            mute: { findMany: jest.fn().mockResolvedValue([]) },
            restrict: { findMany: jest.fn().mockResolvedValue([]) },
            hashtag: { createMany: jest.fn() },
            report: { findFirst: jest.fn(), create: jest.fn() },
            $executeRaw: jest.fn(),
            $transaction: jest.fn().mockImplementation(async (fnOrArray: unknown) => {
              if (typeof fnOrArray === 'function') return (fnOrArray as (tx: any) => Promise<unknown>)(prisma);
              const results = [];
              for (const op of fnOrArray as any[]) {
                if (op && typeof op.then === 'function') results.push(await op);
                else results.push(op);
              }
              return results;
            }),
          },
        },
        { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({ id: 'n1' }) } },
        { provide: StreamService, useValue: { uploadFromUrl: jest.fn().mockResolvedValue('stream-1'), deleteVideo: jest.fn() } },
        { provide: GamificationService, useValue: { awardXP: jest.fn() } },
        { provide: 'REDIS', useValue: { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK'), setex: jest.fn(), del: jest.fn(), zadd: jest.fn(), zrangebyscore: jest.fn().mockResolvedValue([]), zremrangebyscore: jest.fn(), expire: jest.fn() } },
      ],
    }).compile();

    service = module.get<ReelsService>(ReelsService);
    prisma = module.get(PrismaService) as any;
  });

  // T03 #1: updateReel
  describe('updateReel', () => {
    it('should update caption for reel owner', async () => {
      prisma.reel.findUnique.mockResolvedValue(mockReel);
      prisma.reel.update.mockResolvedValue({ ...mockReel, caption: 'new caption' });

      const result = await service.updateReel('reel-1', 'user-1', { caption: 'new caption' });

      expect(result.caption).toBe('new caption');
      expect(prisma.reel.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'reel-1' } }),
      );
    });

    it('should throw NotFoundException for non-existent reel', async () => {
      prisma.reel.findUnique.mockResolvedValue(null);
      await expect(service.updateReel('nope', 'user-1', {})).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for non-owner', async () => {
      prisma.reel.findUnique.mockResolvedValue(mockReel);
      await expect(service.updateReel('reel-1', 'other-user', {})).rejects.toThrow(ForbiddenException);
    });

    // T03 #17: isRemoved guard
    it('should throw BadRequestException for removed reel', async () => {
      prisma.reel.findUnique.mockResolvedValue({ ...mockReel, isRemoved: true });
      await expect(service.updateReel('reel-1', 'user-1', {})).rejects.toThrow(BadRequestException);
    });
  });

  // T03 #2: publishTrial
  describe('publishTrial', () => {
    it('should convert trial reel to published', async () => {
      prisma.reel.findUnique.mockResolvedValue({ ...mockReel, isTrial: true });
      prisma.reel.update.mockResolvedValue({ ...mockReel, isTrial: false });

      const result = await service.publishTrial('reel-1', 'user-1');

      expect(result).toEqual({ published: true });
    });

    it('should throw NotFoundException for missing reel', async () => {
      prisma.reel.findUnique.mockResolvedValue(null);
      await expect(service.publishTrial('nope', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for non-owner', async () => {
      prisma.reel.findUnique.mockResolvedValue({ ...mockReel, isTrial: true });
      await expect(service.publishTrial('reel-1', 'other')).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when not a trial', async () => {
      prisma.reel.findUnique.mockResolvedValue({ ...mockReel, isTrial: false });
      await expect(service.publishTrial('reel-1', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  // T03 #3-5: saveDraft, getDrafts, deleteDraft
  describe('saveDraft', () => {
    it('should create draft reel with DRAFT status', async () => {
      prisma.reel.create.mockResolvedValue({ ...mockReel, status: 'DRAFT' });

      const result = await service.saveDraft('user-1', { videoUrl: 'url', caption: 'draft' } as any);

      expect(prisma.reel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'DRAFT', userId: 'user-1' }),
        }),
      );
    });
  });

  describe('getDrafts', () => {
    it('should return user draft reels', async () => {
      prisma.reel.findMany.mockResolvedValue([{ ...mockReel, status: 'DRAFT' }]);

      const result = await service.getDrafts('user-1');

      expect(result.data).toHaveLength(1);
      expect(prisma.reel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1', status: 'DRAFT' }),
        }),
      );
    });
  });

  describe('deleteDraft', () => {
    it('should delete draft by owner', async () => {
      prisma.reel.findUnique.mockResolvedValue({ ...mockReel, status: 'DRAFT' });
      prisma.reel.delete.mockResolvedValue({});

      const result = await service.deleteDraft('reel-1', 'user-1');

      expect(result).toEqual({ deleted: true });
    });

    it('should throw ForbiddenException for non-owner', async () => {
      prisma.reel.findUnique.mockResolvedValue({ ...mockReel, status: 'DRAFT' });
      await expect(service.deleteDraft('reel-1', 'other')).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for non-draft', async () => {
      prisma.reel.findUnique.mockResolvedValue({ ...mockReel, status: 'READY' });
      await expect(service.deleteDraft('reel-1', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  // T03 #6: getDownloadUrl
  describe('getDownloadUrl', () => {
    it('should return download URL with watermark text', async () => {
      prisma.reel.findUnique.mockResolvedValue({ ...mockReel, user: { username: 'creator' } });

      const result = await service.getDownloadUrl('reel-1', 'user-1');

      expect(result.url).toBe('url');
      expect(result.watermarkText).toContain('@creator');
      expect(result.watermarkText).toContain('mizanly.app');
    });

    it('should return no watermark text when withWatermark=false', async () => {
      prisma.reel.findUnique.mockResolvedValue({ ...mockReel, user: { username: 'creator' } });

      const result = await service.getDownloadUrl('reel-1', 'user-1', false);

      expect(result.watermarkText).toBeNull();
    });

    it('should throw NotFoundException for removed reel', async () => {
      prisma.reel.findUnique.mockResolvedValue({ ...mockReel, isRemoved: true });
      await expect(service.getDownloadUrl('reel-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  // T03 #7: getByAudioTrack
  describe('getByAudioTrack', () => {
    it('should return paginated reels by audioTrackId', async () => {
      prisma.reel.findMany.mockResolvedValue([mockReel]);

      const result = await service.getByAudioTrack('track-1');

      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should return empty for no results', async () => {
      prisma.reel.findMany.mockResolvedValue([]);

      const result = await service.getByAudioTrack('track-empty');

      expect(result.data).toEqual([]);
    });
  });

  // T03 #8-9: getDuets, getStitches (service level)
  describe('getDuets', () => {
    it('should return duets for parent reel', async () => {
      prisma.reel.findUnique.mockResolvedValue(mockReel); // parent
      prisma.reel.findMany.mockResolvedValue([{ ...mockReel, id: 'duet-1', isDuet: true }]);

      const result = await service.getDuets('reel-1');

      expect(result.data).toHaveLength(1);
    });

    it('should throw NotFoundException for missing parent', async () => {
      prisma.reel.findUnique.mockResolvedValue(null);
      await expect(service.getDuets('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStitches', () => {
    it('should return stitches for parent reel', async () => {
      prisma.reel.findUnique.mockResolvedValue(mockReel);
      prisma.reel.findMany.mockResolvedValue([{ ...mockReel, id: 'stitch-1', isStitch: true }]);

      const result = await service.getStitches('reel-1');

      expect(result.data).toHaveLength(1);
    });

    it('should throw NotFoundException for missing parent', async () => {
      prisma.reel.findUnique.mockResolvedValue(null);
      await expect(service.getStitches('nope')).rejects.toThrow(NotFoundException);
    });
  });

  // T03 #11-12: likeComment, unlikeComment (service level)
  describe('likeComment', () => {
    it('should like a comment and increment counter', async () => {
      prisma.reelComment.findUnique.mockResolvedValue({ id: 'c1', reelId: 'reel-1', userId: 'other' });
      prisma.reelCommentReaction.create.mockResolvedValue({});
      prisma.reelComment.update.mockResolvedValue({});

      const result = await service.likeComment('reel-1', 'c1', 'user-1');

      expect(result).toEqual({ liked: true });
    });

    it('should throw NotFoundException for wrong reelId', async () => {
      prisma.reelComment.findUnique.mockResolvedValue({ id: 'c1', reelId: 'other-reel', userId: 'other' });
      await expect(service.likeComment('reel-1', 'c1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException on self-like', async () => {
      prisma.reelComment.findUnique.mockResolvedValue({ id: 'c1', reelId: 'reel-1', userId: 'user-1' });
      await expect(service.likeComment('reel-1', 'c1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException on duplicate like (P2002)', async () => {
      const { PrismaClientKnownRequestError } = require('@prisma/client/runtime/library');
      prisma.reelComment.findUnique.mockResolvedValue({ id: 'c1', reelId: 'reel-1', userId: 'other' });
      prisma.$transaction.mockRejectedValue(new PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: '0' }));

      await expect(service.likeComment('reel-1', 'c1', 'user-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('unlikeComment', () => {
    it('should unlike a comment', async () => {
      prisma.reelComment.findUnique.mockResolvedValue({ id: 'c1', reelId: 'reel-1', userId: 'other' });
      prisma.reelCommentReaction.deleteMany.mockResolvedValue({ count: 1 });
      prisma.$executeRaw.mockResolvedValue(1);

      const result = await service.unlikeComment('reel-1', 'c1', 'user-1');

      expect(result).toEqual({ unliked: true });
    });

    it('should throw NotFoundException for missing comment', async () => {
      prisma.reelComment.findUnique.mockResolvedValue(null);
      await expect(service.unlikeComment('reel-1', 'c1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  // T03 #13-14: recordView, recordLoop
  describe('recordView', () => {
    it('should increment viewsCount', async () => {
      prisma.reel.update.mockResolvedValue({});

      await service.recordView('reel-1');

      expect(prisma.reel.update).toHaveBeenCalledWith({
        where: { id: 'reel-1' },
        data: { viewsCount: { increment: 1 } },
      });
    });

    it('should silently handle errors', async () => {
      prisma.reel.update.mockRejectedValue(new Error('DB down'));

      // Should not throw — fire-and-forget
      await expect(service.recordView('reel-1')).resolves.toBeUndefined();
    });
  });

  describe('recordLoop', () => {
    it('should increment loopsCount', async () => {
      prisma.reel.update.mockResolvedValue({});

      await service.recordLoop('reel-1');

      expect(prisma.reel.update).toHaveBeenCalledWith({
        where: { id: 'reel-1' },
        data: { loopsCount: { increment: 1 } },
      });
    });
  });

  // T03 #15: getAccessibilityReport
  describe('getAccessibilityReport', () => {
    it('should return 100 when all fields present', () => {
      const result = service.getAccessibilityReport({
        altText: 'desc', caption: 'my reel', hashtags: ['fun'],
      });
      expect(result.score).toBe(100);
      expect(result.isComplete).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('should flag missing altText, caption, and hashtags', () => {
      const result = service.getAccessibilityReport({
        altText: null, caption: null, hashtags: [],
      });
      expect(result.score).toBeLessThan(100);
      expect(result.issues).toContain('Add alt text for visually impaired users');
      expect(result.issues).toContain('Add a caption for better discoverability');
      expect(result.issues).toContain('Add hashtags to help others find your content');
      expect(result.isComplete).toBe(false);
    });
  });

  // T03 #22: report — duplicate returns existing
  describe('report — duplicate', () => {
    it('should return { reported: true } for duplicate report', async () => {
      prisma.reel.findUnique.mockResolvedValue({ id: 'reel-1' });
      prisma.report.findFirst.mockResolvedValue({ id: 'existing-report' });

      const result = await service.report('reel-1', 'user-1', 'SPAM');

      expect(result).toEqual({ reported: true });
      expect(prisma.report.create).not.toHaveBeenCalled();
    });
  });

  // T03 #23: report — reel not found
  describe('report — not found', () => {
    it('should throw NotFoundException for missing reel', async () => {
      prisma.reel.findUnique.mockResolvedValue(null);
      await expect(service.report('nope', 'user-1', 'SPAM')).rejects.toThrow(NotFoundException);
    });
  });
});
