import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { SettingsService } from './settings.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('SettingsService — authorization matrix', () => {
  let service: SettingsService;
  let prisma: any;
  const userA = 'user-a';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        SettingsService,
        {
          provide: PrismaService,
          useValue: {
            userSettings: { findUnique: jest.fn(), upsert: jest.fn(), create: jest.fn(), update: jest.fn() },
            blockedKeyword: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), delete: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
            quietModeSetting: { findUnique: jest.fn(), upsert: jest.fn() },
            screenTimeLog: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _sum: { seconds: 0 } }) },
          },
        },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
    prisma = module.get(PrismaService);
  });

  it('should only return own settings', async () => {
    prisma.userSettings.upsert.mockResolvedValue({ userId: userA, theme: 'dark' });
    const result = await service.getSettings(userA);
    expect(result).toBeDefined();
    expect(prisma.userSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: userA } }),
    );
  });

  it('should only return own blocked keywords', async () => {
    const result = await service.getBlockedKeywords(userA);
    expect(result).toEqual([]);
    expect(prisma.blockedKeyword.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: userA }) }),
    );
  });

  it('should only return own quiet mode settings', async () => {
    prisma.userSettings.upsert.mockResolvedValue({ userId: userA, quietModeEnabled: false });
    const result = await service.getQuietMode(userA);
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('isActive');
  });

  it('should only return own screen time stats', async () => {
    prisma.userSettings.findUnique.mockResolvedValue({ userId: userA });
    const result = await service.getScreenTimeStats(userA);
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('totalSeconds');
  });
});
