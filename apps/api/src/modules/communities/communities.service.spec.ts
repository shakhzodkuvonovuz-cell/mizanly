import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CommunitiesService } from './communities.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('CommunitiesService', () => {
  let service: CommunitiesService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        CommunitiesService,
        {
          provide: PrismaService,
          useValue: {
            circle: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
            circleMember: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), delete: jest.fn() },
            $transaction: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();
    service = module.get(CommunitiesService);
    prisma = module.get(PrismaService) as any;
  });

  describe('create', () => {
    it('should create a community', async () => {
      prisma.circle.findUnique.mockResolvedValue(null); // no slug conflict
      prisma.circle.create.mockResolvedValue({ id: 'c1', name: 'Test Community', slug: 'test-community' });
      const result = await service.create('u1', { name: 'Test Community' } as any);
      expect(result.data.name).toBe('Test Community');
    });

    it('should throw for duplicate slug', async () => {
      prisma.circle.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.create('u1', { name: 'Test' } as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('list', () => {
    it('should return public communities for guests', async () => {
      prisma.circle.findMany.mockResolvedValue([{ id: 'c1', createdAt: new Date() }]);
      const result = await service.list();
      expect(result.data).toHaveLength(1);
    });

    it('should include private communities for members', async () => {
      prisma.circleMember.findMany.mockResolvedValue([{ circleId: 'c2' }]);
      prisma.circle.findMany.mockResolvedValue([{ id: 'c1', createdAt: new Date() }]);
      const result = await service.list('u1');
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('getById', () => {
    it('should return public community', async () => {
      prisma.circle.findUnique.mockResolvedValue({ id: 'c1', privacy: 'PUBLIC', isBanned: false });
      const result = await service.getById('c1');
      expect(result.data.id).toBe('c1');
    });

    it('should throw NotFoundException for missing/banned', async () => {
      prisma.circle.findUnique.mockResolvedValue(null);
      await expect(service.getById('missing')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for private non-member', async () => {
      prisma.circle.findUnique.mockResolvedValue({ id: 'c1', privacy: 'PRIVATE', isBanned: false });
      prisma.circleMember.findUnique.mockResolvedValue(null);
      await expect(service.getById('c1', 'u1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('should update community as owner', async () => {
      prisma.circle.findUnique.mockResolvedValue({ ownerId: 'u1', isBanned: false });
      prisma.circle.update.mockResolvedValue({ id: 'c1', name: 'Updated' });
      const result = await service.update('c1', 'u1', { name: 'Updated' } as any);
      expect(result.data.name).toBe('Updated');
    });

    it('should throw ForbiddenException for non-owner/non-admin', async () => {
      prisma.circle.findUnique.mockResolvedValue({ ownerId: 'other', isBanned: false });
      prisma.circleMember.findUnique.mockResolvedValue(null);
      await expect(service.update('c1', 'u1', {} as any)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('delete', () => {
    it('should delete community as owner', async () => {
      prisma.circle.findUnique.mockResolvedValue({ ownerId: 'u1', isBanned: false });
      prisma.circle.delete.mockResolvedValue({});
      const result = await service.delete('c1', 'u1');
      expect(result.success).toBe(true);
    });

    it('should throw ForbiddenException for non-owner', async () => {
      prisma.circle.findUnique.mockResolvedValue({ ownerId: 'other' });
      await expect(service.delete('c1', 'u1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('join', () => {
    it('should join public community', async () => {
      prisma.circle.findUnique.mockResolvedValue({ privacy: 'PUBLIC', isBanned: false });
      prisma.circleMember.findUnique.mockResolvedValue(null);
      const result = await service.join('c1', 'u1');
      expect(result.success).toBe(true);
    });

    it('should throw ConflictException if already member', async () => {
      prisma.circle.findUnique.mockResolvedValue({ privacy: 'PUBLIC', isBanned: false });
      prisma.circleMember.findUnique.mockResolvedValue({ userId: 'u1' });
      await expect(service.join('c1', 'u1')).rejects.toThrow(ConflictException);
    });

    it('should throw ForbiddenException for invite-only', async () => {
      prisma.circle.findUnique.mockResolvedValue({ privacy: 'INVITE_ONLY', isBanned: false });
      prisma.circleMember.findUnique.mockResolvedValue(null);
      await expect(service.join('c1', 'u1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('leave', () => {
    it('should leave community', async () => {
      prisma.circle.findUnique.mockResolvedValue({ ownerId: 'other', isBanned: false });
      prisma.circleMember.findUnique.mockResolvedValue({ userId: 'u1' });
      const result = await service.leave('c1', 'u1');
      expect(result.success).toBe(true);
    });

    it('should throw BadRequestException for owner leaving', async () => {
      prisma.circle.findUnique.mockResolvedValue({ ownerId: 'u1', isBanned: false });
      await expect(service.leave('c1', 'u1')).rejects.toThrow(BadRequestException);
    });
  });
});
