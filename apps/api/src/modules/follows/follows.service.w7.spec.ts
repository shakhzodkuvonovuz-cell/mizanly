import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { FollowsService } from './follows.service';
import { NotificationsService } from '../notifications/notifications.service';
import { globalMockProviders } from '../../common/test/mock-providers';

/**
 * W7-T5 / T09 #28-38, #81: follows race conditions, private-account access, cache invalidation, controller gap
 */
describe('FollowsService — W7 T09 gaps', () => {
  let service: FollowsService;
  let prisma: any;
  let redis: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        FollowsService,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            follow: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn() },
            followRequest: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
            block: { findFirst: jest.fn() },
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
          },
        },
        { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({ id: 'n1' }) } },
        { provide: 'REDIS', useValue: { del: jest.fn().mockResolvedValue(1), get: jest.fn().mockResolvedValue(null), setex: jest.fn() } },
      ],
    }).compile();

    service = module.get<FollowsService>(FollowsService);
    prisma = module.get(PrismaService) as any;
    redis = module.get('REDIS');
  });

  // T09 #28: follow P2002 race (direct follow)
  describe('follow — P2002 race conditions', () => {
    it('should handle P2002 on direct follow race gracefully', async () => {
      const { PrismaClientKnownRequestError } = require('@prisma/client/runtime/library');
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', isPrivate: false, isDeactivated: false, isBanned: false, username: 'u2' });
      prisma.block.findFirst.mockResolvedValue(null);
      prisma.follow.findUnique
        .mockResolvedValueOnce(null) // not following yet
        .mockResolvedValueOnce({ followerId: 'u1', followingId: 'u2' }); // after race
      prisma.$transaction.mockRejectedValue(new PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: '0' }));

      const result = await service.follow('u1', 'u2');

      expect(result.type).toBe('follow');
      expect(result.follow).toBeDefined();
    });

    // T09 #29: follow P2002 race (follow request)
    it('should handle P2002 on follow request race gracefully', async () => {
      const { PrismaClientKnownRequestError } = require('@prisma/client/runtime/library');
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', isPrivate: true, isDeactivated: false, isBanned: false, username: 'u2' });
      prisma.block.findFirst.mockResolvedValue(null);
      prisma.follow.findUnique.mockResolvedValue(null);
      prisma.followRequest.findUnique
        .mockResolvedValueOnce(null) // no existing
        .mockResolvedValueOnce({ id: 'req-1', senderId: 'u1', receiverId: 'u2', status: 'PENDING' }); // after race
      prisma.followRequest.create.mockRejectedValue(new PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: '0' }));

      const result = await service.follow('u1', 'u2');

      expect(result.type).toBe('request');
      expect(result.request).toBeDefined();
    });
  });

  // T09 #30: declined follow request re-request
  describe('follow — declined request', () => {
    it('should throw BadRequestException for declined follow request', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', isPrivate: true, isDeactivated: false, isBanned: false });
      prisma.block.findFirst.mockResolvedValue(null);
      prisma.follow.findUnique.mockResolvedValue(null);
      prisma.followRequest.findUnique.mockResolvedValue({ id: 'req-1', senderId: 'u1', receiverId: 'u2', status: 'DECLINED' });

      await expect(service.follow('u1', 'u2')).rejects.toThrow(BadRequestException);
    });
  });

  // T09 #32-34: private account access control on getFollowers/getFollowing
  describe('getFollowers/getFollowing — private account access', () => {
    it('should throw ForbiddenException for anonymous viewer on private account', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u-private', isPrivate: true });

      await expect(service.getFollowers('u-private', undefined, undefined)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for non-follower viewer on private account', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u-private', isPrivate: true });
      prisma.follow.findUnique.mockResolvedValue(null); // viewer not following

      await expect(service.getFollowers('u-private', undefined, 'viewer-1')).rejects.toThrow(ForbiddenException);
    });

    it('should allow owner to view their own private followers', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u-private', isPrivate: true });
      prisma.follow.findMany.mockResolvedValue([]);

      const result = await service.getFollowers('u-private', undefined, 'u-private');

      expect(result.data).toEqual([]);
    });

    it('should throw ForbiddenException for anonymous viewer on private getFollowing', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u-private', isPrivate: true });

      await expect(service.getFollowing('u-private', undefined, undefined)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for non-follower viewer on private getFollowing', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u-private', isPrivate: true });
      prisma.follow.findUnique.mockResolvedValue(null);

      await expect(service.getFollowing('u-private', undefined, 'viewer-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // T09 #81: acceptRequest P2002 concurrent accept
  describe('acceptRequest — P2002 concurrent accept', () => {
    it('should handle P2002 on concurrent accept idempotently', async () => {
      const { PrismaClientKnownRequestError } = require('@prisma/client/runtime/library');
      prisma.followRequest.findUnique.mockResolvedValue({
        id: 'req-1', senderId: 'u1', receiverId: 'u2', status: 'PENDING',
      });
      prisma.block.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockRejectedValue(new PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: '0' }));

      const result = await service.acceptRequest('u2', 'req-1');

      expect(result.message).toContain('accepted');
    });
  });
});
