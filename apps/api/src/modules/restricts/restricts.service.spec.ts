import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { RestrictsService } from './restricts.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('RestrictsService', () => {
  let service: RestrictsService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        RestrictsService,
        {
          provide: PrismaService,
          useValue: {
            restrict: { create: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
            user: { findUnique: jest.fn().mockResolvedValue({ id: 'target' }), findMany: jest.fn().mockResolvedValue([]) },
          },
        },
      ],
    }).compile();
    service = module.get(RestrictsService);
    prisma = module.get(PrismaService) as any;
  });

  describe('restrict', () => {
    it('should create a restrict record', async () => {
      prisma.restrict.create.mockResolvedValue({ restricterId: 'u1', restrictedId: 'u2' });
      const result = await service.restrict('u1', 'u2');
      expect(result).toEqual({ message: 'User restricted' });
    });

    it('should throw BadRequestException when restricting self', async () => {
      await expect(service.restrict('u1', 'u1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when target not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.restrict('u1', 'u2')).rejects.toThrow(NotFoundException);
    });

    it('should return success idempotently on duplicate (P2002)', async () => {
      const { PrismaClientKnownRequestError } = require('@prisma/client/runtime/library');
      prisma.restrict.create.mockRejectedValue(new PrismaClientKnownRequestError('', { code: 'P2002', clientVersion: '0' }));
      const result = await service.restrict('u1', 'u2');
      expect(result).toEqual({ message: 'User restricted' });
    });
  });

  describe('unrestrict', () => {
    it('should delete restrict record idempotently', async () => {
      prisma.restrict.deleteMany.mockResolvedValue({ count: 1 });
      const result = await service.unrestrict('u1', 'u2');
      expect(result).toEqual({ message: 'User unrestricted' });
    });

    it('should return success even if not restricted', async () => {
      prisma.restrict.deleteMany.mockResolvedValue({ count: 0 });
      const result = await service.unrestrict('u1', 'u2');
      expect(result).toEqual({ message: 'User unrestricted' });
    });
  });

  describe('getRestrictedList', () => {
    it('should return paginated list', async () => {
      prisma.restrict.findMany.mockResolvedValue([{ restrictedId: 'u2' }]);
      prisma.user.findMany.mockResolvedValue([{ id: 'u2', username: 'user2' }]);
      const result = await service.getRestrictedList('u1');
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('isRestricted', () => {
    it('should return true when restricted', async () => {
      prisma.restrict.findUnique.mockResolvedValue({ id: 'r1' });
      expect(await service.isRestricted('u1', 'u2')).toBe(true);
    });

    it('should return false when not restricted', async () => {
      prisma.restrict.findUnique.mockResolvedValue(null);
      expect(await service.isRestricted('u1', 'u2')).toBe(false);
    });
  });

  describe('getRestrictedList — pagination', () => {
    it('should set hasMore true when results exceed limit', async () => {
      const items = Array.from({ length: 21 }, (_, i) => ({ restrictedId: `u${i}` }));
      prisma.restrict.findMany.mockResolvedValue(items);
      prisma.user.findMany.mockResolvedValue(items.slice(0, 20).map((r) => ({ id: r.restrictedId, username: r.restrictedId })));
      const result = await service.getRestrictedList('u1');
      expect(result.meta.hasMore).toBe(true);
    });

    it('should pass cursor to findMany', async () => {
      prisma.restrict.findMany.mockResolvedValue([{ restrictedId: 'u3' }]);
      prisma.user.findMany.mockResolvedValue([{ id: 'u3', username: 'user3' }]);
      await service.getRestrictedList('u1', 'u2', 10);
      expect(prisma.restrict.findMany).toHaveBeenCalledWith(expect.objectContaining({
        cursor: { restricterId_restrictedId: { restricterId: 'u1', restrictedId: 'u2' } },
        skip: 1,
        take: 11,
      }));
    });

    it('should return empty list', async () => {
      prisma.restrict.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      const result = await service.getRestrictedList('u1');
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('restrict — re-throws unknown errors', () => {
    it('should re-throw non-P2002 errors', async () => {
      prisma.restrict.create.mockRejectedValue(new Error('DB down'));
      await expect(service.restrict('u1', 'u2')).rejects.toThrow('DB down');
    });
  });

  describe('unrestrict — error handling', () => {
    it('should re-throw deleteMany errors', async () => {
      prisma.restrict.deleteMany.mockRejectedValue(new Error('Network error'));
      await expect(service.unrestrict('u1', 'u2')).rejects.toThrow('Network error');
    });
  });

  describe('getRestrictedIds', () => {
    it('should return restricted user IDs', async () => {
      prisma.restrict.findMany.mockResolvedValue([
        { restrictedId: 'u2' },
        { restrictedId: 'u3' },
      ]);
      const result = await service.getRestrictedIds('u1');
      expect(result).toEqual(['u2', 'u3']);
      expect(prisma.restrict.findMany).toHaveBeenCalledWith({
        where: { restricterId: 'u1' },
        select: { restrictedId: true },
        take: 10000,
      });
    });

    it('should return empty array when no restricts', async () => {
      prisma.restrict.findMany.mockResolvedValue([]);
      const result = await service.getRestrictedIds('u1');
      expect(result).toEqual([]);
    });
  });
});
