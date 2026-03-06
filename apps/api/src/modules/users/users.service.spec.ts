import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: any;
  let redis: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              update: jest.fn(),
              findFirst: jest.fn(),
              count: jest.fn(),
            },
            report: {
              create: jest.fn(),
            },
          },
        },
        {
          provide: 'REDIS',
          useValue: {
            get: jest.fn(),
            setex: jest.fn(),
            del: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get(PrismaService) as any;
    redis = module.get('REDIS');
  });

  describe('getProfile', () => {
    it('should return user data for existing username', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        displayName: 'Test User',
        bio: 'Hello',
        avatarUrl: 'https://example.com/avatar.jpg',
        coverUrl: null,
        website: null,
        location: null,
        isVerified: false,
        isPrivate: false,
        followersCount: 10,
        followingCount: 5,
        postsCount: 3,
        role: 'USER',
        createdAt: new Date(),
      };
      redis.get.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getProfile('testuser');

      expect(redis.get).toHaveBeenCalledWith('user:testuser');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { username: 'testuser' },
        select: expect.any(Object),
      });
      expect(redis.setex).toHaveBeenCalledWith(
        'user:testuser',
        300,
        JSON.stringify(mockUser),
      );
      expect(result).toEqual({ ...mockUser, isFollowing: false, followRequestPending: false });
    });

    it('should return cached user if available', async () => {
      const cachedUser = {
        id: 'user-123',
        username: 'testuser',
        displayName: 'Cached User',
      };
      redis.get.mockResolvedValue(JSON.stringify(cachedUser));

      const result = await service.getProfile('testuser');

      expect(redis.get).toHaveBeenCalledWith('user:testuser');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(result).toEqual({ ...cachedUser, isFollowing: false, followRequestPending: false });
    });

    it('should throw NotFoundException for nonexistent user', async () => {
      redis.get.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateProfile', () => {
    it('should update user and invalidate cache', async () => {
      const userId = 'user-123';
      const dto = { displayName: 'Updated Name' };
      const updatedUser = {
        id: userId,
        username: 'testuser',
        displayName: 'Updated Name',
        bio: null,
        avatarUrl: null,
        coverUrl: null,
        website: null,
        location: null,
        isVerified: false,
        isPrivate: false,
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
        role: 'USER',
        createdAt: new Date(),
      };
      prisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateProfile(userId, dto);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: dto,
        select: expect.any(Object),
      });
      expect(redis.del).toHaveBeenCalledWith('user:testuser');
      expect(result).toEqual(updatedUser);
    });
  });

  describe('reportUser', () => {
    it('should create a report record', async () => {
      const reporterId = 'user-123';
      const targetId = 'user-456';
      const reason = 'spam';
      const mockReport = {
        id: 'report-789',
        reporterId,
        targetId,
        reason: 'SPAM',
        createdAt: new Date(),
      };
      prisma.report.create.mockResolvedValue(mockReport);

      const result = await service.report(reporterId, targetId, reason);

      expect(prisma.report.create).toHaveBeenCalledWith({
        data: {
          reporterId,
          reportedUserId: targetId,
          reason: 'SPAM',
        },
      });
      expect(result).toEqual({ reported: true });
    });
  });
});