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
});
