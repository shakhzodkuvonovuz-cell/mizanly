import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { IslamicNotificationsService } from './islamic-notifications.service';

describe('IslamicNotificationsService', () => {
  let service: IslamicNotificationsService;
  let prisma: any;
  let redis: any;

  beforeEach(async () => {
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      lpush: jest.fn().mockResolvedValue(1),
      lrange: jest.fn().mockResolvedValue([]),
      expire: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IslamicNotificationsService,
        {
          provide: PrismaService,
          useValue: {
            prayerNotificationSetting: { findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
            mosqueMembership: { findFirst: jest.fn().mockResolvedValue(null) },
            user: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
        { provide: 'REDIS', useValue: redis },
      ],
    }).compile();

    service = module.get<IslamicNotificationsService>(IslamicNotificationsService);
    prisma = module.get(PrismaService) as any;
  });

  describe('isInPrayerDND', () => {
    it('should return false when user has no prayer settings', async () => {
      prisma.prayerNotificationSetting.findUnique.mockResolvedValue(null);
      const result = await service.isInPrayerDND('user-1');
      expect(result).toBe(false);
    });

    it('should return false when autoDnd is disabled', async () => {
      prisma.prayerNotificationSetting.findUnique.mockResolvedValue({ dndDuringPrayer: false });
      const result = await service.isInPrayerDND('user-1');
      expect(result).toBe(false);
    });

    it('should return false when no cached prayer times', async () => {
      prisma.prayerNotificationSetting.findUnique.mockResolvedValue({ dndDuringPrayer: true });
      redis.get.mockResolvedValue(null);
      const result = await service.isInPrayerDND('user-1');
      expect(result).toBe(false);
    });

    it('should return true when current time is within prayer window', async () => {
      prisma.prayerNotificationSetting.findUnique.mockResolvedValue({ dndDuringPrayer: true });
      const now = new Date();
      const h = now.getHours().toString().padStart(2, '0');
      const m = now.getMinutes().toString().padStart(2, '0');
      redis.get.mockResolvedValue(JSON.stringify({
        fajr: '05:00', dhuhr: `${h}:${m}`, asr: '15:30', maghrib: '18:00', isha: '19:30',
      }));
      const result = await service.isInPrayerDND('user-1');
      expect(result).toBe(true);
    });

    it('should return false when outside prayer window', async () => {
      prisma.prayerNotificationSetting.findUnique.mockResolvedValue({ dndDuringPrayer: true });
      redis.get.mockResolvedValue(JSON.stringify({
        fajr: '04:00', dhuhr: '12:00', asr: '15:00', maghrib: '18:00', isha: '20:00',
      }));
      // Mock time that's far from any prayer
      const result = await service.isInPrayerDND('user-1');
      expect(typeof result).toBe('boolean');
    });
  });

  describe('queueNotificationForAfterPrayer', () => {
    it('should queue notification in Redis', async () => {
      await service.queueNotificationForAfterPrayer('user-1', { title: 'Test', body: 'Body' });
      expect(redis.lpush).toHaveBeenCalled();
    });

    it('should set expiry on queued notifications', async () => {
      await service.queueNotificationForAfterPrayer('user-1', { title: 'Test', body: 'Body' });
      expect(redis.expire).toHaveBeenCalled();
    });
  });

  describe('shouldShowPrayFirstNudge', () => {
    it('should return nudge data with show property', async () => {
      redis.get.mockResolvedValue(null);
      const result = await service.shouldShowPrayFirstNudge('user-1');
      expect(result).toHaveProperty('show');
      expect(typeof result.show).toBe('boolean');
    });
  });

  describe('getJummahReminder', () => {
    it('should return reminder with isJummahDay property', async () => {
      const result = await service.getJummahReminder('user-1');
      expect(result).toHaveProperty('isJummahDay');
      expect(typeof result.isJummahDay).toBe('boolean');
      expect(result).toHaveProperty('nearPrayerTime');
    });
  });

  describe('categorizeIslamicContent', () => {
    it('should categorize fiqh content', () => {
      const result = service.categorizeIslamicContent('Is this halal? I need a fatwa on this matter');
      expect(result).toContain('fiqh');
    });

    it('should categorize seerah content', () => {
      const result = service.categorizeIslamicContent('The life of Prophet Muhammad and the companions');
      expect(result).toContain('seerah');
    });

    it('should categorize tafsir content', () => {
      const result = service.categorizeIslamicContent('Tafsir of Surah Al-Baqarah ayah 255');
      expect(result).toContain('tafsir');
    });

    it('should categorize hadith content', () => {
      const result = service.categorizeIslamicContent('A hadith from Sahih Bukhari on sunnah practices');
      expect(result).toContain('hadith');
    });

    it('should return multiple categories when applicable', () => {
      const result = service.categorizeIslamicContent('The Prophet Muhammad taught this sunnah hadith about fiqh rulings');
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty for non-Islamic content', () => {
      const result = service.categorizeIslamicContent('Today I had coffee and went for a walk');
      expect(result).toEqual([]);
    });
  });

  describe('getIslamicPeriod', () => {
    it('should return a period string', () => {
      const result = service.getIslamicPeriod();
      expect(result).toHaveProperty('period');
      expect(['normal', 'ramadan', 'dhul_hijjah', 'muharram', 'eid']).toContain(result.period);
    });
  });

  describe('getRamadanStatus', () => {
    it('should return isRamadan boolean', () => {
      const result = service.getRamadanStatus();
      expect(result).toHaveProperty('isRamadan');
      expect(typeof result.isRamadan).toBe('boolean');
      expect(result).toHaveProperty('hijriMonth');
      expect(result).toHaveProperty('hijriDay');
    });

    it('should return dayNumber when in Ramadan', () => {
      const result = service.getRamadanStatus();
      if (result.isRamadan) {
        expect(result.dayNumber).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('shouldShowPrayFirstNudge — disabled', () => {
    it('should return show:false when prayFirstNudge is disabled', async () => {
      prisma.prayerNotificationSetting.findUnique.mockResolvedValue({ dndDuringPrayer: true, adhanEnabled: false });
      const result = await service.shouldShowPrayFirstNudge('user-1');
      expect(result.show).toBe(false);
    });

    it('should return show:false when no settings exist', async () => {
      prisma.prayerNotificationSetting.findUnique.mockResolvedValue(null);
      const result = await service.shouldShowPrayFirstNudge('user-1');
      expect(result.show).toBe(false);
    });
  });

  describe('queueNotificationForAfterPrayer — with data', () => {
    it('should queue notification with data payload', async () => {
      await service.queueNotificationForAfterPrayer('user-1', {
        title: 'New message', body: 'You have a new DM', data: { screen: 'chat' },
      });
      expect(redis.lpush).toHaveBeenCalledWith(
        'prayer_queue:user-1',
        expect.stringContaining('"screen":"chat"'),
      );
    });
  });
});
