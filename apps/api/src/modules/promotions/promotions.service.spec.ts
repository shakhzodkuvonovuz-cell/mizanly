import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { PromotionsService } from './promotions.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('PromotionsService', () => {
  let service: PromotionsService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        PromotionsService,
        {
          provide: PrismaService,
          useValue: {
            post: { findUnique: jest.fn(), update: jest.fn() },
            postPromotion: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
            postReminder: { upsert: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
          },
        },
      ],
    }).compile();
    service = module.get(PromotionsService);
    prisma = module.get(PrismaService) as any;
  });

  describe('boostPost', () => {
    it('should create a promotion', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', userId: 'u1' });
      prisma.postPromotion.findFirst.mockResolvedValue(null);
      prisma.postPromotion.create.mockResolvedValue({ id: 'promo1', status: 'active', targetReach: 5000 });
      const result = await service.boostPost('u1', { postId: 'p1', budget: 50, duration: 7 });
      expect(result.status).toBe('active');
      expect(result.targetReach).toBe(5000);
    });

    it('should throw for invalid budget', async () => {
      await expect(service.boostPost('u1', { postId: 'p1', budget: 0, duration: 7 })).rejects.toThrow(BadRequestException);
      await expect(service.boostPost('u1', { postId: 'p1', budget: 20000, duration: 7 })).rejects.toThrow(BadRequestException);
    });

    it('should throw for invalid duration', async () => {
      await expect(service.boostPost('u1', { postId: 'p1', budget: 50, duration: 0 })).rejects.toThrow(BadRequestException);
      await expect(service.boostPost('u1', { postId: 'p1', budget: 50, duration: 60 })).rejects.toThrow(BadRequestException);
    });

    it('should throw for non-own post', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', userId: 'other' });
      await expect(service.boostPost('u1', { postId: 'p1', budget: 50, duration: 7 })).rejects.toThrow(ForbiddenException);
    });

    it('should throw for existing active promotion', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', userId: 'u1' });
      prisma.postPromotion.findFirst.mockResolvedValue({ id: 'existing', status: 'active' });
      await expect(service.boostPost('u1', { postId: 'p1', budget: 50, duration: 7 })).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelPromotion', () => {
    it('should cancel active promotion', async () => {
      prisma.postPromotion.findUnique.mockResolvedValue({ id: 'promo1', userId: 'u1', status: 'active' });
      prisma.postPromotion.update.mockResolvedValue({ id: 'promo1', status: 'cancelled' });
      const result = await service.cancelPromotion('promo1', 'u1');
      expect(result.status).toBe('cancelled');
    });

    it('should throw for non-active promotion', async () => {
      prisma.postPromotion.findUnique.mockResolvedValue({ id: 'promo1', userId: 'u1', status: 'expired' });
      await expect(service.cancelPromotion('promo1', 'u1')).rejects.toThrow(BadRequestException);
    });

    it('should throw for non-own promotion', async () => {
      prisma.postPromotion.findUnique.mockResolvedValue({ id: 'promo1', userId: 'other', status: 'active' });
      await expect(service.cancelPromotion('promo1', 'u1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('setReminder', () => {
    it('should set post reminder', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.postReminder.upsert.mockResolvedValue({ postId: 'p1', userId: 'u1' });
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const result = await service.setReminder('u1', 'p1', futureDate);
      expect(result).toBeDefined();
      expect(result).toHaveProperty('postId', 'p1');
    });

    it('should throw for past date', async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      await expect(service.setReminder('u1', 'p1', pastDate)).rejects.toThrow(BadRequestException);
    });

    it('should throw for invalid date', async () => {
      await expect(service.setReminder('u1', 'p1', 'not-a-date')).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeReminder', () => {
    it('should remove reminder', async () => {
      prisma.postReminder.findUnique.mockResolvedValue({ postId: 'p1', userId: 'u1' });
      prisma.postReminder.delete.mockResolvedValue({});
      const result = await service.removeReminder('u1', 'p1');
      expect(result.message).toBe('Reminder removed');
    });

    it('should throw if reminder not found', async () => {
      prisma.postReminder.findUnique.mockResolvedValue(null);
      await expect(service.removeReminder('u1', 'p1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('markBranded', () => {
    it('should add branded content tag', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', userId: 'u1', content: 'My post' });
      prisma.post.update.mockResolvedValue({ id: 'p1', content: '[Paid partnership with Nike] My post' });
      const result = await service.markBranded('u1', 'p1', 'Nike');
      expect(result.partnerName).toBe('Nike');
      expect(result.content).toContain('[Paid partnership with Nike]');
    });

    it('should throw for non-own post', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', userId: 'other', content: '' });
      await expect(service.markBranded('u1', 'p1', 'Nike')).rejects.toThrow(ForbiddenException);
    });

    it('should throw for empty partner name', async () => {
      await expect(service.markBranded('u1', 'p1', '  ')).rejects.toThrow(BadRequestException);
    });
  });

  // ═══ T10 Audit: Promotions missing coverage ═══

  describe('getMyPromotions — #35 H', () => {
    it('should return user promotions ordered by createdAt desc', async () => {
      const mockPromotions = [
        { id: 'promo1', status: 'active', budget: 50 },
        { id: 'promo2', status: 'completed', budget: 100 },
      ];
      prisma.postPromotion.findMany.mockResolvedValue(mockPromotions);

      const result = await service.getMyPromotions('u1');
      expect(result.data).toHaveLength(2);
      expect(prisma.postPromotion.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    });

    it('should return empty when user has no promotions', async () => {
      prisma.postPromotion.findMany.mockResolvedValue([]);
      const result = await service.getMyPromotions('u1');
      expect(result.data).toHaveLength(0);
    });
  });

  describe('boostPost — post not found — #36 M', () => {
    it('should throw NotFoundException when post does not exist', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(service.boostPost('u1', { postId: 'nonexistent', budget: 50, duration: 7 }))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('setReminder — post not found — #37 M', () => {
    it('should throw NotFoundException when post does not exist', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      await expect(service.setReminder('u1', 'nonexistent', futureDate))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('markBranded — post not found — #38 M', () => {
    it('should throw NotFoundException when post does not exist', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(service.markBranded('u1', 'nonexistent', 'Nike'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('markBranded — existing tag replacement — #39 M', () => {
    it('should replace existing branded tag with new one', async () => {
      prisma.post.findUnique.mockResolvedValue({
        id: 'p1', userId: 'u1', content: '[Paid partnership with OldBrand] My great post',
      });
      prisma.post.update.mockResolvedValue({
        id: 'p1', content: '[Paid partnership with NewBrand] My great post',
      });
      const result = await service.markBranded('u1', 'p1', 'NewBrand');
      expect(result.content).toContain('[Paid partnership with NewBrand]');
      expect(result.content).not.toContain('OldBrand');
    });
  });

  describe('cancelPromotion — not found — #40 L', () => {
    it('should throw NotFoundException when promotion does not exist', async () => {
      prisma.postPromotion.findUnique.mockResolvedValue(null);
      await expect(service.cancelPromotion('nonexistent', 'u1'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('boostPost — targetReach formula — #41 L', () => {
    it('should calculate targetReach as budget * 100 (REACH_MULTIPLIER)', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p1', userId: 'u1' });
      prisma.postPromotion.findFirst.mockResolvedValue(null);
      prisma.postPromotion.create.mockImplementation((args: any) => Promise.resolve(args.data));

      await service.boostPost('u1', { postId: 'p1', budget: 123, duration: 7 });
      expect(prisma.postPromotion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ targetReach: 12300 }), // 123 * 100
        }),
      );
    });
  });
});
