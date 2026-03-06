import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { MutesService } from './mutes.service';

describe('MutesService', () => {
  let service: MutesService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MutesService,
        {
          provide: PrismaService,
          useValue: {
            mute: {
              findUnique: jest.fn(),
              create: jest.fn(),
              delete: jest.fn(),
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<MutesService>(MutesService);
    prisma = module.get(PrismaService) as any;
  });

  describe('mute', () => {
    it('should create a mute record', async () => {
      const userId = 'user-123';
      const mutedId = 'user-456';
      prisma.mute.findUnique.mockResolvedValue(null);
      prisma.mute.create.mockResolvedValue({});

      const result = await service.mute(userId, mutedId);

      expect(prisma.mute.findUnique).toHaveBeenCalledWith({
        where: { userId_mutedId: { userId, mutedId } },
      });
      expect(prisma.mute.create).toHaveBeenCalledWith({
        data: { userId, mutedId },
      });
      expect(result).toEqual({ message: 'User muted' });
    });

    it('should throw BadRequestException when muting yourself', async () => {
      const userId = 'user-123';
      const mutedId = 'user-123';

      await expect(service.mute(userId, mutedId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ConflictException if already muted', async () => {
      const userId = 'user-123';
      const mutedId = 'user-456';
      prisma.mute.findUnique.mockResolvedValue({ userId, mutedId });

      await expect(service.mute(userId, mutedId)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('unmute', () => {
    it('should delete mute record', async () => {
      const userId = 'user-123';
      const mutedId = 'user-456';
      prisma.mute.findUnique.mockResolvedValue({ userId, mutedId });
      prisma.mute.delete.mockResolvedValue({});

      const result = await service.unmute(userId, mutedId);

      expect(prisma.mute.delete).toHaveBeenCalledWith({
        where: { userId_mutedId: { userId, mutedId } },
      });
      expect(result).toEqual({ message: 'User unmuted' });
    });

    it('should throw NotFoundException if mute not found', async () => {
      const userId = 'user-123';
      const mutedId = 'user-456';
      prisma.mute.findUnique.mockResolvedValue(null);

      await expect(service.unmute(userId, mutedId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getMutedList', () => {
    it('should return paginated list of muted users', async () => {
      const userId = 'user-123';
      const mutedUser = {
        id: 'user-456',
        username: 'muteduser',
        displayName: 'Muted User',
        avatarUrl: null,
      };
      const mockMutes = [
        {
          mutedId: 'user-456',
          createdAt: new Date(),
          muted: mutedUser,
        },
      ];
      prisma.mute.findMany.mockResolvedValue(mockMutes);

      const result = await service.getMutedList(userId);

      expect(prisma.mute.findMany).toHaveBeenCalledWith({
        where: { userId },
        include: {
          muted: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
        take: 21,
        orderBy: { createdAt: 'desc' },
      });
      expect(result.data).toEqual([mutedUser]);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should support cursor pagination', async () => {
      const userId = 'user-123';
      const cursor = 'user-456';
      prisma.mute.findMany.mockResolvedValue([]);

      await service.getMutedList(userId, cursor, 10);

      expect(prisma.mute.findMany).toHaveBeenCalledWith({
        where: { userId },
        include: expect.any(Object),
        take: 11,
        cursor: { userId_mutedId: { userId, mutedId: cursor } },
        skip: 1,
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});