import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { AltProfileService } from './alt-profile.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('AltProfileService — authorization matrix', () => {
  let service: AltProfileService;
  let prisma: any;
  const userA = 'user-a';
  const userB = 'user-b';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
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

    service = module.get<AltProfileService>(AltProfileService);
    prisma = module.get(PrismaService);
  });

  it('should create profile for self only', async () => {
    prisma.altProfile.findUnique.mockResolvedValue(null);
    prisma.altProfile.create.mockResolvedValue({ userId: userA, displayName: 'Alt' });
    const result = await service.create(userA, { displayName: 'Alt' });
    expect(result.userId).toBe(userA);
  });

  it('should throw ConflictException for duplicate profile', async () => {
    prisma.altProfile.findUnique.mockResolvedValue({ userId: userA });
    await expect(service.create(userA, { displayName: 'Alt2' })).rejects.toThrow(ConflictException);
  });

  it('should throw NotFoundException when updating non-existent profile', async () => {
    prisma.altProfile.findUnique.mockResolvedValue(null);
    await expect(service.update(userA, { displayName: 'Updated' })).rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException when non-granted user views alt profile', async () => {
    prisma.altProfile.findUnique.mockResolvedValue({ id: 'ap-1', userId: userA, isActive: true });
    prisma.altProfileAccess.findUnique.mockResolvedValue(null);
    await expect(service.getForUser(userA, userB)).rejects.toThrow(ForbiddenException);
  });

  it('should allow owner to view own alt profile', async () => {
    prisma.altProfile.findUnique.mockResolvedValue({ id: 'ap-1', userId: userA, isActive: true, displayName: 'Alt' });
    const result = await service.getForUser(userA, userA);
    expect(result).toBeDefined();
    expect(result!.displayName).toBe('Alt');
  });

  it('should throw NotFoundException when deleting non-existent profile', async () => {
    prisma.altProfile.findUnique.mockResolvedValue(null);
    await expect(service.delete(userA)).rejects.toThrow(NotFoundException);
  });
});
