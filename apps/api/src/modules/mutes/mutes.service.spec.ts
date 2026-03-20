import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { MutesService } from './mutes.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('MutesService', () => {
  let service: MutesService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        MutesService,
        {
          provide: PrismaService,
          useValue: {
            mute: {
              findUnique: jest.fn(),
              create: jest.fn(),
              delete: jest.fn(),
              deleteMany: jest.fn(),
              findMany: jest.fn(),
            },
            user: {
              findUnique: jest.fn().mockResolvedValue({ id: 'target-user' }),
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
      prisma.mute.create.mockResolvedValue({});

      const result = await service.mute(userId, mutedId);

      expect(prisma.mute.create).toHaveBeenCalled();
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
      const { PrismaClientKnownRequestError } = require('@prisma/client/runtime/library');
      prisma.mute.create.mockRejectedValue(new PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: '0' }));

      await expect(service.mute(userId, mutedId)).rejects.toThrow(ConflictException);
    });
  });

  describe('unmute', () => {
    it('should delete mute record', async () => {
      const userId = 'user-123';
      const mutedId = 'user-456';
      prisma.mute.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.unmute(userId, mutedId);

      expect(prisma.mute.deleteMany).toHaveBeenCalled();
      expect(result).toEqual({ message: 'User unmuted' });
    });

    it('should throw NotFoundException if mute not found', async () => {
      const userId = 'user-123';
      const mutedId = 'user-456';
      prisma.mute.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.unmute(userId, mutedId)).rejects.toThrow(NotFoundException);
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

    it('should set hasMore true when results exceed limit', async () => {
      const mutes = Array.from({ length: 21 }, (_, i) => ({
        mutedId: `user-${i}`, createdAt: new Date(),
        muted: { id: `user-${i}`, username: `user${i}`, displayName: `User ${i}`, avatarUrl: null },
      }));
      prisma.mute.findMany.mockResolvedValue(mutes);

      const result = await service.getMutedList('user-123');

      expect(result.data).toHaveLength(20);
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.cursor).toBe('user-19');
    });

    it('should return empty list when no mutes', async () => {
      prisma.mute.findMany.mockResolvedValue([]);
      const result = await service.getMutedList('user-123');
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
      expect(result.meta.cursor).toBeNull();
    });
  });

  describe('mute — target not found', () => {
    it('should throw NotFoundException when target user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.mute('user-123', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});