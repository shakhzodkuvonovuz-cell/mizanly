import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { AltProfileService } from './alt-profile.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('AltProfileService — edge cases', () => {
  let service: AltProfileService;
  let prisma: any;
  const userId = 'user-edge-1';

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

  it('should create alt profile with Arabic name', async () => {
    prisma.altProfile.findUnique.mockResolvedValue(null);
    prisma.altProfile.create.mockResolvedValue({ userId, displayName: 'عبد الله' });
    const result = await service.create(userId, { displayName: 'عبد الله' });
    expect(result.displayName).toBe('عبد الله');
  });

  it('should throw ForbiddenException when User B views User A alt profile without access', async () => {
    prisma.altProfile.findUnique.mockResolvedValue({ id: 'alt-1', userId: 'user-a', displayName: 'Alt', isActive: true });
    prisma.altProfileAccess.findUnique.mockResolvedValue(null);
    await expect(service.getForUser('user-a', 'user-b'))
      .rejects.toThrow(ForbiddenException);
  });

  it('should throw NotFoundException when deleting non-existent alt profile', async () => {
    prisma.altProfile.findUnique.mockResolvedValue(null);
    await expect(service.delete(userId))
      .rejects.toThrow(NotFoundException);
  });
});
