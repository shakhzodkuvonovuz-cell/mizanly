import { Test, TestingModule } from '@nestjs/testing';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('DevicesController', () => {
  let controller: DevicesController;
  let service: jest.Mocked<DevicesService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DevicesController],
      providers: [
        ...globalMockProviders,
        {
          provide: DevicesService,
          useValue: {
            register: jest.fn(),
            unregister: jest.fn(),
            getSessions: jest.fn(),
            logoutSession: jest.fn(),
            logoutAllOtherSessions: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        {
          provide: TwoFactorService,
          useValue: {
            getStatus: jest.fn().mockResolvedValue(false),
            isTwoFactorVerified: jest.fn().mockResolvedValue(true),
            clearTwoFactorSession: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get(DevicesController);
    service = module.get(DevicesService) as jest.Mocked<DevicesService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('register', () => {
    it('should call devicesService.register with userId, pushToken, platform, deviceId', async () => {
      const dto = { pushToken: 'expo-token-123', platform: 'ios', deviceId: 'device-1' };
      service.register.mockResolvedValue({ id: 'dev-1', ...dto } as any);

      const result = await controller.register(userId, dto as any);

      expect(service.register).toHaveBeenCalledWith(userId, 'expo-token-123', 'ios', 'device-1');
      expect(result).toEqual(expect.objectContaining({ pushToken: 'expo-token-123' }));
    });
  });

  describe('unregister', () => {
    it('should call devicesService.unregister with token and userId', async () => {
      service.unregister.mockResolvedValue({ removed: true } as any);

      const result = await controller.unregister(userId, 'expo-token-123');

      expect(service.unregister).toHaveBeenCalledWith('expo-token-123', userId);
      expect(result).toEqual({ removed: true });
    });
  });

  describe('getSessions', () => {
    it('should call devicesService.getSessions with userId', async () => {
      const mockSessions = [{ id: 'sess-1', platform: 'ios', lastActive: new Date() }];
      service.getSessions.mockResolvedValue(mockSessions as any);

      const result = await controller.getSessions(userId);

      expect(service.getSessions).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockSessions);
    });
  });

  describe('logoutSession', () => {
    it('should call devicesService.logoutSession with sessionId and userId', async () => {
      service.logoutSession.mockResolvedValue({ loggedOut: true } as any);

      const result = await controller.logoutSession(userId, 'sess-1');

      expect(service.logoutSession).toHaveBeenCalledWith('sess-1', userId);
      expect(result).toEqual({ loggedOut: true });
    });
  });

  describe('logoutAllOtherSessions', () => {
    it('should call devicesService.logoutAllOtherSessions with userId and currentSessionId', async () => {
      service.logoutAllOtherSessions.mockResolvedValue({ loggedOut: 3 } as any);

      const result = await controller.logoutAllOtherSessions(userId, { currentSessionId: 'sess-1' });

      expect(service.logoutAllOtherSessions).toHaveBeenCalledWith(userId, 'sess-1');
      expect(result).toEqual({ loggedOut: 3 });
    });
  });
});
