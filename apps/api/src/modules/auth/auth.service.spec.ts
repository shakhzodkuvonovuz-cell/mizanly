import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
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
              create: jest.fn().mockResolvedValue({}),
            },
            userInterest: {
              deleteMany: jest.fn(),
              createMany: jest.fn(),
            },
            follow: {
              findMany: jest.fn(),
            },
            device: {
              deleteMany: jest.fn(),
            },
            twoFactorSecret: {
              findUnique: jest.fn(),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: 'REDIS',
          useValue: {
            incr: jest.fn().mockResolvedValue(1),
            eval: jest.fn().mockResolvedValue(1),
            expire: jest.fn().mockResolvedValue(1),
            del: jest.fn().mockResolvedValue(1),
            get: jest.fn().mockResolvedValue(null),
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
        select: { id: true, username: true, displayName: true, bio: true },
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

      expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          clerkId,
          email: data.email,
          displayName: data.displayName,
          avatarUrl: data.avatarUrl,
        }),
        select: { id: true, username: true, displayName: true, bio: true },
      }));
      expect(result).toEqual(mockUser);
    });
  });

  describe('deactivateByClerkId', () => {
    it('should deactivate user by clerkId', async () => {
      const clerkId = 'clerk-123';
      const mockUser = { id: 'user-123', clerkId };
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({ ...mockUser, isDeactivated: true });
      prisma.device.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.deactivateByClerkId(clerkId);

      expect(prisma.user.findFirst).toHaveBeenCalledWith({ where: { clerkId } });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: {
          isDeactivated: true,
          deactivatedAt: expect.any(Date),
          isDeleted: true,
          deletedAt: expect.any(Date),
          scheduledDeletionAt: expect.any(Date),
        },
      });
      expect(prisma.device.deleteMany).toHaveBeenCalledWith({ where: { userId: mockUser.id } });
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
    it('should return user details with twoFactorEnabled false when no 2FA record', async () => {
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
        tosAcceptedAt: new Date('2026-01-01'),
      };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.twoFactorSecret.findUnique.mockResolvedValue(null);

      const result = await service.getMe(userId);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        select: expect.any(Object),
      });
      expect(result).toEqual({ ...mockUser, twoFactorEnabled: false, registrationCompleted: true });
    });

    it('should return twoFactorEnabled true when 2FA is enabled', async () => {
      const userId = 'user-123';
      const mockUser = {
        id: userId,
        username: 'testuser',
        displayName: 'Test User',
        bio: '',
        avatarUrl: null,
        coverUrl: null,
        website: null,
        location: null,
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
        role: 'USER',
        isVerified: false,
        isPrivate: false,
        language: 'en',
        theme: 'dark',
        createdAt: new Date(),
        settings: {},
        tosAcceptedAt: null,
      };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.twoFactorSecret.findUnique.mockResolvedValue({ isEnabled: true });

      const result = await service.getMe(userId);

      expect(result.twoFactorEnabled).toBe(true);
      expect(result.registrationCompleted).toBe(false); // webhook-created user without ToS
      expect(prisma.twoFactorSecret.findUnique).toHaveBeenCalledWith({
        where: { userId },
        select: { isEnabled: true },
      });
    });

    it('should return twoFactorEnabled false when 2FA exists but not enabled', async () => {
      const userId = 'user-123';
      const mockUser = {
        id: userId,
        username: 'testuser',
        displayName: 'Test User',
        bio: '',
        avatarUrl: null,
        coverUrl: null,
        website: null,
        location: null,
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
        role: 'USER',
        isVerified: false,
        isPrivate: false,
        language: 'en',
        theme: 'dark',
        createdAt: new Date(),
        settings: {},
        tosAcceptedAt: new Date('2026-01-01'),
      };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.twoFactorSecret.findUnique.mockResolvedValue({ isEnabled: false });

      const result = await service.getMe(userId);

      expect(result.twoFactorEnabled).toBe(false);
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
        take: 1000,
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

    it('should reject registration when device has 5+ accounts', async () => {
      const redis = { incr: jest.fn().mockResolvedValue(1), eval: jest.fn().mockResolvedValue(1), expire: jest.fn(), del: jest.fn(), get: jest.fn().mockResolvedValue('5') } as any;
      // Access the private redis field to override it for this test
      (service as any).redis = redis;

      await expect(
        service.register('clerk-abc', {
          username: 'test',
          displayName: 'Test',
          dateOfBirth: '2000-01-01',
          acceptedTerms: true,
          deviceId: 'device-123',
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(redis.get).toHaveBeenCalledWith('device:accounts:device-123');
    });

    it('should allow registration when device has fewer than 5 accounts', async () => {
      const clerkId = 'clerk-new';
      const redis = { incr: jest.fn().mockResolvedValue(1), eval: jest.fn().mockResolvedValue(1), expire: jest.fn(), del: jest.fn(), get: jest.fn().mockResolvedValue('3') } as any;
      (service as any).redis = redis;
      mockClerkClient.users.getUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'new@example.com' }],
      });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.upsert.mockResolvedValue({ id: 'user-new', clerkId });
      prisma.userSettings.upsert.mockResolvedValue({});

      const result = await service.register(clerkId, {
        username: 'newuser',
        displayName: 'New User',
        dateOfBirth: '2000-01-01',
        acceptedTerms: true,
        deviceId: 'device-456',
      } as any);

      expect(result.id).toBe('user-new');
      // Should increment device counter atomically after successful registration
      expect(redis.eval).toHaveBeenCalledWith(
        expect.stringContaining('INCR'),
        1, 'device:accounts:device-456', 90 * 24 * 60 * 60,
      );
    });

    it('should skip device check when deviceId is not provided', async () => {
      const clerkId = 'clerk-no-device';
      const redis = { incr: jest.fn().mockResolvedValue(1), eval: jest.fn().mockResolvedValue(1), expire: jest.fn(), del: jest.fn(), get: jest.fn() } as any;
      (service as any).redis = redis;
      mockClerkClient.users.getUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'nodevice@example.com' }],
      });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.upsert.mockResolvedValue({ id: 'user-nd', clerkId });
      prisma.userSettings.upsert.mockResolvedValue({});

      await service.register(clerkId, {
        username: 'nodevice',
        displayName: 'No Device',
        dateOfBirth: '2000-01-01',
        acceptedTerms: true,
      } as any);

      // redis.get should not be called for device_accounts when no deviceId
      expect(redis.get).not.toHaveBeenCalledWith(expect.stringContaining('device:accounts:'));
    });
  });

  // ── T01 Critical Compliance Tests ──

  describe('register — COPPA age check (T01 #1)', () => {
    it('should reject registration for users under 13', async () => {
      // 12-year-old
      const dob = new Date();
      dob.setFullYear(dob.getFullYear() - 12);
      const dto = {
        username: 'kid',
        displayName: 'Kid',
        dateOfBirth: dob.toISOString().split('T')[0],
        acceptedTerms: true,
      } as any;

      await expect(service.register('clerk-kid', dto)).rejects.toThrow(ForbiddenException);
      await expect(service.register('clerk-kid', dto)).rejects.toThrow(/at least 13 years old/);
    });

    it('should allow registration for users exactly 13', async () => {
      const dob = new Date();
      dob.setFullYear(dob.getFullYear() - 13);
      // Ensure birthday has passed this year
      dob.setMonth(0);
      dob.setDate(1);
      const dto = {
        username: 'teen',
        displayName: 'Teen',
        dateOfBirth: dob.toISOString().split('T')[0],
        acceptedTerms: true,
      } as any;

      mockClerkClient.users.getUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'teen@example.com' }],
      });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.upsert.mockResolvedValue({ id: 'user-teen', clerkId: 'clerk-teen' });
      prisma.userSettings.upsert.mockResolvedValue({});

      const result = await service.register('clerk-teen', dto);
      expect(result.id).toBe('user-teen');
    });
  });

  describe('register — minor flag isChildAccount (T01 #5)', () => {
    it('should set isChildAccount true for 15-year-old', async () => {
      const dob = new Date();
      dob.setFullYear(dob.getFullYear() - 15);
      dob.setMonth(0);
      dob.setDate(1);
      const dto = {
        username: 'minor15',
        displayName: 'Minor',
        dateOfBirth: dob.toISOString().split('T')[0],
        acceptedTerms: true,
      } as any;

      mockClerkClient.users.getUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'minor@example.com' }],
      });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.upsert.mockResolvedValue({ id: 'user-minor' });
      prisma.userSettings.upsert.mockResolvedValue({});

      await service.register('clerk-minor', dto);

      expect(prisma.user.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ isChildAccount: true }),
        }),
      );
    });

    it('should set isChildAccount false for 19-year-old', async () => {
      const dob = new Date();
      dob.setFullYear(dob.getFullYear() - 19);
      dob.setMonth(0);
      dob.setDate(1);
      const dto = {
        username: 'adult19',
        displayName: 'Adult',
        dateOfBirth: dob.toISOString().split('T')[0],
        acceptedTerms: true,
      } as any;

      mockClerkClient.users.getUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'adult@example.com' }],
      });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.upsert.mockResolvedValue({ id: 'user-adult' });
      prisma.userSettings.upsert.mockResolvedValue({});

      await service.register('clerk-adult', dto);

      expect(prisma.user.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ isChildAccount: false }),
        }),
      );
    });
  });

  describe('register — terms rejection (T01 #2)', () => {
    it('should reject registration when acceptedTerms is false', async () => {
      const dto = {
        username: 'notoserms',
        displayName: 'No Terms',
        dateOfBirth: '2000-01-01',
        acceptedTerms: false,
      } as any;

      await expect(service.register('clerk-noterms', dto)).rejects.toThrow(BadRequestException);
      await expect(service.register('clerk-noterms', dto)).rejects.toThrow(/Terms of Service/);
    });
  });

  describe('register — re-registration within 30 days of deletion (T01 #3)', () => {
    it('should reject re-registration when email was deleted within 30 days', async () => {
      const dto = {
        username: 'reregistered',
        displayName: 'Rereg',
        dateOfBirth: '2000-01-01',
        acceptedTerms: true,
      } as any;

      mockClerkClient.users.getUser.mockResolvedValue({
        emailAddresses: [{ emailAddress: 'deleted@example.com' }],
      });
      // Username check passes
      prisma.user.findUnique.mockResolvedValue(null);
      // Recently deleted user found
      prisma.user.findFirst.mockResolvedValue({
        id: 'deleted-user',
        email: 'deleted@example.com',
        isDeleted: true,
        deletedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
      });

      await expect(service.register('clerk-rereg', dto)).rejects.toThrow(BadRequestException);
      await expect(service.register('clerk-rereg', dto)).rejects.toThrow(/recently deleted/);
    });
  });

  describe('register — rate limit (T01 #4)', () => {
    it('should reject registration when more than 5 attempts', async () => {
      const dto = {
        username: 'ratelimited',
        displayName: 'Rate',
        dateOfBirth: '2000-01-01',
        acceptedTerms: true,
      } as any;

      // Override redis to simulate atomicIncr returning 6
      const redis = { incr: jest.fn(), eval: jest.fn().mockResolvedValue(6), expire: jest.fn(), del: jest.fn(), get: jest.fn().mockResolvedValue(null) } as any;
      (service as any).redis = redis;

      await expect(service.register('clerk-ratelimit', dto)).rejects.toThrow(ForbiddenException);
      await expect(service.register('clerk-ratelimit', dto)).rejects.toThrow(/Too many registration attempts/);
    });
  });

  describe('trackLogin (T01 #6)', () => {
    it('should update lastSeenAt for the user', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 1 });

      await service.trackLogin('clerk-123');

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { clerkId: 'clerk-123', isDeactivated: false, isDeleted: false },
        data: { lastSeenAt: expect.any(Date) },
      });
    });
  });

  describe('findByClerkId (T01 #7)', () => {
    it('should return user id when found', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-abc' });

      const result = await service.findByClerkId('clerk-found');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { clerkId: 'clerk-found' },
        select: { id: true },
      });
      expect(result).toEqual({ id: 'user-abc' });
    });

    it('should return null when not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.findByClerkId('clerk-missing');
      expect(result).toBeNull();
    });
  });

  describe('getRedis (T01 #8)', () => {
    it('should expose the Redis client', () => {
      const redis = service.getRedis();
      expect(redis).toBeDefined();
      // Should be the same redis instance injected
      expect(typeof redis.get).toBe('function');
    });
  });
});