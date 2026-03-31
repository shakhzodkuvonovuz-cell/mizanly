import { Test, TestingModule } from '@nestjs/testing';
import { DevicesService } from './devices.service';
import { PrismaService } from '../../config/prisma.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('DevicesService', () => {
  let service: DevicesService;
  let prisma: { [key: string]: { [key: string]: jest.Mock } };

  beforeEach(async () => {
    // Create mock prisma with jest.fn() for each method used
    prisma = {
      device: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        DevicesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<DevicesService>(DevicesService);
  });

  describe('register', () => {
    it('should upsert device with active status', async () => {
      const userId = 'user-123';
      const pushToken = 'token-abc';
      const platform = 'ios';
      const deviceId = 'device-xyz';
      const mockDevice = {
        id: 'device-record',
        userId,
        pushToken,
        platform,
        deviceId,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.device.upsert.mockResolvedValue(mockDevice);

      const result = await service.register(userId, pushToken, platform, deviceId);

      expect(prisma.device.upsert).toHaveBeenCalledWith({
        where: { pushToken },
        create: { userId, pushToken, platform, deviceId, isActive: true },
        update: { userId, platform, deviceId, isActive: true, updatedAt: expect.any(Date) },
      });
      expect(result).toEqual(mockDevice);
    });

    it('should work without deviceId', async () => {
      const userId = 'user-123';
      const pushToken = 'token-abc';
      const platform = 'android';
      prisma.device.upsert.mockResolvedValue({} as any);

      await service.register(userId, pushToken, platform);

      expect(prisma.device.upsert).toHaveBeenCalledWith({
        where: { pushToken },
        create: { userId, pushToken, platform, deviceId: undefined, isActive: true },
        update: { userId, platform, deviceId: undefined, isActive: true, updatedAt: expect.any(Date) },
      });
    });
  });

  describe('unregister', () => {
    it('should deactivate device for user and token', async () => {
      const userId = 'user-123';
      const pushToken = 'token-abc';
      prisma.device.updateMany.mockResolvedValue({ count: 1 });

      await service.unregister(pushToken, userId);

      expect(prisma.device.updateMany).toHaveBeenCalledWith({
        where: { pushToken, userId },
        data: { isActive: false },
      });
    });
  });

  describe('getActiveTokensForUser', () => {
    it('should return array of push tokens for active devices', async () => {
      const userId = 'user-123';
      const mockDevices = [
        { pushToken: 'token-1' },
        { pushToken: 'token-2' },
      ];
      prisma.device.findMany.mockResolvedValue(mockDevices);

      const result = await service.getActiveTokensForUser(userId);

      expect(prisma.device.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId, isActive: true },
        select: { pushToken: true },
      }));
      expect(result).toEqual(['token-1', 'token-2']);
    });

    it('should return empty array if no active devices', async () => {
      prisma.device.findMany.mockResolvedValue([]);

      const result = await service.getActiveTokensForUser('user-123');

      expect(result).toEqual([]);
    });
  });

  describe('getActiveTokensForUsers', () => {
    it('should return tokens for multiple users', async () => {
      const userIds = ['user-123', 'user-456'];
      const mockDevices = [
        { pushToken: 'token-a' },
        { pushToken: 'token-b' },
        { pushToken: 'token-c' },
      ];
      prisma.device.findMany.mockResolvedValue(mockDevices);

      const result = await service.getActiveTokensForUsers(userIds);

      expect(prisma.device.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: { in: userIds }, isActive: true },
        select: { pushToken: true },
      }));
      expect(result).toEqual(['token-a', 'token-b', 'token-c']);
    });
  });

  describe('getSessions', () => {
    it('should return active sessions for user', async () => {
      prisma.device.findMany.mockResolvedValue([
        { id: 'd1', platform: 'ios', deviceName: 'iPhone 15', lastActiveAt: new Date() },
        { id: 'd2', platform: 'android', deviceName: 'Pixel 8', lastActiveAt: new Date() },
      ]);
      const result = await service.getSessions('user-1');
      expect(result).toHaveLength(2);
      expect(result[0].platform).toBe('ios');
    });
  });

  describe('logoutSession', () => {
    it('should deactivate specific session', async () => {
      prisma.device.updateMany.mockResolvedValue({ count: 1 });
      const result = await service.logoutSession('session-1', 'user-1');
      expect(result).toEqual({ loggedOut: true });
      expect(prisma.device.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', userId: 'user-1' },
        data: { isActive: false },
      });
    });
  });

  describe('logoutAllOtherSessions', () => {
    it('should deactivate all sessions except current', async () => {
      prisma.device.updateMany.mockResolvedValue({ count: 3 });
      const result = await service.logoutAllOtherSessions('user-1', 'current-session');
      expect(result).toEqual({ loggedOut: true });
      expect(prisma.device.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isActive: true, id: { not: 'current-session' } },
        data: { isActive: false },
      });
    });
  });

  describe('touchSession', () => {
    it('should update lastActiveAt and ipAddress using updateMany with userId', async () => {
      prisma.device.updateMany.mockResolvedValue({ count: 1 });
      await service.touchSession('device-1', '192.168.1.1', 'user-1');
      expect(prisma.device.updateMany).toHaveBeenCalledWith({
        where: { id: 'device-1', userId: 'user-1' },
        data: expect.objectContaining({ lastActiveAt: expect.any(Date), ipAddress: '192.168.1.1' }),
      });
    });

    it('should skip when deviceId is empty', async () => {
      await service.touchSession('');
      expect(prisma.device.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('cleanupStaleTokens', () => {
    it('should delete stale inactive tokens', async () => {
      prisma.device.deleteMany.mockResolvedValue({ count: 5 });
      const result = await service.cleanupStaleTokens(90);
      expect(result).toBe(5);
    });

    it('should return 0 when no stale tokens found', async () => {
      prisma.device.deleteMany.mockResolvedValue({ count: 0 });
      const result = await service.cleanupStaleTokens(30);
      expect(result).toBe(0);
    });

    it('should return 0 on database error', async () => {
      prisma.device.deleteMany.mockRejectedValue(new Error('DB error'));
      const result = await service.cleanupStaleTokens();
      expect(result).toBe(0);
    });
  });

  describe('touchSession — without ip', () => {
    it('should only set lastActiveAt when no ipAddress provided', async () => {
      prisma.device.updateMany.mockResolvedValue({ count: 1 });
      await service.touchSession('device-1');
      expect(prisma.device.updateMany).toHaveBeenCalledWith({
        where: { id: 'device-1' },
        data: { lastActiveAt: expect.any(Date) },
      });
    });
  });
});