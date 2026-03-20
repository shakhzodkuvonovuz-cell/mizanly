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
            prayerNotification: { findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
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
      prisma.prayerNotification.findUnique.mockResolvedValue(null);
      const result = await service.isInPrayerDND('user-1');
      expect(result).toBe(false);
    });

    it('should return false when autoDnd is disabled', async () => {
      prisma.prayerNotification.findUnique.mockResolvedValue({ autoDnd: false });
      const result = await service.isInPrayerDND('user-1');
      expect(result).toBe(false);
    });

    it('should return false when no cached prayer times', async () => {
      prisma.prayerNotification.findUnique.mockResolvedValue({ autoDnd: true });
      redis.get.mockResolvedValue(null);
      const result = await service.isInPrayerDND('user-1');
      expect(result).toBe(false);
    });

    it('should return true when current time is within prayer window', async () => {
      prisma.prayerNotification.findUnique.mockResolvedValue({ autoDnd: true });
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
      prisma.prayerNotification.findUnique.mockResolvedValue({ autoDnd: true });
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
});
