import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CommunitiesService } from './communities.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('CommunitiesService — edge cases', () => {
  let service: CommunitiesService;
  let prisma: any;

  const userId = 'user-edge-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        CommunitiesService,
        {
          provide: PrismaService,
          useValue: {
            circle: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn(),
              delete: jest.fn(),
            },
            circleMember: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              delete: jest.fn(),
            },
            circleRole: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn(),
              delete: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CommunitiesService>(CommunitiesService);
    prisma = module.get(PrismaService);
  });

  describe('create — edge cases', () => {
    it('should accept Arabic community name', async () => {
      prisma.circle.create.mockResolvedValue({
        id: 'comm-1',
        name: 'مجتمع المسلمين',
        ownerId: userId,
      });

      const result = await service.create(userId, {
        name: 'مجتمع المسلمين',
        description: 'Community for Muslims',
      } as any);

      expect(result).toBeDefined();
      expect(prisma.circle.create).toHaveBeenCalled();
    });
  });

  describe('getById — edge cases', () => {
    it('should throw NotFoundException for non-existent community', async () => {
      prisma.circle.findUnique.mockResolvedValue(null);

      await expect(service.getById('nonexistent'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('listMembers — edge cases', () => {
    it('should return empty array for community with 0 members', async () => {
      prisma.circle.findUnique.mockResolvedValue({ id: 'comm-1', ownerId: userId });
      prisma.circleMember.findMany.mockResolvedValue([]);

      const result = await service.listMembers('comm-1');
      expect(result.data).toEqual([]);
    });
  });

  describe('list — edge cases', () => {
    it('should return empty when no communities exist', async () => {
      const result = await service.list();
      expect(result.data).toEqual([]);
    });
  });

  describe('delete — edge cases', () => {
    it('should throw NotFoundException for non-existent community', async () => {
      prisma.circle.findUnique.mockResolvedValue(null);

      await expect(service.delete('nonexistent', userId))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when non-owner tries to delete', async () => {
      prisma.circle.findUnique.mockResolvedValue({ id: 'comm-1', ownerId: 'other-user' });

      await expect(service.delete('comm-1', userId))
        .rejects.toThrow(ForbiddenException);
    });
  });
});
