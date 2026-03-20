import { Test, TestingModule } from '@nestjs/testing';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('PromotionsController', () => {
  let controller: PromotionsController;
  let service: jest.Mocked<PromotionsService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PromotionsController],
      providers: [
        ...globalMockProviders,
        {
          provide: PromotionsService,
          useValue: {
            boostPost: jest.fn(),
            getMyPromotions: jest.fn(),
            cancelPromotion: jest.fn(),
            setReminder: jest.fn(),
            removeReminder: jest.fn(),
            markBranded: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(PromotionsController);
    service = module.get(PromotionsService) as jest.Mocked<PromotionsService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('boostPost', () => {
    it('should call promotionsService.boostPost with userId and dto', async () => {
      const dto = { postId: 'post-1', budget: 50, duration: 7 };
      service.boostPost.mockResolvedValue({ id: 'promo-1' } as any);

      const result = await controller.boostPost(userId, dto as any);

      expect(service.boostPost).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ id: 'promo-1' }));
    });
  });

  describe('getMyPromotions', () => {
    it('should call promotionsService.getMyPromotions with userId', async () => {
      service.getMyPromotions.mockResolvedValue([{ id: 'promo-1' }] as any);

      const result = await controller.getMyPromotions(userId);

      expect(service.getMyPromotions).toHaveBeenCalledWith(userId);
      expect(result).toHaveLength(1);
    });
  });

  describe('cancelPromotion', () => {
    it('should call promotionsService.cancelPromotion with id and userId', async () => {
      service.cancelPromotion.mockResolvedValue({ cancelled: true } as any);

      await controller.cancelPromotion('promo-1', userId);

      expect(service.cancelPromotion).toHaveBeenCalledWith('promo-1', userId);
    });
  });

  describe('setReminder', () => {
    it('should call promotionsService.setReminder with userId, postId, and remindAt', async () => {
      service.setReminder.mockResolvedValue({ reminded: true } as any);

      await controller.setReminder(userId, { postId: 'post-1', remindAt: '2026-04-01T10:00:00Z' } as any);

      expect(service.setReminder).toHaveBeenCalledWith(userId, 'post-1', '2026-04-01T10:00:00Z');
    });
  });

  describe('removeReminder', () => {
    it('should call promotionsService.removeReminder with userId and postId', async () => {
      service.removeReminder.mockResolvedValue({ removed: true } as any);

      await controller.removeReminder(userId, 'post-1');

      expect(service.removeReminder).toHaveBeenCalledWith(userId, 'post-1');
    });
  });

  describe('markBranded', () => {
    it('should call promotionsService.markBranded with userId, postId, and partnerName', async () => {
      service.markBranded.mockResolvedValue({ branded: true } as any);

      await controller.markBranded(userId, { postId: 'post-1', partnerName: 'Brand Co' } as any);

      expect(service.markBranded).toHaveBeenCalledWith(userId, 'post-1', 'Brand Co');
    });
  });
});
