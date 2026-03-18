import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import { AuthService } from './auth.service';
import { createClerkClient } from '@clerk/backend';
import { globalMockProviders } from '../../common/test/mock-providers';

// Mock the Clerk client
jest.mock('@clerk/backend', () => ({
  createClerkClient: jest.fn(),
}));

const mockClerkClient = {
  users: {
    getUser: jest.fn(),
  },
};

(createClerkClient as jest.Mock).mockReturnValue(mockClerkClient);

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let config: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              upsert: jest.fn(),
              findMany: jest.fn(),
              updateMany: jest.fn(),
            },
            userSettings: {
              upsert: jest.fn(),
            },
            userInterest: {
              deleteMany: jest.fn(),
              createMany: jest.fn(),
            },
            follow: {
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get(PrismaService) as any;
    config = module.get(ConfigService) as any;
    config.get.mockReturnValue('fake-secret-key');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('syncClerkUser', () => {
    it('should upsert user with clerk data', async () => {
      const clerkId = 'clerk-123';
      const data = {
        email: 'user@example.com',
        displayName: 'John Doe',
        avatarUrl: 'https://example.com/avatar.jpg',
      };
      const mockUser = {
        id: 'user-456',
        clerkId,
        email: data.email,
        username: 'user_clerk-123',
        displayName: data.displayName,
        avatarUrl: data.avatarUrl,
      };
      prisma.user.upsert.mockResolvedValue(mockUser);

      const result = await service.syncClerkUser(clerkId, data);

      expect(prisma.user.upsert).toHaveBeenCalledWith({
        where: { clerkId },
        create: {
          clerkId,
          email: data.email,
          username: expect.stringContaining('user_'),
          displayName: data.displayName,
          avatarUrl: data.avatarUrl,
        },
        update: {
          email: data.email,
          displayName: data.displayName,
          avatarUrl: data.avatarUrl,
        },
      });
      expect(result).toEqual(mockUser);
    });
  });

  describe('deactivateByClerkId', () => {
    it('should deactivate user by clerkId', async () => {
      const clerkId = 'clerk-123';
      prisma.user.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.deactivateByClerkId(clerkId);

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { clerkId },
        data: { isDeactivated: true, deactivatedAt: expect.any(Date) },
      });
      expect(result).toEqual({ count: 1 });
    });
  });

  describe('checkUsername', () => {
    it('should return available if username not taken', async () => {
      const username = 'newuser';
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.checkUsername(username);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { username: username.toLowerCase() },
      });
      expect(result).toEqual({ available: true });
    });

    it('should return unavailable if username taken', async () => {
      const username = 'existing';
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', username });

      const result = await service.checkUsername(username);

      expect(result).toEqual({ available: false });
    });
  });

  describe('getMe', () => {
    it('should return user details', async () => {
      const userId = 'user-123';
      const mockUser = {
        id: userId,
        username: 'testuser',
        displayName: 'Test User',
        bio: 'Hello',
        avatarUrl: null,
        coverUrl: null,
        website: null,
        location: null,
        followersCount: 10,
        followingCount: 5,
        postsCount: 3,
        role: 'USER',
        isVerified: false,
        isPrivate: false,
        language: 'en',
        theme: 'dark',
        createdAt: new Date(),
        settings: {},
      };
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getMe(userId);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        select: expect.any(Object),
      });
      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('setInterests', () => {
    it('should replace user interests', async () => {
      const userId = 'user-123';
      const dto = { categories: ['tech', 'sports'] };
      prisma.userInterest.deleteMany.mockResolvedValue({ count: 2 });
      prisma.userInterest.createMany.mockResolvedValue({ count: 2 });

      const result = await service.setInterests(userId, dto);

      expect(prisma.userInterest.deleteMany).toHaveBeenCalledWith({ where: { userId } });
      expect(prisma.userInterest.createMany).toHaveBeenCalledWith({
        data: [
          { userId, category: 'tech' },
          { userId, category: 'sports' },
        ],
      });
      expect(result).toEqual({ message: 'Interests updated', categories: dto.categories });
    });
  });

  describe('getSuggestedUsers', () => {
    it('should return suggested users based on friends-of-friends', async () => {
      const userId = 'user-123';
      const mockFollowing = [{ followingId: 'user-456' }];
      const mockSuggestions = [
        {
          id: 'user-789',
          username: 'suggested1',
          displayName: 'Suggested One',
          avatarUrl: null,
          isVerified: false,
          followersCount: 10,
        },
      ];
      prisma.follow.findMany.mockResolvedValue(mockFollowing);
      prisma.user.findMany
        .mockResolvedValueOnce(mockSuggestions) // first call (friends-of-friends)
        .mockResolvedValueOnce([]); // second call (popular fallback not needed)

      const result = await service.getSuggestedUsers(userId, 5);

      expect(prisma.follow.findMany).toHaveBeenCalledWith({
        where: { followerId: userId },
        select: { followingId: true },
      });
      expect(result).toEqual(mockSuggestions);
    });

    it('should fallback to popular users if not enough suggestions', async () => {
      const userId = 'user-123';
      const mockFollowing = [{ followingId: 'user-456' }];
      const mockSuggestions = [{ id: 'user-789', username: 'suggested1' }];
      const mockPopular = [{ id: 'user-999', username: 'popular' }];
      prisma.follow.findMany.mockResolvedValue(mockFollowing);
      prisma.user.findMany
        .mockResolvedValueOnce(mockSuggestions) // first call returns 1
        .mockResolvedValueOnce(mockPopular); // second call returns 1

      const result = await service.getSuggestedUsers(userId, 5);

      expect(result).toHaveLength(2);
    });
  });

  // Note: register method is complex due to Clerk dependency; we skip for brevity
});