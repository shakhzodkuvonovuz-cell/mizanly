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
        upsert: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
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
        update: { userId, platform, deviceId, isActive: true },
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
        update: { userId, platform, deviceId: undefined, isActive: true },
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

      expect(prisma.device.findMany).toHaveBeenCalledWith({
        where: { userId, isActive: true },
        select: { pushToken: true },
      });
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

      expect(prisma.device.findMany).toHaveBeenCalledWith({
        where: { userId: { in: userIds }, isActive: true },
        select: { pushToken: true },
      });
      expect(result).toEqual(['token-a', 'token-b', 'token-c']);
    });
  });
});