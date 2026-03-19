import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';

/**
 * Islamic-aware notification service.
 * Handles prayer-time DND, Jummah reminders, Ramadan features,
 * and Islamic content curation.
 */
@Injectable()
export class IslamicNotificationsService {
  private readonly logger = new Logger(IslamicNotificationsService.name);

  constructor(
    private prisma: PrismaService,
    @Inject('REDIS') private redis: Redis,
  ) {}

  // ── 80.1: Prayer-time-aware notifications ──────────────────

  /**
   * Check if a user is in a prayer time window (auto-DND).
   * Batches notifications and delivers between prayers.
   */
  async isInPrayerDND(userId: string): Promise<boolean> {
    const settings = await this.prisma.prayerNotification.findUnique({
      where: { userId },
    });
    if (!settings || !settings.autoDnd) return false;

    // Get cached prayer times for user's location
    const prayerTimesKey = `prayer_times:${userId}`;
    const cached = await this.redis.get(prayerTimesKey);
    if (!cached) return false;

    const times = JSON.parse(cached);
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    // Check each prayer window (±15 minutes)
    const prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
    for (const prayer of prayers) {
      const timeStr = times[prayer];
      if (!timeStr) continue;
      const [h, m] = timeStr.split(':').map(Number);
      const prayerMinute = h * 60 + m;
      if (Math.abs(currentTime - prayerMinute) <= 15) {
        return true;
      }
    }

    return false;
  }

  /**
   * Queue a notification for a user in prayer DND.
   * Delivers after the prayer window ends.
   */
  async queueNotificationForAfterPrayer(
    userId: string,
    notification: { title: string; body: string; data?: Record<string, string> },
  ): Promise<void> {
    const key = `prayer_queue:${userId}`;
    await this.redis.lpush(key, JSON.stringify(notification));
    await this.redis.expire(key, 3600); // 1 hour max queue
  }

  // ── 80.2: "Pray first" nudge ──────────────────────────────

  /**
   * Check if we should show a gentle "pray first" reminder.
   * Only shown if user has opted in and it's prayer time.
   */
  async shouldShowPrayFirstNudge(userId: string): Promise<{
    show: boolean;
    prayerName?: string;
  }> {
    const settings = await this.prisma.prayerNotification.findUnique({
      where: { userId },
    });
    if (!settings || !settings.prayFirstNudge) return { show: false };

    const isInPrayer = await this.isInPrayerDND(userId);
    if (!isInPrayer) return { show: false };

    // Determine which prayer
    const prayerTimesKey = `prayer_times:${userId}`;
    const cached = await this.redis.get(prayerTimesKey);
    if (!cached) return { show: false };

    const times = JSON.parse(cached);
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const prayers = [
      { name: 'Fajr', key: 'fajr' },
      { name: 'Dhuhr', key: 'dhuhr' },
      { name: 'Asr', key: 'asr' },
      { name: 'Maghrib', key: 'maghrib' },
      { name: 'Isha', key: 'isha' },
    ];

    for (const prayer of prayers) {
      const timeStr = times[prayer.key];
      if (!timeStr) continue;
      const [h, m] = timeStr.split(':').map(Number);
      const prayerMinute = h * 60 + m;
      if (Math.abs(currentTime - prayerMinute) <= 15) {
        return { show: true, prayerName: prayer.name };
      }
    }

    return { show: false };
  }

  // ── 80.4: Jummah reminder ─────────────────────────────────

  /**
   * Check if it's Friday and time for Jummah reminder.
   * Returns nearest mosque info if available.
   */
  async getJummahReminder(userId: string): Promise<{
    isJummahDay: boolean;
    nearPrayerTime: boolean;
    nearestMosque?: { name: string; distance: string };
  }> {
    const now = new Date();
    const isJummahDay = now.getDay() === 5;
    if (!isJummahDay) return { isJummahDay: false, nearPrayerTime: false };

    const hour = now.getHours();
    const nearPrayerTime = hour >= 11 && hour <= 13;

    // Get user's nearest mosque from saved locations
    const mosqueLookup = await this.prisma.mosqueFinder?.findFirst?.({
      where: { userId },
      orderBy: { distance: 'asc' },
    }).catch(() => null);

    return {
      isJummahDay: true,
      nearPrayerTime,
      nearestMosque: mosqueLookup
        ? { name: mosqueLookup.name, distance: `${mosqueLookup.distance} km` }
        : undefined,
    };
  }

