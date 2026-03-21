import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { MonetizationService } from './monetization.service';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('MonetizationService', () => {
  let service: MonetizationService;
  let prisma: PrismaService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    tip: {
      create: jest.fn(),
      findMany: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
    membershipTier: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    membershipSubscription: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        MonetizationService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<MonetizationService>(MonetizationService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('sendTip', () => {
    it('should create tip as pending with platform fee', async () => {
      const mockReceiver = { id: 'receiver1', username: 'receiver' };
      const mockTip = {
        id: 'tip1',
        senderId: 'sender1',
        receiverId: 'receiver1',
        amount: 100,
        currency: 'USD',
        message: 'Thank you',
        platformFee: 10,
        status: 'pending',
        sender: { id: 'sender1', username: 'sender', displayName: 'Sender', avatarUrl: null },
        receiver: { id: 'receiver1', username: 'receiver', displayName: 'Receiver', avatarUrl: null },
      };
      mockPrismaService.user.findUnique.mockResolvedValue(mockReceiver);
      mockPrismaService.tip.create.mockResolvedValue(mockTip);

      const result = await service.sendTip('sender1', 'receiver1', 100, 'Thank you');
      expect(result).toEqual(mockTip);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'receiver1' },
      });
      expect(mockPrismaService.tip.create).toHaveBeenCalledWith({
        data: {
          senderId: 'sender1',
          receiverId: 'receiver1',
          amount: 100,
          currency: 'USD',
          message: 'Thank you',
          platformFee: 10,
          status: 'pending',
        },
        include: {
          sender: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
          receiver: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
      });
    });

    it('should throw BadRequestException for zero amount', async () => {
      await expect(service.sendTip('sender1', 'receiver1', 0)).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.user.findUnique).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for negative amount', async () => {
      await expect(service.sendTip('sender1', 'receiver1', -10)).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.user.findUnique).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for self-tip', async () => {
      await expect(service.sendTip('same', 'same', 50)).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.user.findUnique).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for missing receiver', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(service.sendTip('sender1', 'receiver1', 50)).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'receiver1' },
      });
    });
  });

  describe('getSentTips', () => {
    it('should return paginated sent tips', async () => {
      const mockTips = [
        { id: 'tip1', senderId: 'user1', receiver: { id: 'rec1', username: 'rec' } },
        { id: 'tip2', senderId: 'user1', receiver: { id: 'rec2', username: 'rec2' } },
      ];
      mockPrismaService.tip.findMany.mockResolvedValue(mockTips);

      const result = await service.getSentTips('user1');
      expect(result.data).toEqual(mockTips);
      expect(result.meta.hasMore).toBe(false);
      expect(mockPrismaService.tip.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { senderId: 'user1' },
        include: {
          receiver: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
        take: 21,
        orderBy: { createdAt: 'desc' },
      }));
    });

    it('should handle cursor pagination', async () => {
      const mockTips = new Array(22).fill(null).map((_, i) => ({ id: `tip${i}` }));
      mockPrismaService.tip.findMany.mockResolvedValue(mockTips);

      const result = await service.getSentTips('user1', 'cursor123', 20);
      expect(result.data).toHaveLength(20);
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.cursor).toBe('tip19');
      expect(mockPrismaService.tip.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { senderId: 'user1' },
        include: {
          receiver: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
        take: 21,
        cursor: { id: 'cursor123' },
        skip: 1,
        orderBy: { createdAt: 'desc' },
      }));
    });

    it('should return empty array when no tips', async () => {
      mockPrismaService.tip.findMany.mockResolvedValue([]);
      const result = await service.getSentTips('user1');
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('getReceivedTips', () => {
    it('should return paginated received tips', async () => {
      const mockTips = [
        { id: 'tip1', receiverId: 'user1', sender: { id: 'send1', username: 'sender' } },
      ];
      mockPrismaService.tip.findMany.mockResolvedValue(mockTips);
      const result = await service.getReceivedTips('user1');
      expect(result.data).toEqual(mockTips);
      expect(mockPrismaService.tip.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { receiverId: 'user1' },
        include: {
          sender: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
        take: 21,
        orderBy: { createdAt: 'desc' },
      }));
    });
  });

  describe('getTipStats', () => {
    it('should return aggregated stats and top supporters', async () => {
      const mockAggregateEarned = { _sum: { amount: 500 } };
      const mockAggregateSent = { _sum: { amount: 200 } };
      const mockGroupBy = [
        { senderId: 'supporter1', _sum: { amount: 300 } },
        { senderId: 'supporter2', _sum: { amount: 200 } },
      ];
      const mockUser1 = { id: 'supporter1', username: 'supp1', displayName: 'Supp1', avatarUrl: null };
      const mockUser2 = { id: 'supporter2', username: 'supp2', displayName: 'Supp2', avatarUrl: null };
      mockPrismaService.tip.aggregate
        .mockResolvedValueOnce(mockAggregateEarned)
        .mockResolvedValueOnce(mockAggregateSent);
      mockPrismaService.tip.groupBy.mockResolvedValue(mockGroupBy);
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce(mockUser1)
        .mockResolvedValueOnce(mockUser2);

      const result = await service.getTipStats('user1');
      expect(result.totalEarned).toBe(500);
      expect(result.totalSent).toBe(200);
      expect(result.topSupporters).toHaveLength(2);
      expect(result.topSupporters[0]).toEqual({ user: mockUser1, totalAmount: 300 });
      expect(result.topSupporters[1]).toEqual({ user: mockUser2, totalAmount: 200 });
      expect(mockPrismaService.tip.aggregate).toHaveBeenCalledTimes(2);
      expect(mockPrismaService.tip.groupBy).toHaveBeenCalledWith({
        by: ['senderId'],
        where: { receiverId: 'user1' },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 5,
      });
    });

    it('should handle zero sums', async () => {
      mockPrismaService.tip.aggregate
        .mockResolvedValueOnce({ _sum: { amount: null } })
        .mockResolvedValueOnce({ _sum: { amount: null } });
      mockPrismaService.tip.groupBy.mockResolvedValue([]);
      const result = await service.getTipStats('user1');
      expect(result.totalEarned).toBe(0);
      expect(result.totalSent).toBe(0);
      expect(result.topSupporters).toEqual([]);
    });
  });

  describe('createTier', () => {
    it('should create membership tier successfully', async () => {
      const mockTier = {
        id: 'tier1',
        userId: 'user1',
        name: 'Gold',
        price: 9.99,
        currency: 'USD',
        benefits: ['Early access', 'Badge'],
        level: 'gold',
        isActive: true,
      };
      mockPrismaService.membershipTier.create.mockResolvedValue(mockTier);
      const result = await service.createTier('user1', 'Gold', 9.99, ['Early access', 'Badge'], 'gold');
      expect(result).toEqual(mockTier);
      expect(mockPrismaService.membershipTier.create).toHaveBeenCalledWith({
        data: {
          userId: 'user1',
          name: 'Gold',
          price: 9.99,
          currency: 'USD',
          benefits: ['Early access', 'Badge'],
          level: 'gold',
          isActive: true,
        },
      });
    });

    it('should throw BadRequestException for zero price', async () => {
      await expect(service.createTier('user1', 'Gold', 0, [])).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for negative price', async () => {
      await expect(service.createTier('user1', 'Gold', -5, [])).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for empty name', async () => {
      await expect(service.createTier('user1', '  ', 10, [])).rejects.toThrow(BadRequestException);
    });
  });

  describe('getUserTiers', () => {
    it('should return active tiers for user', async () => {
      const mockTiers = [
        { id: 'tier1', userId: 'user1', name: 'Bronze', price: 5 },
        { id: 'tier2', userId: 'user1', name: 'Silver', price: 10 },
      ];
      mockPrismaService.membershipTier.findMany.mockResolvedValue(mockTiers);
      const result = await service.getUserTiers('user1');
      expect(result.data).toEqual(mockTiers);
      expect(mockPrismaService.membershipTier.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: 'user1', isActive: true },
        orderBy: { price: 'asc' },
      }));
    });

    it('should return empty array when no tiers', async () => {
      mockPrismaService.membershipTier.findMany.mockResolvedValue([]);
      const result = await service.getUserTiers('user1');
      expect(result.data).toEqual([]);
    });
  });

  describe('updateTier', () => {
    const existingTier = {
      id: 'tier1',
      userId: 'owner',
      name: 'Old',
      price: 5,
      benefits: [],
      level: 'bronze',
      isActive: true,
    };

    it('should update tier successfully', async () => {
      const updatedTier = { ...existingTier, name: 'New', price: 15 };
      mockPrismaService.membershipTier.findUnique.mockResolvedValue(existingTier);
      mockPrismaService.membershipTier.update.mockResolvedValue(updatedTier);

      const result = await service.updateTier('tier1', 'owner', { name: 'New', price: 15 });
      expect(result).toEqual(updatedTier);
      expect(mockPrismaService.membershipTier.findUnique).toHaveBeenCalledWith({
        where: { id: 'tier1' },
      });
      expect(mockPrismaService.membershipTier.update).toHaveBeenCalledWith({
        where: { id: 'tier1' },
        data: { name: 'New', price: 15 },
      });
    });

    it('should throw NotFoundException when tier missing', async () => {
      mockPrismaService.membershipTier.findUnique.mockResolvedValue(null);
      await expect(service.updateTier('tier1', 'owner', { name: 'New' })).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not owner', async () => {
      mockPrismaService.membershipTier.findUnique.mockResolvedValue(existingTier);
      await expect(service.updateTier('tier1', 'not-owner', {})).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for invalid price', async () => {
      mockPrismaService.membershipTier.findUnique.mockResolvedValue(existingTier);
      await expect(service.updateTier('tier1', 'owner', { price: 0 })).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteTier', () => {
    const existingTier = {
      id: 'tier1',
      userId: 'owner',
      name: 'Test',
      price: 10,
    };

    it('should delete tier successfully', async () => {
      mockPrismaService.membershipTier.findUnique.mockResolvedValue(existingTier);
      mockPrismaService.membershipSubscription.count.mockResolvedValue(0);
      mockPrismaService.membershipTier.delete.mockResolvedValue(existingTier);

      const result = await service.deleteTier('tier1', 'owner');
      expect(result).toEqual({ message: 'Tier deleted successfully' });
      expect(mockPrismaService.membershipTier.delete).toHaveBeenCalledWith({
        where: { id: 'tier1' },
      });
    });

    it('should throw NotFoundException when tier missing', async () => {
      mockPrismaService.membershipTier.findUnique.mockResolvedValue(null);
      await expect(service.deleteTier('tier1', 'owner')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not owner', async () => {
      mockPrismaService.membershipTier.findUnique.mockResolvedValue(existingTier);
      await expect(service.deleteTier('tier1', 'not-owner')).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when active subscriptions exist', async () => {
      mockPrismaService.membershipTier.findUnique.mockResolvedValue(existingTier);
      mockPrismaService.membershipSubscription.count.mockResolvedValue(5);
      await expect(service.deleteTier('tier1', 'owner')).rejects.toThrow(BadRequestException);
    });
  });

  describe('toggleTier', () => {
    const existingTier = {
      id: 'tier1',
      userId: 'owner',
      isActive: true,
    };

    it('should toggle tier active state', async () => {
      const updatedTier = { ...existingTier, isActive: false };
      mockPrismaService.membershipTier.findUnique.mockResolvedValue(existingTier);
      mockPrismaService.membershipTier.update.mockResolvedValue(updatedTier);

      const result = await service.toggleTier('tier1', 'owner');
      expect(result).toEqual({ isActive: false });
      expect(mockPrismaService.membershipTier.update).toHaveBeenCalledWith({
        where: { id: 'tier1' },
        data: { isActive: false },
      });
    });

    it('should throw NotFoundException when tier missing', async () => {
      mockPrismaService.membershipTier.findUnique.mockResolvedValue(null);
      await expect(service.toggleTier('tier1', 'owner')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not owner', async () => {
      mockPrismaService.membershipTier.findUnique.mockResolvedValue(existingTier);
      await expect(service.toggleTier('tier1', 'not-owner')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('subscribe', () => {
    const existingTier = {
      id: 'tier1',
      userId: 'creator',
      isActive: true,
    };

    it('should create subscription as pending', async () => {
      const mockSubscription = {
        id: 'sub1',
        tierId: 'tier1',
        userId: 'subscriber',
        status: 'pending',
        startDate: new Date(),
      };
      mockPrismaService.membershipTier.findUnique.mockResolvedValue(existingTier);
      mockPrismaService.membershipSubscription.findUnique.mockResolvedValue(null);
      mockPrismaService.membershipSubscription.upsert.mockResolvedValue(mockSubscription);

      const result = await service.subscribe('tier1', 'subscriber');
      expect(result).toEqual(mockSubscription);
      expect(mockPrismaService.membershipSubscription.upsert).toHaveBeenCalledWith({
        where: { tierId_userId: { tierId: 'tier1', userId: 'subscriber' } },
        update: { status: 'pending', startDate: expect.any(Date) },
        create: {
          tierId: 'tier1',
          userId: 'subscriber',
          status: 'pending',
          startDate: expect.any(Date),
        },
      });
    });

    it('should throw NotFoundException for missing tier', async () => {
      mockPrismaService.membershipTier.findUnique.mockResolvedValue(null);
      await expect(service.subscribe('tier1', 'subscriber')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for inactive tier', async () => {
      mockPrismaService.membershipTier.findUnique.mockResolvedValue({ ...existingTier, isActive: false });
      await expect(service.subscribe('tier1', 'subscriber')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for self-subscription', async () => {
      mockPrismaService.membershipTier.findUnique.mockResolvedValue(existingTier);
      await expect(service.subscribe('tier1', 'creator')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for duplicate active subscription', async () => {
      mockPrismaService.membershipTier.findUnique.mockResolvedValue(existingTier);
      mockPrismaService.membershipSubscription.findUnique.mockResolvedValue({
        tierId: 'tier1',
        userId: 'subscriber',
        status: 'active',
      });
      await expect(service.subscribe('tier1', 'subscriber')).rejects.toThrow(BadRequestException);
    });
  });

  describe('unsubscribe', () => {
    const existingSubscription = {
      tierId: 'tier1',
      userId: 'subscriber',
      status: 'active',
    };

    it('should cancel subscription successfully', async () => {
      mockPrismaService.membershipSubscription.findUnique.mockResolvedValue(existingSubscription);
      mockPrismaService.membershipSubscription.update.mockResolvedValue({
        ...existingSubscription,
        status: 'cancelled',
        endDate: new Date(),
      });

      const result = await service.unsubscribe('tier1', 'subscriber');
      expect(result).toEqual({ message: 'Unsubscribed successfully' });
      expect(mockPrismaService.membershipSubscription.update).toHaveBeenCalledWith({
        where: { tierId_userId: { tierId: 'tier1', userId: 'subscriber' } },
        data: { status: 'cancelled', endDate: expect.any(Date) },
      });
    });

    it('should throw NotFoundException for missing subscription', async () => {
      mockPrismaService.membershipSubscription.findUnique.mockResolvedValue(null);
      await expect(service.unsubscribe('tier1', 'subscriber')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for already cancelled subscription', async () => {
      mockPrismaService.membershipSubscription.findUnique.mockResolvedValue({
        ...existingSubscription,
        status: 'cancelled',
      });
      await expect(service.unsubscribe('tier1', 'subscriber')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getSubscribers', () => {
    it('should return paginated subscribers', async () => {
      const mockTiers = [{ id: 'tier1' }, { id: 'tier2' }];
      const mockSubscriptions = [
        { id: 'sub1', tier: { id: 'tier1', name: 'Gold', price: 10 }, user: { id: 'user1', username: 'sub1' } },
        { id: 'sub2', tier: { id: 'tier2', name: 'Silver', price: 5 }, user: { id: 'user2', username: 'sub2' } },
      ];
      mockPrismaService.membershipTier.findMany.mockResolvedValue(mockTiers);
      mockPrismaService.membershipSubscription.findMany.mockResolvedValue(mockSubscriptions);

      const result = await service.getSubscribers('creator');
      expect(result.data).toEqual(mockSubscriptions);
      expect(result.meta.hasMore).toBe(false);
      expect(mockPrismaService.membershipTier.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: 'creator' },
        select: { id: true },
      }));
      expect(mockPrismaService.membershipSubscription.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          tierId: { in: ['tier1', 'tier2'] },
          status: 'active',
        },
        include: {
          tier: { select: { id: true, name: true, price: true } },
          user: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
        take: 21,
        orderBy: { createdAt: 'desc' },
      }));
    });

    it('should return empty array when user has no tiers', async () => {
      mockPrismaService.membershipTier.findMany.mockResolvedValue([]);
      const result = await service.getSubscribers('creator');
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should handle cursor pagination', async () => {
      const mockTiers = [{ id: 'tier1' }];
      const mockSubscriptions = new Array(22).fill(null).map((_, i) => ({ id: `sub${i}` }));
      mockPrismaService.membershipTier.findMany.mockResolvedValue(mockTiers);
      mockPrismaService.membershipSubscription.findMany.mockResolvedValue(mockSubscriptions);

      const result = await service.getSubscribers('creator', 'cursor123', 20);
      expect(result.data).toHaveLength(20);
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.cursor).toBe('sub19');
    });
  });
});