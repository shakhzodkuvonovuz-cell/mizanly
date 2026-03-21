import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { FollowsService } from './follows.service';
import { globalMockProviders } from '../../common/test/mock-providers';
import { NotificationsService } from '../notifications/notifications.service';

describe('FollowsService — abuse vectors (Task 96)', () => {
  let service: FollowsService;
  let prisma: any;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        FollowsService,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            follow: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
            followRequest: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
            block: { findFirst: jest.fn() },
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
          },
        },
        { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({ id: 'n-1' }) } },
      ],
    }).compile();

    service = module.get<FollowsService>(FollowsService);
    prisma = module.get(PrismaService);
  });

  it('should reject self-follow', async () => {
    await expect(service.follow('user-1', 'user-1')).rejects.toThrow(BadRequestException);
  });

  it('should be idempotent when following same user twice', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-2', isPrivate: false, isDeactivated: false, isBanned: false });
    prisma.block.findFirst.mockResolvedValue(null);
    prisma.follow.findUnique.mockResolvedValue({ followerId: 'user-1', followingId: 'user-2' });

    const result = await service.follow('user-1', 'user-2');
    expect(result.type).toBe('follow');
    // Should NOT create duplicate follow
    expect(prisma.follow.create).not.toHaveBeenCalled();
  });

  it('should reject follow when blocked in either direction', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-2', isPrivate: false, isDeactivated: false, isBanned: false });
    prisma.block.findFirst.mockResolvedValue({ id: 'block-1' });

    await expect(service.follow('user-1', 'user-2')).rejects.toThrow(ForbiddenException);
  });

  it('should reject follow of deactivated account', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-2', isPrivate: false, isDeactivated: true, isBanned: false });
    await expect(service.follow('user-1', 'user-2')).rejects.toThrow(NotFoundException);
  });

  it('should reject follow of banned account', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-2', isPrivate: false, isDeactivated: false, isBanned: true });
    await expect(service.follow('user-1', 'user-2')).rejects.toThrow(NotFoundException);
  });

  it('should be idempotent for follow request to private account', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-2', isPrivate: true, isDeactivated: false, isBanned: false });
    prisma.block.findFirst.mockResolvedValue(null);
    prisma.follow.findUnique.mockResolvedValue(null);
    prisma.followRequest.findUnique.mockResolvedValue({ senderId: 'user-1', receiverId: 'user-2', status: 'PENDING' });

    const result = await service.follow('user-1', 'user-2');
    expect(result.type).toBe('request');
    // Should NOT create duplicate request
    expect(prisma.followRequest.create).not.toHaveBeenCalled();
  });

  it('should handle unfollow of non-followed user idempotently', async () => {
    prisma.follow.findUnique.mockResolvedValue(null);
    prisma.followRequest.deleteMany.mockResolvedValue({ count: 0 });

    const result = await service.unfollow('user-1', 'user-2');
    expect(result.message).toBe('Unfollowed');
  });

  it('should reject non-existent follow request acceptance', async () => {
    prisma.followRequest.findUnique.mockResolvedValue(null);
    await expect(service.acceptRequest('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
  });
});