  // ── 80.5: Ramadan mode ────────────────────────────────────

  /**
   * Get Ramadan-specific features and timers.
   */
  async getRamadanStatus(lat: number, lng: number): Promise<{
    isRamadan: boolean;
    dayNumber?: number;
    iftarCountdown?: string;
    suhoorCountdown?: string;
  }> {
    const now = new Date();
    const year = now.getFullYear();

    // Approximate Ramadan dates (in production, use Hijri calendar library)
    const ramadanDates: Record<number, { start: Date; end: Date }> = {
      2026: { start: new Date(2026, 1, 18), end: new Date(2026, 2, 19) },
      2027: { start: new Date(2027, 1, 8), end: new Date(2027, 2, 9) },
    };

    const dates = ramadanDates[year];
    if (!dates || now < dates.start || now > dates.end) {
      return { isRamadan: false };
    }

    const dayNumber = Math.ceil((now.getTime() - dates.start.getTime()) / (24 * 60 * 60 * 1000));

    // Get today's prayer times for iftar/suhoor
    // Maghrib = iftar time, Fajr = suhoor deadline
    return {
      isRamadan: true,
      dayNumber,
      iftarCountdown: 'See prayer times for iftar',
      suhoorCountdown: 'See prayer times for suhoor',
    };
  }

  // ── 80.6: Islamic content curation ────────────────────────

  /**
   * Tag content by Islamic category for curation.
   */
  async categorizeIslamicContent(text: string): Promise<string[]> {
    const categories: string[] = [];
    const lower = text.toLowerCase();

    const categoryKeywords: Record<string, string[]> = {
      fiqh: ['fiqh', 'fatwa', 'halal', 'haram', 'ruling', 'madhab', 'sharia'],
      seerah: ['seerah', 'prophet', 'muhammad', 'biography', 'companions', 'sahaba'],
      tafsir: ['tafsir', 'quran', 'ayah', 'surah', 'interpretation', 'meaning'],
      dawah: ['dawah', 'revert', 'convert', 'invite', 'new muslim'],
      nasheeds: ['nasheed', 'anasheed', 'islamic song', 'spiritual music'],
      hadith: ['hadith', 'sunnah', 'narration', 'bukhari', 'muslim', 'reported'],
      aqeedah: ['aqeedah', 'belief', 'tawheed', 'iman', 'creed', 'theology'],
      history: ['islamic history', 'caliphate', 'ottoman', 'andalus', 'ummayad'],
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(kw => lower.includes(kw))) {
        categories.push(category);
      }
    }

    return categories;
  }

  // ── 80.9: Islamic calendar theming ─────────────────────────

  /**
   * Get current Islamic period for app theming.
   */
  getIslamicPeriod(): {
    period: 'normal' | 'ramadan' | 'dhul_hijjah' | 'muharram' | 'eid';
    accent?: string;
  } {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const day = now.getDate();

    // Approximate dates (production would use Hijri calendar)
    // Ramadan 2026: Feb 18 - Mar 19
    if (year === 2026 && ((month === 1 && day >= 18) || (month === 2 && day <= 19))) {
      return { period: 'ramadan', accent: '#C8963E' }; // Gold accent
    }

    // Eid al-Fitr (day after Ramadan)
    if (year === 2026 && month === 2 && day >= 20 && day <= 22) {
      return { period: 'eid', accent: '#C8963E' };
    }

    // Dhul Hijjah (approx June 2026)
    if (year === 2026 && month === 5 && day >= 7 && day <= 17) {
      return { period: 'dhul_hijjah', accent: '#A0785A' };
    }

    // Muharram (approx July 2026)
    if (year === 2026 && month === 6 && day >= 7 && day <= 16) {
      return { period: 'muharram', accent: '#4A6741' };
    }

    return { period: 'normal' };
  }
}
