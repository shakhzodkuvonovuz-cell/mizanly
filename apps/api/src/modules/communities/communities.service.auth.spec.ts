import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CommunitiesService } from './communities.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('CommunitiesService — authorization matrix', () => {
  let service: CommunitiesService;
  let prisma: any;
  const userA = 'user-a';
  const userB = 'user-b';
  const mockCommunity = { id: 'comm-1', ownerId: userA, name: 'Test', isPrivate: false };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
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

    service = module.get<CommunitiesService>(CommunitiesService);
    prisma = module.get(PrismaService);
  });

  it('should allow owner to update community', async () => {
    prisma.circle.findUnique.mockResolvedValue(mockCommunity);
    prisma.circle.update.mockResolvedValue({ ...mockCommunity, name: 'Updated' });
    const result = await service.update('comm-1', userA, { name: 'Updated' } as any);
    expect(result).toBeDefined();
    expect(prisma.circle.update).toHaveBeenCalled();
  });

  it('should throw ForbiddenException when non-owner updates', async () => {
    prisma.circle.findUnique.mockResolvedValue(mockCommunity);
    await expect(service.update('comm-1', userB, { name: 'Hacked' } as any))
      .rejects.toThrow(ForbiddenException);
  });

  it('should allow owner to delete community', async () => {
    prisma.circle.findUnique.mockResolvedValue(mockCommunity);
    prisma.circle.delete.mockResolvedValue({});
    prisma.$transaction.mockResolvedValue([{}]);
    const result = await service.delete('comm-1', userA);
    expect(result).toBeDefined();
  });

  it('should throw ForbiddenException when non-owner deletes', async () => {
    prisma.circle.findUnique.mockResolvedValue(mockCommunity);
    await expect(service.delete('comm-1', userB)).rejects.toThrow(ForbiddenException);
  });

  it('should throw NotFoundException for non-existent community', async () => {
    prisma.circle.findUnique.mockResolvedValue(null);
    await expect(service.getById('nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when deleting non-existent community', async () => {
    prisma.circle.findUnique.mockResolvedValue(null);
    await expect(service.delete('nonexistent', userA)).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when updating non-existent community', async () => {
    prisma.circle.findUnique.mockResolvedValue(null);
    await expect(service.update('nonexistent', userA, {} as any)).rejects.toThrow(NotFoundException);
  });

  it('should return empty members for community with no members', async () => {
    prisma.circle.findUnique.mockResolvedValue(mockCommunity);
    const result = await service.listMembers('comm-1');
    expect(result.data).toEqual([]);
  });
});
