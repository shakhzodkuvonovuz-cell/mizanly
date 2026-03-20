import { Test, TestingModule } from '@nestjs/testing';
import { AltProfileService } from './alt-profile.service';
import { PrismaService } from '../../config/prisma.service';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('AltProfileService', () => {
  let service: AltProfileService;

  const mockPrisma = {
    altProfile: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    altProfileAccess: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AltProfileService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AltProfileService>(AltProfileService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an alt profile', async () => {
      mockPrisma.altProfile.findUnique.mockResolvedValue(null);
      mockPrisma.altProfile.create.mockResolvedValue({
        id: '1', userId: 'user-1', displayName: 'AltMe', bio: 'My alt',
      });

      const result = await service.create('user-1', { displayName: 'AltMe', bio: 'My alt' });
      expect(result.displayName).toBe('AltMe');
    });

    it('should reject duplicate alt profile', async () => {
      mockPrisma.altProfile.findUnique.mockResolvedValue({ id: '1', userId: 'user-1' });
      await expect(
        service.create('user-1', { displayName: 'AltMe' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('should throw if profile not found', async () => {
      mockPrisma.altProfile.findUnique.mockResolvedValue(null);
      await expect(
        service.update('user-1', { displayName: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should throw if profile not found', async () => {
      mockPrisma.altProfile.findUnique.mockResolvedValue(null);
      await expect(
        service.delete('user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should delete existing profile', async () => {
      mockPrisma.altProfile.findUnique.mockResolvedValue({ id: '1', userId: 'user-1' });
      mockPrisma.altProfile.delete.mockResolvedValue({ id: '1' });
      const result = await service.delete('user-1');
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('getOwn', () => {
    it('should return own alt profile with access list', async () => {
      mockPrisma.altProfile.findUnique.mockResolvedValue({
        id: 'ap-1', userId: 'user-1', isActive: true, access: [{ userId: 'friend-1' }],
      });
      const result = await service.getOwn('user-1');
      expect(result.isActive).toBe(true);
      expect(result.access).toHaveLength(1);
    });

    it('should return null when no alt profile', async () => {
      mockPrisma.altProfile.findUnique.mockResolvedValue(null);
      const result = await service.getOwn('user-1');
      expect(result).toBeNull();
    });
  });

  describe('getForUser', () => {
    it('should return alt profile when viewer has access', async () => {
      mockPrisma.altProfile.findUnique.mockResolvedValue({ id: 'ap-1', userId: 'target', isActive: true });
      mockPrisma.altProfileAccess.findUnique.mockResolvedValue({ userId: 'viewer' });
      const result = await service.getForUser('target', 'viewer');
      expect(result).not.toBeNull();
    });

    it('should return null when profile inactive', async () => {
      mockPrisma.altProfile.findUnique.mockResolvedValue({ id: 'ap-1', userId: 'target', isActive: false });
      const result = await service.getForUser('target', 'viewer');
      expect(result).toBeNull();
    });

    it('should throw ForbiddenException when viewer has no access', async () => {
      mockPrisma.altProfile.findUnique.mockResolvedValue({ id: 'ap-1', userId: 'target', isActive: true });
      mockPrisma.altProfileAccess.findUnique.mockResolvedValue(null);
      await expect(service.getForUser('target', 'viewer')).rejects.toThrow();
    });
  });

  describe('addAccess', () => {
    it('should add access for target users', async () => {
      mockPrisma.altProfile.findUnique.mockResolvedValue({ id: 'ap-1', userId: 'user-1' });
      mockPrisma.altProfileAccess.create.mockResolvedValue({});
      const result = await service.addAccess('user-1', ['friend-1', 'friend-2']);
      expect(result).toHaveLength(2);
    });

    it('should throw NotFoundException when no profile exists', async () => {
      mockPrisma.altProfile.findUnique.mockResolvedValue(null);
      await expect(service.addAccess('user-1', ['friend-1'])).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for more than 100 users', async () => {
      mockPrisma.altProfile.findUnique.mockResolvedValue({ id: 'ap-1' });
      const tooMany = Array(101).fill('u').map((_, i) => `user-${i}`);
      await expect(service.addAccess('user-1', tooMany)).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeAccess', () => {
    it('should remove access for target user', async () => {
      mockPrisma.altProfile.findUnique.mockResolvedValue({ id: 'ap-1', userId: 'user-1' });
      mockPrisma.altProfileAccess.delete.mockResolvedValue({});
      const result = await service.removeAccess('user-1', 'friend-1');
      expect(result).toEqual({ removed: true });
    });

    it('should throw NotFoundException when no profile', async () => {
      mockPrisma.altProfile.findUnique.mockResolvedValue(null);
      await expect(service.removeAccess('user-1', 'friend-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAccessList', () => {
    it('should return access list', async () => {
      mockPrisma.altProfile.findUnique.mockResolvedValue({ id: 'ap-1', userId: 'user-1' });
      mockPrisma.altProfileAccess.findMany.mockResolvedValue([{ altProfileId: 'ap-1', userId: 'friend-1' }]);
      const result = await service.getAccessList('user-1');
      expect(result).toHaveLength(1);
    });
  });
});
