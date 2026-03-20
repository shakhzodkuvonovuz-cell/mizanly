import { Test, TestingModule } from '@nestjs/testing';
import { AltProfileService } from './alt-profile.service';
import { PrismaService } from '../../config/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

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
});
