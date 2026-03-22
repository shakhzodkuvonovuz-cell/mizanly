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
              findFirst: jest.fn(),
              upsert: jest.fn(),
              update: jest.fn(),
              create: jest.fn(),
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
            pushToken: {
              deleteMany: jest.fn(),
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
    it('should update existing user with clerk data', async () => {
      const clerkId = 'clerk-123';
      const data = {
        email: 'user@example.com',
        displayName: 'John Doe',
        avatarUrl: 'https://example.com/avatar.jpg',
      };
      const existingUser = {
        id: 'user-456',
        clerkId,
        username: 'existing_user',
      };
      const updatedUser = {
        id: 'user-456',
        clerkId,
        email: data.email,
        username: 'existing_user',
        displayName: data.displayName,
        avatarUrl: data.avatarUrl,
      };
      prisma.user.findUnique.mockResolvedValue(existingUser);
      prisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.syncClerkUser(clerkId, data);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { clerkId } });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { clerkId },
        data: {
          email: data.email,
          displayName: data.displayName,
          avatarUrl: data.avatarUrl,
        },
      });
      expect(result).toEqual(updatedUser);
    });

    it('should create new user when clerkId not found', async () => {
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
        username: expect.stringContaining('user_'),
        displayName: data.displayName,
        avatarUrl: data.avatarUrl,
      };
      // First findUnique (by clerkId) returns null — new user
      prisma.user.findUnique
        .mockResolvedValueOnce(null)    // clerkId lookup
        .mockResolvedValueOnce(null);   // username collision check
      prisma.user.create.mockResolvedValue(mockUser);

      const result = await service.syncClerkUser(clerkId, data);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clerkId,
          email: data.email,
          displayName: data.displayName,
          avatarUrl: data.avatarUrl,
        }),
      });
      expect(result).toEqual(mockUser);
    });
  });

  describe('deactivateByClerkId', () => {
    it('should deactivate user by clerkId', async () => {
      const clerkId = 'clerk-123';
      const mockUser = { id: 'user-123', clerkId };
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({ ...mockUser, isDeactivated: true });
      prisma.pushToken.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.deactivateByClerkId(clerkId);

      expect(prisma.user.findFirst).toHaveBeenCalledWith({ where: { clerkId } });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { isDeactivated: true, deactivatedAt: expect.any(Date) },
      });
      expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({ where: { userId: mockUser.id } });
      expect(result).toEqual({ count: 1 });
    });

    it('should return count 0 when user not found', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      const result = await service.deactivateByClerkId('nonexistent');

      expect(result).toEqual({ count: 0 });
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
        take: 5000,
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

  describe('register', () => {
    it('should register a new user with Clerk data', async () => {
      const clerkId = 'clerk-abc';
      const dto = { username: 'JohnDoe', displayName: 'John Doe', bio: 'Hello', avatarUrl: 'https://example.com/av.jpg', language: 'en', dateOfBirth: '2000-01-01', acceptedTerms: true };
      mockClerkClient.users.getUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'john@example.com' }],
      });
      prisma.user.findUnique.mockResolvedValue(null); // username not taken
      prisma.user.upsert.mockResolvedValue({ id: 'user-1', clerkId, username: 'johndoe', email: 'john@example.com' });
      prisma.userSettings.upsert.mockResolvedValue({});

      const result = await service.register(clerkId, dto as any);

      expect(mockClerkClient.users.getUser).toHaveBeenCalledWith(clerkId);
      expect(prisma.user.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { clerkId },
        create: expect.objectContaining({ username: 'johndoe', email: 'john@example.com' }),
      }));
      expect(prisma.userSettings.upsert).toHaveBeenCalled();
      expect(result.id).toBe('user-1');
    });

    it('should throw BadRequestException when Clerk has no email', async () => {
      mockClerkClient.users.getUser.mockResolvedValue({ emailAddresses: [] });

      await expect(service.register('clerk-abc', { username: 'test', displayName: 'Test', dateOfBirth: '2000-01-01', acceptedTerms: true } as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when username taken by another user', async () => {
      mockClerkClient.users.getUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'john@example.com' }],
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'other-user', clerkId: 'clerk-other' });

      await expect(service.register('clerk-abc', { username: 'taken', displayName: 'Test', dateOfBirth: '2000-01-01', acceptedTerms: true } as any)).rejects.toThrow(ConflictException);
    });

    it('should allow re-registration with same clerkId owning the username', async () => {
      const clerkId = 'clerk-abc';
      mockClerkClient.users.getUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'john@example.com' }],
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', clerkId }); // same user
      prisma.user.upsert.mockResolvedValue({ id: 'user-1', clerkId, username: 'myname' });
      prisma.userSettings.upsert.mockResolvedValue({});

      const result = await service.register(clerkId, { username: 'myname', displayName: 'Test', dateOfBirth: '2000-01-01', acceptedTerms: true } as any);

      expect(result.id).toBe('user-1');
    });

    it('should default language to en when not provided', async () => {
      const clerkId = 'clerk-abc';
      mockClerkClient.users.getUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'john@example.com' }],
      });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.upsert.mockResolvedValue({ id: 'user-1', clerkId });
      prisma.userSettings.upsert.mockResolvedValue({});

      await service.register(clerkId, { username: 'test', displayName: 'Test', dateOfBirth: '2000-01-01', acceptedTerms: true } as any);

      expect(prisma.user.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ language: 'en' }),
      }));
    });

    it('should lowercase the username', async () => {
      const clerkId = 'clerk-abc';
      mockClerkClient.users.getUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'john@example.com' }],
      });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.upsert.mockResolvedValue({ id: 'user-1', clerkId });
      prisma.userSettings.upsert.mockResolvedValue({});

      await service.register(clerkId, { username: 'MyUser', displayName: 'Test', dateOfBirth: '2000-01-01', acceptedTerms: true } as any);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { username: 'myuser' } });
      expect(prisma.user.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ username: 'myuser' }),
      }));
    });
  });
});