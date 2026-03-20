import { Test, TestingModule } from '@nestjs/testing';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ModerationController', () => {
  let controller: ModerationController;
  let service: jest.Mocked<ModerationService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ModerationController],
      providers: [
        ...globalMockProviders,
        {
          provide: ModerationService,
          useValue: {
            checkText: jest.fn(),
            checkImage: jest.fn(),
            getQueue: jest.fn(),
            review: jest.fn(),
            getStats: jest.fn(),
            getMyActions: jest.fn(),
            getMyAppeals: jest.fn(),
            submitAppeal: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(ModerationController);
    service = module.get(ModerationService) as jest.Mocked<ModerationService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('checkText', () => {
    it('should call moderationService.checkText with userId and dto', async () => {
      const dto = { text: 'Hello world' };
      service.checkText.mockResolvedValue({ safe: true, score: 0.1 } as any);

      const result = await controller.checkText(userId, dto as any);

      expect(service.checkText).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ safe: true }));
    });
  });

  describe('checkImage', () => {
    it('should call moderationService.checkImage with userId and dto', async () => {
      const dto = { imageUrl: 'https://example.com/image.jpg' };
      service.checkImage.mockResolvedValue({ safe: true } as any);

      const result = await controller.checkImage(userId, dto as any);

      expect(service.checkImage).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ safe: true }));
    });
  });

  describe('getQueue', () => {
    it('should call moderationService.getQueue with adminId and cursor', async () => {
      service.getQueue.mockResolvedValue({ data: [], meta: { hasMore: false } } as any);

      await controller.getQueue(userId, 'cursor-1');

      expect(service.getQueue).toHaveBeenCalledWith(userId, 'cursor-1');
    });
  });

  describe('review', () => {
    it('should call moderationService.review with adminId, reportId, action, and note', async () => {
      const dto = { action: 'approve', note: 'Looks fine' };
      service.review.mockResolvedValue({ reviewed: true } as any);

      const result = await controller.review(userId, 'report-1', dto as any);

      expect(service.review).toHaveBeenCalledWith(userId, 'report-1', 'approve', 'Looks fine');
      expect(result).toEqual({ reviewed: true });
    });
  });

  describe('getStats', () => {
    it('should call moderationService.getStats with adminId', async () => {
      service.getStats.mockResolvedValue({ pending: 5, reviewed: 100 } as any);

      const result = await controller.getStats(userId);

      expect(service.getStats).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expect.objectContaining({ pending: 5 }));
    });
  });

  describe('getMyActions', () => {
    it('should call moderationService.getMyActions with userId and cursor', async () => {
      service.getMyActions.mockResolvedValue({ data: [] } as any);

      await controller.getMyActions(userId, 'cursor-1');

      expect(service.getMyActions).toHaveBeenCalledWith(userId, 'cursor-1');
    });
  });

  describe('getMyAppeals', () => {
    it('should call moderationService.getMyAppeals with userId and cursor', async () => {
      service.getMyAppeals.mockResolvedValue({ data: [] } as any);

      await controller.getMyAppeals(userId, 'cursor-1');

      expect(service.getMyAppeals).toHaveBeenCalledWith(userId, 'cursor-1');
    });
  });

  describe('submitAppeal', () => {
    it('should call moderationService.submitAppeal with userId and dto', async () => {
      const dto = { actionId: 'act-1', reason: 'I disagree' };
      service.submitAppeal.mockResolvedValue({ id: 'appeal-1', status: 'PENDING' } as any);

      const result = await controller.submitAppeal(userId, dto as any);

      expect(service.submitAppeal).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ status: 'PENDING' }));
    });
  });
});
