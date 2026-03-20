import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { GiftsController } from './gifts.controller';
import { GiftsService } from './gifts.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('GiftsController', () => {
  let controller: GiftsController;
  let service: jest.Mocked<GiftsService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GiftsController],
      providers: [
        ...globalMockProviders,
        {
          provide: GiftsService,
          useValue: {
            getBalance: jest.fn(),
            purchaseCoins: jest.fn(),
            sendGift: jest.fn(),
            getCatalog: jest.fn(),
            getHistory: jest.fn(),
            cashout: jest.fn(),
            getReceivedGifts: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(GiftsController);
    service = module.get(GiftsService) as jest.Mocked<GiftsService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('getBalance', () => {
    it('should call giftsService.getBalance with userId', async () => {
      service.getBalance.mockResolvedValue({ coins: 500, diamonds: 50 } as any);

      const result = await controller.getBalance(userId);

      expect(service.getBalance).toHaveBeenCalledWith(userId);
      expect(result).toEqual({ coins: 500, diamonds: 50 });
    });
  });

  describe('purchaseCoins', () => {
    it('should call giftsService.purchaseCoins with userId and amount', async () => {
      service.purchaseCoins.mockResolvedValue({ newBalance: 1000 } as any);

      const result = await controller.purchaseCoins(userId, { amount: 500 } as any);

      expect(service.purchaseCoins).toHaveBeenCalledWith(userId, 500);
      expect(result).toEqual({ newBalance: 1000 });
    });
  });

  describe('sendGift', () => {
    it('should call giftsService.sendGift with senderId and dto', async () => {
      const dto = { receiverId: 'user-2', giftType: 'HEART', contentId: 'post-1', contentType: 'post' };
      service.sendGift.mockResolvedValue({ id: 'gift-1', sent: true } as any);

      const result = await controller.sendGift(userId, dto as any);

      expect(service.sendGift).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ sent: true }));
    });

    it('should propagate BadRequestException for self-gift', async () => {
      service.sendGift.mockRejectedValue(new BadRequestException('Cannot gift yourself'));

      await expect(controller.sendGift(userId, { receiverId: userId, giftType: 'HEART' } as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getCatalog', () => {
    it('should call giftsService.getCatalog', async () => {
      const mockCatalog = [{ type: 'HEART', cost: 10 }, { type: 'STAR', cost: 50 }];
      service.getCatalog.mockResolvedValue(mockCatalog as any);

      const result = await controller.getCatalog();

      expect(service.getCatalog).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });
  });

  describe('getHistory', () => {
    it('should call giftsService.getHistory with userId and parsed limit', async () => {
      service.getHistory.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } } as any);

      await controller.getHistory(userId, 'cursor-1', '15');

      expect(service.getHistory).toHaveBeenCalledWith(userId, 'cursor-1', 15);
    });

    it('should default limit to 20 when not provided', async () => {
      service.getHistory.mockResolvedValue({ data: [] } as any);

      await controller.getHistory(userId);

      expect(service.getHistory).toHaveBeenCalledWith(userId, undefined, 20);
    });
  });

  describe('cashout', () => {
    it('should call giftsService.cashout with userId and diamonds', async () => {
      service.cashout.mockResolvedValue({ amount: 5.00, status: 'PENDING' } as any);

      const result = await controller.cashout(userId, { diamonds: 100 } as any);

      expect(service.cashout).toHaveBeenCalledWith(userId, 100);
      expect(result).toEqual(expect.objectContaining({ status: 'PENDING' }));
    });
  });

  describe('getReceivedGifts', () => {
    it('should call giftsService.getReceivedGifts with userId', async () => {
      service.getReceivedGifts.mockResolvedValue([{ type: 'HEART', count: 10 }] as any);

      const result = await controller.getReceivedGifts(userId);

      expect(service.getReceivedGifts).toHaveBeenCalledWith(userId);
      expect(result).toHaveLength(1);
    });
  });
});
