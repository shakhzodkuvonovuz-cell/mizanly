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
   * Uses the correct PrayerNotificationSetting model and dndDuringPrayer field.
   */
  async isInPrayerDND(userId: string): Promise<boolean> {
    const settings = await this.prisma.prayerNotificationSetting.findUnique({
      where: { userId },
    });
    if (!settings || !settings.dndDuringPrayer) return false;

    const prayerTimesKey = `prayer:times:${userId}`;
    const cached = await this.redis.get(prayerTimesKey);

    // Fallback: if Redis cache miss, check user's mosque coordinates to compute times on the fly
    let times: Record<string, string> | null = null;
    if (cached) {
      try { times = JSON.parse(cached); } catch { /* invalid cache, fall through */ }
    }
    if (!times) {
      // Check if user has stored mosque coordinates for fallback computation
      const mosqueData = await this.redis.hgetall(`user:mosque:${userId}`);
      if (mosqueData?.lat && mosqueData?.lng) {
        const { calculatePrayerTimes } = await import('./prayer-calculator');
        const computed = calculatePrayerTimes(new Date(), parseFloat(mosqueData.lat), parseFloat(mosqueData.lng));
        times = computed as unknown as Record<string, string>;
        // Re-seed cache for next check
        await this.redis.setex(prayerTimesKey, 3600, JSON.stringify(times)).catch((err) => this.logger.debug('Prayer times cache write failed', err?.message));
      }
    }
    if (!times) return false;

    try {
      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes();

      const prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
      for (const prayer of prayers) {
        const timeStr = times[prayer];
        if (!timeStr) continue;
        const [h, m] = timeStr.split(':').map(Number);
        const prayerMinute = h * 60 + m;
        // DND during prayer: at prayer time and up to 15 min after (not before)
        if (currentTime >= prayerMinute && currentTime <= prayerMinute + 15) {
          return true;
        }
      }
    } catch {
      this.logger.warn(`Invalid cached prayer times for user ${userId}`);
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
    await this.redis.expire(key, 3600);
  }

  // ── 80.2: "Pray first" nudge ──────────────────────────────

  /**
   * Check if we should show a gentle "pray first" reminder.
   * Uses dndDuringPrayer as the opt-in flag (adhan enabled = cares about prayer times).
   */
  async shouldShowPrayFirstNudge(userId: string): Promise<{
    show: boolean;
    prayerName?: string;
  }> {
    const settings = await this.prisma.prayerNotificationSetting.findUnique({
      where: { userId },
    });
    if (!settings || !settings.adhanEnabled) return { show: false };

    const isInPrayer = await this.isInPrayerDND(userId);
    if (!isInPrayer) return { show: false };

    const prayerTimesKey = `prayer:times:${userId}`;
    const cached = await this.redis.get(prayerTimesKey);
    if (!cached) return { show: false };

    try {
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
    } catch {
      this.logger.warn(`Invalid cached prayer times for user ${userId}`);
    }

    return { show: false };
  }

  // ── 80.4: Jummah reminder ─────────────────────────────────

  /**
   * Check if it's Friday and time for Jummah reminder.
   * Looks up user's mosque memberships for nearest mosque info.
   */
  async getJummahReminder(userId: string): Promise<{
    isJummahDay: boolean;
    nearPrayerTime: boolean;
    nearestMosque?: { name: string };
  }> {
    const now = new Date();
    const isJummahDay = now.getDay() === 5;
    if (!isJummahDay) return { isJummahDay: false, nearPrayerTime: false };

    const hour = now.getHours();
    const nearPrayerTime = hour >= 11 && hour <= 13;

    // Get user's first mosque membership as proxy for "nearest"
    const membership = await this.prisma.mosqueMembership.findFirst({
      where: { userId },
      include: { mosque: { select: { name: true } } },
    }).catch((err) => { this.logger.debug('Mosque membership lookup failed', err?.message); return null; });

    return {
      isJummahDay: true,
      nearPrayerTime,
      nearestMosque: membership?.mosque
        ? { name: membership.mosque.name }
        : undefined,
    };
  }

  // ── 80.5: Ramadan mode ────────────────────────────────────

  /**
   * Get Ramadan-specific features using Hijri calendar computation.
   * No longer uses hardcoded year-specific dates.
   */
  getRamadanStatus(): {
    isRamadan: boolean;
    dayNumber?: number;
    hijriMonth: number;
    hijriDay: number;
  } {
    const now = new Date();
    const { month: hijriMonth, day: hijriDay } = this.getHijriDate(now);

    // Ramadan is the 9th month in the Hijri calendar
    const isRamadan = hijriMonth === 9;

    return {
      isRamadan,
      dayNumber: isRamadan ? hijriDay : undefined,
      hijriMonth,
      hijriDay,
    };
  }

  // ── 80.6: Islamic content curation ────────────────────────

  categorizeIslamicContent(text: string): string[] {
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
   * Get current Islamic period for app theming using Hijri calendar.
   * No longer hardcoded to 2026 only.
   */
  getIslamicPeriod(): {
    period: 'normal' | 'ramadan' | 'dhul_hijjah' | 'muharram' | 'eid';
    accent?: string;
  } {
    const now = new Date();
    const { month: hijriMonth, day: hijriDay } = this.getHijriDate(now);

    // Ramadan (month 9)
    if (hijriMonth === 9) {
      return { period: 'ramadan', accent: '#C8963E' };
    }

    // Eid al-Fitr (Shawwal 1-3, month 10)
    if (hijriMonth === 10 && hijriDay >= 1 && hijriDay <= 3) {
      return { period: 'eid', accent: '#C8963E' };
    }

    // Dhul Hijjah (month 12, first 13 days including Eid al-Adha on 10th)
    if (hijriMonth === 12 && hijriDay >= 1 && hijriDay <= 13) {
      return { period: 'dhul_hijjah', accent: '#A0785A' };
    }

    // Muharram (month 1)
    if (hijriMonth === 1) {
      return { period: 'muharram', accent: '#4A6741' };
    }

    return { period: 'normal' };
  }

  // ── Hijri date computation (Kuwaiti algorithm) ─────────────

  private getHijriDate(date: Date): { year: number; month: number; day: number } {
    const d = date.getDate();
    const m = date.getMonth();
    const y = date.getFullYear();
    let jd: number;
    if (m < 2) {
      jd = Math.floor(365.25 * (y - 1)) + Math.floor(30.6001 * (m + 13)) + d + 1720995;
    } else {
      jd = Math.floor(365.25 * y) + Math.floor(30.6001 * (m + 1 + 1)) + d + 1720995;
    }
    const a = Math.floor(y / 100);
    jd = jd + 2 - a + Math.floor(a / 4);
    const l = jd - 1948440 + 10632;
    const n = Math.floor((l - 1) / 10631);
    const remainder = l - 10631 * n + 354;
    const j = Math.floor((10985 - remainder) / 5316) * Math.floor((50 * remainder) / 17719) + Math.floor(remainder / 5670) * Math.floor((43 * remainder) / 15238);
    const rl = remainder - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
    const hijriMonth = Math.floor((24 * rl) / 709);
    const hijriDay = rl - Math.floor((709 * hijriMonth) / 24);
    const hijriYear = 30 * n + j - 30;
    return { year: hijriYear, month: hijriMonth, day: hijriDay };
  }
}
