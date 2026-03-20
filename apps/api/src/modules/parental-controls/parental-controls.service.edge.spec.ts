import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ParentalControlsService } from './parental-controls.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ParentalControlsService — edge cases', () => {
  let service: ParentalControlsService;
  let prisma: any;
  const parentId = 'parent-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        ParentalControlsService,
        {
          provide: PrismaService,
          useValue: {
            parentalControl: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
            user: { findUnique: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<ParentalControlsService>(ParentalControlsService);
    prisma = module.get(PrismaService);
  });

  it('should throw BadRequestException when linking self as child', async () => {
    await expect(service.linkChild(parentId, { childUserId: parentId, pin: '1234' } as any))
      .rejects.toThrow(BadRequestException);
  });

  it('should throw NotFoundException for non-existent child user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.linkChild(parentId, { childUserId: 'nonexistent', pin: '1234' } as any))
      .rejects.toThrow(NotFoundException);
  });

  it('should return empty children list for parent with no linked children', async () => {
    const result = await service.getMyChildren(parentId);
    expect(result).toEqual([]);
  });

  it('should handle parent with no children gracefully', async () => {
    // Verify service doesn't crash with empty results
    prisma.parentalControl.findMany.mockResolvedValue([]);
    const children = await service.getMyChildren(parentId);
    expect(children).toEqual([]);
  });
});
