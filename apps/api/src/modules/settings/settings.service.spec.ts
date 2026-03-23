import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { SettingsService } from './settings.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('SettingsService', () => {
  let service: SettingsService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        SettingsService,
        {
          provide: PrismaService,
          useValue: {
            userSettings: {
              upsert: jest.fn(),
            },
            user: {
              update: jest.fn(),
            },
            blockedKeyword: {
              findMany: jest.fn(),
              upsert: jest.fn(),
              findUnique: jest.fn(),
              delete: jest.fn(),
            },
            quietModeSetting: {
              findUnique: jest.fn(),
              upsert: jest.fn(),
            },
            screenTimeLog: {
              upsert: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
          },
        },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
    prisma = module.get(PrismaService) as any;
  });

  describe('getSettings', () => {
    it('should return user settings, creating if not exist', async () => {
      const userId = 'user-123';
      const mockSettings = { userId, id: 'settings-1' };
      prisma.userSettings.upsert.mockResolvedValue(mockSettings);

      const result = await service.getSettings(userId);

      expect(prisma.userSettings.upsert).toHaveBeenCalledWith({
        where: { userId },
        create: { userId },
        update: {},
      });
      expect(result).toEqual(mockSettings);
    });
  });

  describe('updatePrivacy', () => {
    it('should update privacy settings and user.isPrivate', async () => {
      const userId = 'user-123';
      const dto = { isPrivate: true, activityStatus: false };
      const mockSettings = { userId, activityStatus: false };
      prisma.userSettings.upsert.mockResolvedValue(mockSettings);
      prisma.user.update.mockResolvedValue({ id: userId, isPrivate: true });

      const result = await service.updatePrivacy(userId, dto);

      expect(prisma.userSettings.upsert).toHaveBeenCalledWith({
        where: { userId },
        create: { userId, activityStatus: false },
        update: { activityStatus: false },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { isPrivate: true },
      });
      expect(result).toEqual(mockSettings);
    });

    it('should not update user.isPrivate if not provided', async () => {
      const userId = 'user-123';
      const dto = { activityStatus: true };
      prisma.userSettings.upsert.mockResolvedValue({ userId });

      await service.updatePrivacy(userId, dto);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('should update readReceipts setting', async () => {
      const userId = 'user-123';
      const dto = { readReceipts: false };
      const mockSettings = { userId, readReceipts: false };
      prisma.userSettings.upsert.mockResolvedValue(mockSettings);

      const result = await service.updatePrivacy(userId, dto);

      expect(prisma.userSettings.upsert).toHaveBeenCalledWith({
        where: { userId },
        create: { userId, readReceipts: false },
        update: { readReceipts: false },
      });
      expect(result).toEqual(mockSettings);
    });

    it('should update typingIndicators setting', async () => {
      const userId = 'user-123';
      const dto = { typingIndicators: false };
      const mockSettings = { userId, typingIndicators: false };
      prisma.userSettings.upsert.mockResolvedValue(mockSettings);

      const result = await service.updatePrivacy(userId, dto);

      expect(prisma.userSettings.upsert).toHaveBeenCalledWith({
        where: { userId },
        create: { userId, typingIndicators: false },
        update: { typingIndicators: false },
      });
      expect(result).toEqual(mockSettings);
    });

    it('should update lastSeenVisibility setting', async () => {
      const userId = 'user-123';
      const dto = { lastSeenVisibility: 'nobody' };
      const mockSettings = { userId, lastSeenVisibility: 'nobody' };
      prisma.userSettings.upsert.mockResolvedValue(mockSettings);

      const result = await service.updatePrivacy(userId, dto);

      expect(prisma.userSettings.upsert).toHaveBeenCalledWith({
        where: { userId },
        create: { userId, lastSeenVisibility: 'nobody' },
        update: { lastSeenVisibility: 'nobody' },
      });
      expect(result).toEqual(mockSettings);
    });

    it('should update all status privacy settings at once', async () => {
      const userId = 'user-123';
      const dto = { readReceipts: false, typingIndicators: false, lastSeenVisibility: 'contacts' as const };
      const mockSettings = { userId, ...dto };
      prisma.userSettings.upsert.mockResolvedValue(mockSettings);

      const result = await service.updatePrivacy(userId, dto);

      expect(prisma.userSettings.upsert).toHaveBeenCalledWith({
        where: { userId },
        create: { userId, readReceipts: false, typingIndicators: false, lastSeenVisibility: 'contacts' },
        update: { readReceipts: false, typingIndicators: false, lastSeenVisibility: 'contacts' },
      });
      expect(result).toEqual(mockSettings);
    });
  });

  describe('updateNotifications', () => {
    it('should upsert notification settings', async () => {
      const userId = 'user-123';
      const dto = { notifyLikes: true, notifyComments: false };
      const mockSettings = { userId, ...dto };
      prisma.userSettings.upsert.mockResolvedValue(mockSettings);

      const result = await service.updateNotifications(userId, dto);

      expect(prisma.userSettings.upsert).toHaveBeenCalledWith({
        where: { userId },
        create: { userId, ...dto },
        update: dto,
      });
      expect(result).toEqual(mockSettings);
    });
  });

  describe('updateAccessibility', () => {
    it('should upsert accessibility settings', async () => {
      const userId = 'user-123';
      const dto = { reducedMotion: true, highContrast: false };
      const mockSettings = { userId, ...dto };
      prisma.userSettings.upsert.mockResolvedValue(mockSettings);

      const result = await service.updateAccessibility(userId, dto);

      expect(prisma.userSettings.upsert).toHaveBeenCalledWith({
        where: { userId },
        create: { userId, ...dto },
        update: dto,
      });
      expect(result).toEqual(mockSettings);
    });
  });

  describe('updateWellbeing', () => {
    it('should upsert wellbeing settings', async () => {
      const userId = 'user-123';
      const dto = { sensitiveContent: true, restrictedMode: true };
      const mockSettings = { userId, ...dto };
      prisma.userSettings.upsert.mockResolvedValue(mockSettings);

      const result = await service.updateWellbeing(userId, dto);

      expect(prisma.userSettings.upsert).toHaveBeenCalledWith({
        where: { userId },
        create: { userId, ...dto },
        update: dto,
      });
      expect(result).toEqual(mockSettings);
    });
  });

  describe('getBlockedKeywords', () => {
    it('should return user blocked keywords ordered by createdAt', async () => {
      const userId = 'user-123';
      const mockKeywords = [
        { id: 'kw-1', keyword: 'spam', createdAt: new Date('2024-01-01') },
        { id: 'kw-2', keyword: 'ads', createdAt: new Date('2024-01-02') },
      ];
      prisma.blockedKeyword.findMany.mockResolvedValue(mockKeywords);

      const result = await service.getBlockedKeywords(userId);

      expect(prisma.blockedKeyword.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }));
      expect(result).toEqual(mockKeywords);
    });
  });

  describe('addBlockedKeyword', () => {
    it('should add blocked keyword in lowercase', async () => {
      const userId = 'user-123';
      const keyword = 'SPAM';
      const mockKeyword = { id: 'kw-1', userId, keyword: 'spam' };
      prisma.blockedKeyword.upsert.mockResolvedValue(mockKeyword);

      const result = await service.addBlockedKeyword(userId, keyword);

      expect(prisma.blockedKeyword.upsert).toHaveBeenCalledWith({
        where: { userId_keyword: { userId, keyword: 'spam' } },
        create: { userId, keyword: 'spam' },
        update: {},
      });
      expect(result).toEqual(mockKeyword);
    });
  });

  describe('removeBlockedKeyword', () => {
    it('should delete keyword when user owns it', async () => {
      const userId = 'user-123';
      const keywordId = 'kw-1';
      const mockKeyword = { id: keywordId, userId, keyword: 'spam' };
      prisma.blockedKeyword.findUnique.mockResolvedValue(mockKeyword);
      prisma.blockedKeyword.delete.mockResolvedValue({});

      const result = await service.removeBlockedKeyword(userId, keywordId);

      expect(prisma.blockedKeyword.findUnique).toHaveBeenCalledWith({ where: { id: keywordId } });
      expect(prisma.blockedKeyword.delete).toHaveBeenCalledWith({ where: { id: keywordId } });
      expect(result).toEqual({ message: 'Keyword removed' });
    });

    it('should throw NotFoundException when keyword not found', async () => {
      const userId = 'user-123';
      const keywordId = 'kw-1';
      prisma.blockedKeyword.findUnique.mockResolvedValue(null);

      await expect(service.removeBlockedKeyword(userId, keywordId)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when deleting another user keyword', async () => {
      const userId = 'user-123';
      const keywordId = 'kw-1';
      const mockKeyword = { id: keywordId, userId: 'other-user', keyword: 'spam' };
      prisma.blockedKeyword.findUnique.mockResolvedValue(mockKeyword);

      await expect(service.removeBlockedKeyword(userId, keywordId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getQuietMode', () => {
    it('should return quiet mode settings', async () => {
      prisma.quietModeSetting.findUnique.mockResolvedValue({ userId: 'user-1', enabled: true, startTime: '22:00', endTime: '07:00' });
      const result = await service.getQuietMode('user-1');
      expect(result.enabled).toBe(true);
    });
  });

  describe('updateQuietMode', () => {
    it('should upsert quiet mode settings', async () => {
      prisma.quietModeSetting.upsert.mockResolvedValue({ userId: 'user-1', enabled: true });
      const result = await service.updateQuietMode('user-1', { enabled: true, startTime: '22:00', endTime: '07:00' } as any);
      expect(result.enabled).toBe(true);
    });
  });

  describe('logScreenTime', () => {
    it('should upsert screen time log entry', async () => {
      prisma.screenTimeLog.upsert.mockResolvedValue({ userId: 'user-1', seconds: 300 });
      const result = await service.logScreenTime('user-1', 300);
      expect(result.seconds).toBe(300);
    });
  });

  describe('setScreenTimeLimit', () => {
    it('should set screen time limit via userSettings upsert', async () => {
      prisma.userSettings.upsert.mockResolvedValue({ userId: 'user-1', screenTimeLimit: 120 });
      const result = await service.setScreenTimeLimit('user-1', 120);
      expect(result.screenTimeLimit).toBe(120);
    });
  });
});