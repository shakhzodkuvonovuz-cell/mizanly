import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CirclesService } from './circles.service';
import { PrismaService } from '../../config/prisma.service';
import { NOTIFICATION_REQUESTED } from '../../common/events/notification.events';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('CirclesService', () => {
  let service: CirclesService;
  let eventEmitter: { emit: jest.Mock };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  beforeEach(async () => {
    // Create mock prisma with jest.fn() for each method used
    prisma = {
      circle: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      circleMember: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
      },
      user: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          // Default: return all requested IDs as existing users
          const ids = where?.id?.in || [];
          return Promise.resolve(ids.map((id: string) => ({ id })));
        }),
      },
      block: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $executeRaw: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        CirclesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CirclesService>(CirclesService);
    eventEmitter = module.get(EventEmitter2) as unknown as { emit: jest.Mock };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getMyCircles', () => {
    it('should return circles owned by user', async () => {
      const userId = 'user-123';
      const mockCircles = [
        { id: 'circle-1', name: 'Friends', ownerId: userId, _count: { members: 5 } },
        { id: 'circle-2', name: 'Family', ownerId: userId, _count: { members: 3 } },
      ];
      prisma.circle.findMany.mockResolvedValue(mockCircles);

      const result = await service.getMyCircles(userId);

      expect(prisma.circle.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { ownerId: userId },
        include: { _count: { select: { members: true } } },
        orderBy: { createdAt: 'asc' },
      }));
      expect(result).toEqual(mockCircles);
    });
  });

  describe('create', () => {
    it('should create a circle with the user as owner and optional members', async () => {
      const userId = 'user-123';
      const name = 'Test Circle';
      const memberIds = ['user-456', 'user-789'];
      const mockCircle = {
        id: 'circle-abc',
        ownerId: userId,
        name,
        slug: 'test-circle-xyz',
        _count: { members: 3 },
      };
      prisma.circle.create.mockResolvedValue(mockCircle);

      const result = await service.create(userId, name, memberIds);

      expect(prisma.circle.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ ownerId: userId, name }),
      }));
      expect(result).toEqual(mockCircle);
    });

    it('should create a circle with only the owner if no memberIds', async () => {
      const userId = 'user-123';
      const name = 'Solo Circle';
      const mockCircle = {
        id: 'circle-solo',
        ownerId: userId,
        name,
        slug: 'solo-circle-xyz',
        _count: { members: 1 },
      };
      prisma.circle.create.mockResolvedValue(mockCircle);

      const result = await service.create(userId, name);

      expect(prisma.circle.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ ownerId: userId, name }),
      }));
      expect(result).toEqual(mockCircle);
    });

    it('should filter out duplicate userId from memberIds', async () => {
      const userId = 'user-123';
      const name = 'Circle';
      const memberIds = ['user-456', 'user-123', 'user-789']; // includes owner
      prisma.circle.create.mockResolvedValue({} as any);

      await service.create(userId, name, memberIds);

      expect(prisma.circle.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ ownerId: userId, name }),
      }));
    });
  });

  describe('update', () => {
    it('should update circle name if user is owner', async () => {
      const userId = 'user-123';
      const circleId = 'circle-abc';
      const newName = 'Updated Circle';
      const existingCircle = { id: circleId, ownerId: userId };
      const updatedCircle = { ...existingCircle, name: newName };
      prisma.circle.findUnique.mockResolvedValue(existingCircle);
      prisma.circle.update.mockResolvedValue(updatedCircle);

      const result = await service.update(circleId, userId, newName);

      expect(prisma.circle.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: circleId } }));
      expect(prisma.circle.update).toHaveBeenCalledWith({
        where: { id: circleId },
        data: { name: newName },
      });
      expect(result).toEqual(updatedCircle);
    });

    it('should throw NotFoundException if circle does not exist', async () => {
      prisma.circle.findUnique.mockResolvedValue(null);

      await expect(service.update('circle-abc', 'user-123', 'New Name'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      const existingCircle = { id: 'circle-abc', ownerId: 'different-user' };
      prisma.circle.findUnique.mockResolvedValue(existingCircle);

      await expect(service.update('circle-abc', 'user-123', 'New Name'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('delete', () => {
    it('should delete circle if user is owner', async () => {
      const userId = 'user-123';
      const circleId = 'circle-abc';
      const existingCircle = { id: circleId, ownerId: userId };
      prisma.circle.findUnique.mockResolvedValue(existingCircle);
      prisma.circle.delete.mockResolvedValue(existingCircle);

      const result = await service.delete(circleId, userId);

      expect(prisma.circle.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: circleId } }));
      expect(prisma.circle.delete).toHaveBeenCalledWith({ where: { id: circleId } });
      expect(result).toEqual(existingCircle);
    });

    it('should throw NotFoundException if circle does not exist', async () => {
      prisma.circle.findUnique.mockResolvedValue(null);

      await expect(service.delete('circle-abc', 'user-123'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      const existingCircle = { id: 'circle-abc', ownerId: 'different-user' };
      prisma.circle.findUnique.mockResolvedValue(existingCircle);

      await expect(service.delete('circle-abc', 'user-123'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('addMembers', () => {
    it('should add members if user is owner', async () => {
      const userId = 'user-123';
      const circleId = 'circle-abc';
      const memberIds = ['user-456', 'user-789'];
      const existingCircle = { id: circleId, ownerId: userId };
      prisma.circle.findUnique.mockResolvedValue(existingCircle);
      prisma.circleMember.createMany.mockResolvedValue({ count: 2 });

      const result = await service.addMembers(circleId, userId, memberIds);

      expect(prisma.circle.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: circleId } }));
      expect(prisma.circleMember.createMany).toHaveBeenCalledWith({
        data: [
          { circleId, userId: 'user-456' },
          { circleId, userId: 'user-789' },
        ],
        skipDuplicates: true,
      });
      expect(result).toEqual({ added: 2 });
    });

    it('should throw NotFoundException if circle not found', async () => {
      prisma.circle.findUnique.mockResolvedValue(null);

      await expect(service.addMembers('circle-abc', 'user-123', ['user-456']))
        .rejects.toThrow(NotFoundException);
    });

    it('should filter out blocked users from addMembers', async () => {
      const userId = 'user-123';
      const circleId = 'circle-abc';
      const existingCircle = { id: circleId, ownerId: userId };
      prisma.circle.findUnique.mockResolvedValue(existingCircle);
      prisma.block.findMany.mockResolvedValue([
        { blockerId: userId, blockedId: 'user-789' },
      ]);
      prisma.circleMember.createMany.mockResolvedValue({ count: 1 });

      const result = await service.addMembers(circleId, userId, ['user-456', 'user-789']);

      // user-789 should be filtered out by block check
      expect(prisma.circleMember.createMany).toHaveBeenCalledWith({
        data: [{ circleId, userId: 'user-456' }],
        skipDuplicates: true,
      });
      expect(result).toEqual({ added: 1 });
    });

    it('should return added:0 if all members are blocked', async () => {
      const userId = 'user-123';
      const circleId = 'circle-abc';
      const existingCircle = { id: circleId, ownerId: userId };
      prisma.circle.findUnique.mockResolvedValue(existingCircle);
      prisma.block.findMany.mockResolvedValue([
        { blockerId: userId, blockedId: 'user-456' },
        { blockerId: 'user-789', blockedId: userId },
      ]);

      const result = await service.addMembers(circleId, userId, ['user-456', 'user-789']);
      expect(result).toEqual({ added: 0 });
      expect(prisma.circleMember.createMany).not.toHaveBeenCalled();
    });
  });

  describe('removeMembers', () => {
    it('should remove members if user is owner', async () => {
      const userId = 'user-123';
      const circleId = 'circle-abc';
      const memberIds = ['user-456', 'user-789'];
      const existingCircle = { id: circleId, ownerId: userId, name: 'Test Circle' };
      prisma.circle.findUnique.mockResolvedValue(existingCircle);
      prisma.circleMember.deleteMany.mockResolvedValue({ count: 2 });

      const result = await service.removeMembers(circleId, userId, memberIds);

      expect(prisma.circle.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: circleId } }));
      expect(prisma.circleMember.deleteMany).toHaveBeenCalledWith({
        where: { circleId, userId: { in: memberIds } },
      });
      expect(result).toEqual({ removed: 2 });
    });

    it('should throw NotFoundException if circle not found', async () => {
      prisma.circle.findUnique.mockResolvedValue(null);

      await expect(service.removeMembers('circle-abc', 'user-123', ['user-456']))
        .rejects.toThrow(NotFoundException);
    });

    it('should send SYSTEM notification to removed members', async () => {
      const userId = 'user-123';
      const circleId = 'circle-abc';
      const memberIds = ['user-456', 'user-789'];
      const existingCircle = { id: circleId, ownerId: userId, name: 'Study Group' };
      prisma.circle.findUnique.mockResolvedValue(existingCircle);
      prisma.circleMember.deleteMany.mockResolvedValue({ count: 2 });

      await service.removeMembers(circleId, userId, memberIds);

      // Should notify each removed member
      expect(eventEmitter.emit).toHaveBeenCalledTimes(2);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        NOTIFICATION_REQUESTED,
        expect.objectContaining({
          userId: 'user-456',
          actorId: userId,
          type: 'SYSTEM',
          circleId,
          title: 'Removed from circle',
          body: 'You were removed from "Study Group"',
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        NOTIFICATION_REQUESTED,
        expect.objectContaining({
          userId: 'user-789',
          actorId: userId,
          type: 'SYSTEM',
          circleId,
          title: 'Removed from circle',
          body: 'You were removed from "Study Group"',
        }),
      );
    });

    it('should not send notifications when no members are actually removed', async () => {
      const userId = 'user-123';
      const circleId = 'circle-abc';
      const existingCircle = { id: circleId, ownerId: userId, name: 'Empty' };
      prisma.circle.findUnique.mockResolvedValue(existingCircle);
      prisma.circleMember.deleteMany.mockResolvedValue({ count: 0 });

      await service.removeMembers(circleId, userId, ['user-456']);

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should not send notification when trying to remove the owner', async () => {
      const userId = 'user-123';
      const circleId = 'circle-abc';
      const existingCircle = { id: circleId, ownerId: userId, name: 'My Circle' };
      prisma.circle.findUnique.mockResolvedValue(existingCircle);

      const result = await service.removeMembers(circleId, userId, [userId]);

      expect(result).toEqual({ removed: 0 });
      expect(prisma.circleMember.deleteMany).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('getMembers', () => {
    it('should return members with pagination if user is owner', async () => {
      const userId = 'user-123';
      const circleId = 'circle-abc';
      const existingCircle = { id: circleId, ownerId: userId };
      const mockMembers = [
        { circleId, userId: 'user-456', user: { id: 'user-456', username: 'john', displayName: 'John', avatarUrl: null } },
      ];
      prisma.circle.findUnique.mockResolvedValue(existingCircle);
      prisma.circleMember.findMany.mockResolvedValue(mockMembers);

      const result = await service.getMembers(circleId, userId);

      expect(prisma.circle.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: circleId } }));
      expect(prisma.circleMember.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { circleId },
        include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
      }));
      expect(result.data).toEqual(mockMembers);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should throw NotFoundException if circle not found', async () => {
      prisma.circle.findUnique.mockResolvedValue(null);

      await expect(service.getMembers('circle-abc', 'user-123'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('cleanupExpiredCircleInvites', () => {
    beforeEach(() => {
      prisma.circleInvite = {
        deleteMany: jest.fn(),
      };
    });

    it('should delete expired circle invites and return count', async () => {
      prisma.circleInvite.deleteMany.mockResolvedValue({ count: 3 });
      const result = await service.cleanupExpiredCircleInvites();
      expect(result).toBe(3);
      expect(prisma.circleInvite.deleteMany).toHaveBeenCalledWith({
        where: {
          expiresAt: { not: null, lt: expect.any(Date) },
        },
      });
    });

    it('should return 0 when no expired invites exist', async () => {
      prisma.circleInvite.deleteMany.mockResolvedValue({ count: 0 });
      const result = await service.cleanupExpiredCircleInvites();
      expect(result).toBe(0);
    });

    it('should return 0 and log error on failure', async () => {
      prisma.circleInvite.deleteMany.mockRejectedValue(new Error('DB error'));
      const result = await service.cleanupExpiredCircleInvites();
      expect(result).toBe(0);
    });
  });
});