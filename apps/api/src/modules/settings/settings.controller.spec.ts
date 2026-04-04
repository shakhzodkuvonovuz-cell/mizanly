import { Test, TestingModule } from '@nestjs/testing';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('SettingsController', () => {
  let controller: SettingsController;
  let service: jest.Mocked<SettingsService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [
        ...globalMockProviders,
        {
          provide: SettingsService,
          useValue: {
            getSettings: jest.fn(),
            updatePrivacy: jest.fn(),
            updateNotifications: jest.fn(),
            updateAccessibility: jest.fn(),
            updateWellbeing: jest.fn(),
            getAutoPlaySetting: jest.fn(),
            updateAutoPlaySetting: jest.fn(),
            getBlockedKeywords: jest.fn(),
            addBlockedKeyword: jest.fn(),
            removeBlockedKeyword: jest.fn(),
            logScreenTime: jest.fn(),
            getScreenTimeStats: jest.fn(),
            setScreenTimeLimit: jest.fn(),
            getQuietMode: jest.fn(),
            updateQuietMode: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(SettingsController);
    service = module.get(SettingsService) as jest.Mocked<SettingsService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('getSettings', () => {
    it('should call settingsService.getSettings with userId', async () => {
      service.getSettings.mockResolvedValue({ privacy: {}, notifications: {} } as any);

      await controller.getSettings(userId);

      expect(service.getSettings).toHaveBeenCalledWith(userId);
    });
  });

  describe('updatePrivacy', () => {
    it('should call settingsService.updatePrivacy with userId and dto', async () => {
      const dto = { isPrivate: true };
      service.updatePrivacy.mockResolvedValue({ updated: true } as any);

      await controller.updatePrivacy(userId, dto as any);

      expect(service.updatePrivacy).toHaveBeenCalledWith(userId, dto);
    });
  });

  describe('updateAutoPlay', () => {
    it('should call settingsService.updateAutoPlaySetting with userId and setting', async () => {
      service.updateAutoPlaySetting.mockResolvedValue({ autoPlaySetting: 'WIFI' } as any);

      await controller.updateAutoPlay(userId, { autoPlaySetting: 'WIFI' });

      expect(service.updateAutoPlaySetting).toHaveBeenCalledWith(userId, 'WIFI');
    });
  });

  describe('addBlockedKeyword', () => {
    it('should call settingsService.addBlockedKeyword with userId and keyword', async () => {
      service.addBlockedKeyword.mockResolvedValue({ id: 'kw-1', keyword: 'spam' } as any);

      await controller.addBlockedKeyword(userId, { keyword: 'spam' } as any);

      expect(service.addBlockedKeyword).toHaveBeenCalledWith(userId, 'spam');
    });
  });

  describe('logScreenTime', () => {
    it('should call settingsService.logScreenTime with userId and seconds', async () => {
      service.logScreenTime.mockResolvedValue({ logged: true } as any);

      await controller.logScreenTime(userId, { seconds: 3600 });

      expect(service.logScreenTime).toHaveBeenCalledWith(userId, 3600);
    });
  });

  describe('getQuietMode', () => {
    it('should call settingsService.getQuietMode with userId', async () => {
      service.getQuietMode.mockResolvedValue({ enabled: false } as any);
      await controller.getQuietMode(userId);
      expect(service.getQuietMode).toHaveBeenCalledWith(userId);
    });
  });

  describe('updateNotifications', () => {
    it('delegates to settingsService.updateNotifications', async () => {
      const dto = { pushEnabled: true };
      service.updateNotifications.mockResolvedValue({ updated: true } as any);
      await controller.updateNotifications(userId, dto as any);
      expect(service.updateNotifications).toHaveBeenCalledWith(userId, dto);
    });
  });

  describe('updateAccessibility', () => {
    it('delegates to settingsService.updateAccessibility', async () => {
      const dto = { fontSize: 'large' };
      service.updateAccessibility.mockResolvedValue({ updated: true } as any);
      await controller.updateAccessibility(userId, dto as any);
      expect(service.updateAccessibility).toHaveBeenCalledWith(userId, dto);
    });
  });

  describe('updateWellbeing', () => {
    it('delegates to settingsService.updateWellbeing', async () => {
      const dto = { hideLikeCounts: true };
      service.updateWellbeing.mockResolvedValue({ updated: true } as any);
      await controller.updateWellbeing(userId, dto as any);
      expect(service.updateWellbeing).toHaveBeenCalledWith(userId, dto);
    });
  });

  describe('getAutoPlay', () => {
    it('delegates to settingsService.getAutoPlaySetting', async () => {
      service.getAutoPlaySetting.mockResolvedValue({ autoPlaySetting: 'WIFI' } as any);
      await controller.getAutoPlay(userId);
      expect(service.getAutoPlaySetting).toHaveBeenCalledWith(userId);
    });
  });

  describe('getBlockedKeywords', () => {
    it('delegates to settingsService.getBlockedKeywords', async () => {
      service.getBlockedKeywords.mockResolvedValue([{ id: 'kw-1', keyword: 'spam' }] as any);
      const result = await controller.getBlockedKeywords(userId);
      expect(service.getBlockedKeywords).toHaveBeenCalledWith(userId);
      expect(result).toHaveLength(1);
    });
  });

  describe('removeBlockedKeyword', () => {
    it('delegates to settingsService.removeBlockedKeyword', async () => {
      service.removeBlockedKeyword.mockResolvedValue({ removed: true } as any);
      await controller.removeBlockedKeyword(userId, 'kw-1');
      expect(service.removeBlockedKeyword).toHaveBeenCalledWith(userId, 'kw-1');
    });
  });

  describe('getScreenTimeStats', () => {
    it('delegates to settingsService.getScreenTimeStats', async () => {
      service.getScreenTimeStats.mockResolvedValue({ weeklyTotal: 7200 } as any);
      await controller.getScreenTimeStats(userId);
      expect(service.getScreenTimeStats).toHaveBeenCalledWith(userId);
    });
  });

  describe('setScreenTimeLimit', () => {
    it('delegates to settingsService.setScreenTimeLimit', async () => {
      service.setScreenTimeLimit.mockResolvedValue({ limitMinutes: 120 } as any);
      await controller.setScreenTimeLimit(userId, { limitMinutes: 120 } as any);
      expect(service.setScreenTimeLimit).toHaveBeenCalledWith(userId, 120);
    });
  });

  describe('updateQuietMode', () => {
    it('delegates to settingsService.updateQuietMode', async () => {
      const dto = { enabled: true, startTime: '22:00', endTime: '07:00' };
      service.updateQuietMode.mockResolvedValue({ updated: true } as any);
      await controller.updateQuietMode(userId, dto as any);
      expect(service.updateQuietMode).toHaveBeenCalledWith(userId, dto);
    });
  });
});
