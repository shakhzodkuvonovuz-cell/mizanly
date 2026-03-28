/**
 * Remaining authorization matrix tests — Tasks 50-70 coverage.
 * Each service gets 4-6 ownership/access control tests.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { globalMockProviders } from '../common/test/mock-providers';

import { CommerceService } from '../modules/commerce/commerce.service';
import { CommunitiesService } from '../modules/communities/communities.service';
// EncryptionService REMOVED — replaced by Go E2E Key Server
import { AltProfileService } from '../modules/alt-profile/alt-profile.service';

describe('Auth Matrix — remaining services', () => {
  // ── Task 41: CommerceService auth ──
  describe('CommerceService — auth matrix', () => {
    let service: CommerceService;
    let prisma: any;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders,
          CommerceService,
          {
            provide: PrismaService,
            useValue: {
              product: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
              productReview: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
              order: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
              halalBusiness: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
              businessReview: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
              zakatFund: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
              zakatDonation: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
              communityTreasury: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
              treasuryContribution: { create: jest.fn() },
              premiumSubscription: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
              $transaction: jest.fn(),
            },
          },
        ],
      }).compile();
      service = module.get(CommerceService);
      prisma = module.get(PrismaService);
    });

    it('should reject negative product price', async () => {
      await expect(service.createProduct('u1', { title: 'Test', price: -1, description: 'x', category: 'OTHER' } as any))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for order of non-existent product', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(service.createOrder('u1', { productId: 'nonexistent', quantity: 1 } as any))
        .rejects.toThrow(NotFoundException);
    });

    it('should return non-premium status for user without subscription', async () => {
      prisma.premiumSubscription.findUnique.mockResolvedValue(null);
      const result = await service.getPremiumStatus('u1');
      expect(result.isPremium).toBe(false);
    });

    it('should throw NotFoundException when cancelling non-existent premium', async () => {
      prisma.premiumSubscription.findUnique.mockResolvedValue(null);
      await expect(service.cancelPremium('u1')).rejects.toThrow(NotFoundException);
    });

    it('should return empty products list', async () => {
      const result = await service.getProducts();
      expect(result.data).toEqual([]);
    });

    it('should return empty orders for user with no orders', async () => {
      const result = await service.getMyOrders('u1');
      expect(result.data).toEqual([]);
    });

    it('should throw NotFoundException for non-existent product details', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(service.getProduct('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should create product with valid data', async () => {
      prisma.product.create.mockResolvedValue({ id: 'p-1', title: 'Test', price: 10 });
      const result = await service.createProduct('u1', { title: 'Test', price: 10, description: 'desc', category: 'OTHER' } as any);
      expect(result).toBeDefined();
      expect(result).toHaveProperty('id', 'p-1');
      expect(result.title).toBe('Test');
    });
  });

  // EncryptionService auth tests REMOVED — module replaced by Go E2E Key Server.
  // E2E key management tests in apps/mobile/src/services/signal/__tests__/ (546 tests)
  // and apps/api/src/modules/messages/messages.e2e-fields.spec.ts (65 tests).

  // ── Task 49: AltProfileService auth ──
  describe('AltProfileService — auth matrix', () => {
    let service: AltProfileService;
    let prisma: any;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders,
          AltProfileService,
          {
            provide: PrismaService,
            useValue: {
              altProfile: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
              altProfileAccess: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), createMany: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
              post: { findMany: jest.fn().mockResolvedValue([]) },
            },
          },
        ],
      }).compile();
      service = module.get(AltProfileService);
      prisma = module.get(PrismaService);
    });

    it('should create profile for self', async () => {
      prisma.altProfile.findUnique.mockResolvedValue(null);
      prisma.altProfile.create.mockResolvedValue({ userId: 'u1', displayName: 'Alt' });
      const result = await service.create('u1', { displayName: 'Alt' });
      expect(result.userId).toBe('u1');
    });

    it('should throw ConflictException for duplicate alt profile', async () => {
      prisma.altProfile.findUnique.mockResolvedValue({ userId: 'u1' });
      await expect(service.create('u1', { displayName: 'Alt2' })).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException when updating non-existent profile', async () => {
      prisma.altProfile.findUnique.mockResolvedValue(null);
      await expect(service.update('u1', { displayName: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for non-granted viewer', async () => {
      prisma.altProfile.findUnique.mockResolvedValue({ id: 'ap-1', userId: 'u1', isActive: true });
      prisma.altProfileAccess.findUnique.mockResolvedValue(null);
      await expect(service.getForUser('u1', 'u2')).rejects.toThrow(ForbiddenException);
    });

    it('should allow owner to view own profile', async () => {
      prisma.altProfile.findUnique.mockResolvedValue({ id: 'ap-1', userId: 'u1', isActive: true, displayName: 'Alt', bio: null, avatarUrl: null, createdAt: new Date() });
      const result = await service.getForUser('u1', 'u1');
      expect(result).toBeDefined();
      expect(result!.displayName).toBe('Alt');
    });

    it('should throw NotFoundException when deleting non-existent profile', async () => {
      prisma.altProfile.findUnique.mockResolvedValue(null);
      await expect(service.delete('u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for access list of non-existent profile', async () => {
      prisma.altProfile.findUnique.mockResolvedValue(null);
      await expect(service.getAccessList('u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for too many bulk access adds', async () => {
      prisma.altProfile.findUnique.mockResolvedValue({ id: 'ap-1', userId: 'u1' });
      const tooMany = Array.from({ length: 101 }, (_, i) => `user-${i}`);
      await expect(service.addAccess('u1', tooMany)).rejects.toThrow(BadRequestException);
    });
  });

  // ── CommunitiesService — additional auth ──
  describe('CommunitiesService — additional auth', () => {
    let service: CommunitiesService;
    let prisma: any;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders,
          CommunitiesService,
          {
            provide: PrismaService,
            useValue: {
              circle: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn() },
              circleMember: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
              circleRole: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn() },
              $transaction: jest.fn(),
            },
          },
        ],
      }).compile();
      service = module.get(CommunitiesService);
      prisma = module.get(PrismaService);
    });

    it('should create community', async () => {
      prisma.circle.create.mockResolvedValue({ id: 'c-1', name: 'Test', ownerId: 'u1' });
      prisma.circleMember.create.mockResolvedValue({});
      const result = await service.create('u1', { name: 'Test' } as any);
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('data');
      expect(result.data.name).toBe('Test');
    });

    it('should return empty community list', async () => {
      const result = await service.list();
      expect(result.data).toEqual([]);
    });

    it('should throw NotFoundException for non-existent community', async () => {
      prisma.circle.findUnique.mockResolvedValue(null);
      await expect(service.getById('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when non-owner updates', async () => {
      prisma.circle.findUnique.mockResolvedValue({ id: 'c-1', ownerId: 'owner' });
      await expect(service.update('c-1', 'attacker', {} as any)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when non-owner deletes', async () => {
      prisma.circle.findUnique.mockResolvedValue({ id: 'c-1', ownerId: 'owner' });
      await expect(service.delete('c-1', 'attacker')).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when joining non-existent community', async () => {
      prisma.circle.findUnique.mockResolvedValue(null);
      await expect(service.join('nonexistent', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when leaving non-existent community', async () => {
      prisma.circle.findUnique.mockResolvedValue(null);
      await expect(service.leave('nonexistent', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should return empty members list', async () => {
      prisma.circle.findUnique.mockResolvedValue({ id: 'c-1', ownerId: 'u1' });
      const result = await service.listMembers('c-1');
      expect(result.data).toEqual([]);
    });

    it('should throw NotFoundException when updating non-existent community', async () => {
      prisma.circle.findUnique.mockResolvedValue(null);
      await expect(service.update('nonexistent', 'u1', {} as any)).rejects.toThrow(NotFoundException);
    });
  });
});
