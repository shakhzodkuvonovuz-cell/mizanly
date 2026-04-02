import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ReelsController } from './reels.controller';
import { ReelsService } from './reels.service';
import { PrismaService } from '../../config/prisma.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

/**
 * W7-T5 / T03 #28: Controller delegation tests for missing reels endpoints
 */
describe('ReelsController — W7 T03 gaps', () => {
  let controller: ReelsController;

  const mockService = {
    create: jest.fn(), getFeed: jest.fn(), getById: jest.fn(), recordView: jest.fn(),
    delete: jest.fn(), like: jest.fn(), unlike: jest.fn(), comment: jest.fn(),
    getComments: jest.fn(), deleteComment: jest.fn(), likeComment: jest.fn(),
    unlikeComment: jest.fn(), share: jest.fn(), bookmark: jest.fn(), unbookmark: jest.fn(),
    view: jest.fn(), getUserReels: jest.fn(), report: jest.fn(), getDuets: jest.fn(),
    getStitches: jest.fn(), archive: jest.fn(), unarchive: jest.fn(), getShareLink: jest.fn(),
    // Missing from original mock:
    getTrendingReels: jest.fn(), updateReel: jest.fn(), publishTrial: jest.fn(),
    getDownloadUrl: jest.fn(), getByAudioTrack: jest.fn(), saveDraft: jest.fn(),
    getDrafts: jest.fn(), deleteDraft: jest.fn(), recordLoop: jest.fn(),
    getAccessibilityReport: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ReelsController],
      providers: [
        ...globalMockProviders,
        { provide: ReelsService, useValue: mockService },
        { provide: ConfigService, useValue: { get: jest.fn(() => 'test-secret') } },
        { provide: PrismaService, useValue: {} },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(ReelsController);
    jest.clearAllMocks();
  });

  describe('saveDraft', () => {
    it('should delegate to service.saveDraft', async () => {
      mockService.saveDraft.mockResolvedValue({ id: 'draft-1', status: 'DRAFT' });
      const result = await controller.saveDraft('user-1', { videoUrl: 'url' } as any);
      expect(mockService.saveDraft).toHaveBeenCalledWith('user-1', { videoUrl: 'url' });
      expect(result.status).toBe('DRAFT');
    });
  });

  describe('getDrafts', () => {
    it('should delegate to service.getDrafts', async () => {
      mockService.getDrafts.mockResolvedValue({ data: [] });
      const result = await controller.getDrafts('user-1');
      expect(mockService.getDrafts).toHaveBeenCalledWith('user-1');
      expect(result.data).toEqual([]);
    });
  });

  describe('getTrending', () => {
    it('should delegate to service.getTrendingReels with parsed limit', async () => {
      mockService.getTrendingReels.mockResolvedValue({ data: [] });
      await controller.getTrending(undefined, '10');
      expect(mockService.getTrendingReels).toHaveBeenCalledWith(undefined, 10);
    });
  });

  describe('getByAudioTrack', () => {
    it('should delegate to service.getByAudioTrack', async () => {
      mockService.getByAudioTrack.mockResolvedValue({ data: [] });
      await controller.getByAudioTrack('track-1', 'user-1', 'cursor-1');
      expect(mockService.getByAudioTrack).toHaveBeenCalledWith('track-1', 'cursor-1', 20, 'user-1');
    });
  });

  describe('updateReel', () => {
    it('should delegate to service.updateReel', async () => {
      mockService.updateReel.mockResolvedValue({ id: 'reel-1', caption: 'updated' });
      const result = await controller.updateReel('reel-1', 'user-1', { caption: 'updated' } as any);
      expect(mockService.updateReel).toHaveBeenCalledWith('reel-1', 'user-1', { caption: 'updated' });
    });
  });

  describe('publishTrial', () => {
    it('should delegate to service.publishTrial', async () => {
      mockService.publishTrial.mockResolvedValue({ published: true });
      const result = await controller.publishTrial('reel-1', 'user-1');
      expect(mockService.publishTrial).toHaveBeenCalledWith('reel-1', 'user-1');
    });
  });

  describe('getDownloadUrl', () => {
    it('should delegate to service.getDownloadUrl', async () => {
      mockService.getDownloadUrl.mockResolvedValue({ url: 'http://test', watermarkText: '@u1' });
      const result = await controller.getDownloadUrl('reel-1', 'user-1', undefined);
      expect(mockService.getDownloadUrl).toHaveBeenCalledWith('reel-1', 'user-1', true);
    });
  });

  describe('deleteDraft', () => {
    it('should delegate to service.deleteDraft', async () => {
      mockService.deleteDraft.mockResolvedValue({ deleted: true });
      const result = await controller.deleteDraft('draft-1', 'user-1');
      expect(mockService.deleteDraft).toHaveBeenCalledWith('draft-1', 'user-1');
    });
  });

  describe('loop', () => {
    it('should call service.recordLoop', async () => {
      mockService.recordLoop.mockResolvedValue(undefined);
      await controller.loop('reel-1');
      expect(mockService.recordLoop).toHaveBeenCalledWith('reel-1');
    });
  });
});
