import { Injectable, Inject, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { PrismaService } from '../../config/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { QueueService } from '../../common/queue/queue.service';
import { FastingType, HifzStatus, DailyTaskType, AdhanStyle, ContentStrictnessLevel, MadhhabType as MType } from '@prisma/client';
import { UpdatePrayerNotificationDto } from './dto/prayer-notification.dto';
import { CreateQuranPlanDto, UpdateQuranPlanDto } from './dto/quran-plan.dto';
import { CreateCampaignDto, CreateDonationDto } from './dto/charity.dto';
import { CreateHajjProgressDto, UpdateHajjProgressDto } from './dto/hajj.dto';
import { ApplyScholarVerificationDto } from './dto/scholar-verification.dto';
import { UpdateContentFilterDto } from './dto/content-filter.dto';
import { SaveDhikrSessionDto, CreateDhikrChallengeDto } from './dto/dhikr.dto';
import { calculatePrayerTimes, getRamadanDatesForYear, METHOD_PARAMS } from './prayer-calculator';
import { SURAH_METADATA, SurahMetadata, TOTAL_AYAHS, getSurahAyahOffset } from './quran-metadata';
import * as hadiths from './data/hadiths.json';
import * as hajjGuideData from './data/hajj-guide.json';
import * as tafsirJson from './data/tafsir.json';
import * as duasData from './data/duas.json';
import * as asmaUlHusnaData from './data/asma-ul-husna.json';

export interface NameOfAllah {
  number: number;
  arabicName: string;
  transliteration: string;
  englishMeaning: string;
  explanation: string;
  quranRef?: string;
}

export interface DuaEntry {
  id: string;
  category: string;
  arabicText: string;
  transliteration: string;
  translation: Record<string, string>;
  source: string;
  sourceRef: string;
}

export interface TafsirSource {
  name: string;
  madhab: string;
  textEn: string;
  textAr: string;
}

export interface TafsirEntry {
  surahNumber: number;
  verseNumber: number;
  verse: string;
  tafsirSources: TafsirSource[];
}

export interface PrayerTimesRequest {
  lat: number;
  lng: number;
  method?: string;
  date?: string; // YYYY-MM-DD
}

export interface PrayerTimesResponse {
  date: string;
  timings: {
    fajr: string;
    sunrise: string;
    dhuhr: string;
    asr: string;
    maghrib: string;
    isha: string;
  };
  method: string;
  location: {
    lat: number;
    lng: number;
  };
}

export interface CalculationMethod {
  id: string;
  name: string;
  description: string;
  parameters: {
    fajrAngle: number;
    ishaAngle: number;
    maghrib?: '1 min' | '0 min';
    asr?: 'Standard' | 'Hanafi';
  };
}

export interface Hadith {
  id: number;
  arabic: string;
  english: string;
  source: string;
  narrator: string;
  chapter: string;
}

export interface Mosque {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  facilities: string[];
  distance?: number; // meters
}

export interface ZakatCalculationRequest {
  cash: number; // in base currency (USD)
  gold: number; // grams
  silver: number; // grams
  investments: number;
  debts: number;
}

export interface ZakatCalculationResponse {
  totalAssets: number;
  nisab: number; // threshold
  nisabMet: boolean;
  zakatDue: number;
  breakdown: {
    cash: number;
    goldValue: number;
    silverValue: number;
    investments: number;
    debts: number;
  };
  goldPricePerGram: number;
  silverPricePerGram: number;
}

export interface RamadanInfoRequest {
  year?: number;
  lat?: number;
  lng?: number;
}

export interface RamadanInfoResponse {
  year: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  currentDay?: number; // if within Ramadan
  iftarTime?: string; // local time HH:mm
  suhoorTime?: string; // local time HH:mm
  nextPrayer?: string; // next prayer name
  nextPrayerTime?: string;
}

@Injectable()
export class IslamicService {
  private readonly logger = new Logger(IslamicService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS') private readonly redis: Redis,
    private readonly config: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly queueService: QueueService,
  ) {}

  private readonly hadiths: Hadith[] = hadiths;
  private readonly prayerMethods: CalculationMethod[] = [
    {
      id: 'MWL',
      name: 'Muslim World League',
      description: 'Fajr 18°, Isha 17°',
      parameters: { fajrAngle: 18, ishaAngle: 17, asr: 'Standard' },
    },
    {
      id: 'ISNA',
      name: 'Islamic Society of North America',
      description: 'Fajr 15°, Isha 15°',
      parameters: { fajrAngle: 15, ishaAngle: 15, asr: 'Standard' },
    },
    {
      id: 'Egypt',
      name: 'Egyptian General Authority of Survey',
      description: 'Fajr 19.5°, Isha 17.5°',
      parameters: { fajrAngle: 19.5, ishaAngle: 17.5, asr: 'Standard' },
    },
    {
      id: 'Makkah',
      name: 'Umm al-Qura University, Makkah',
      description: 'Fajr 18.5°, Isha 90 min after Maghrib',
      parameters: { fajrAngle: 18.5, ishaAngle: 90, maghrib: '1 min', asr: 'Standard' },
    },
    {
      id: 'Karachi',
      name: 'University of Islamic Sciences, Karachi',
      description: 'Fajr 18°, Isha 18°',
      parameters: { fajrAngle: 18, ishaAngle: 18, asr: 'Hanafi' },
    },
  ];


  async getPrayerTimes(params: PrayerTimesRequest): Promise<PrayerTimesResponse> {
    const { lat, lng, method = 'MWL', date = new Date().toISOString().split('T')[0] } = params;

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new BadRequestException('Latitude must be -90..90, longitude must be -180..180');
    }

    const methodObj = this.prayerMethods.find(m => m.id === method) || this.prayerMethods[0];

    // Resolve Aladhan method number from our method ID
    const aladhanMethodMap: Record<string, number> = {
      MWL: 3, ISNA: 2, Egypt: 5, Makkah: 4, Karachi: 1, Tehran: 7, JAKIM: 11, DIYANET: 13,
    };
    const aladhanMethod = aladhanMethodMap[method] ?? 3;

    // Cache key: rounded coordinates (2 decimal places ≈ 1.1km precision)
    const cacheKey = `prayer:${lat.toFixed(2)}:${lng.toFixed(2)}:${date}:${method}`;

    // 1. Check Redis cache
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (cacheErr) {
      this.logger.debug(`Redis cache read failed: ${cacheErr instanceof Error ? cacheErr.message : cacheErr}`);
    }

    // 2. Try Aladhan API (free, no API key needed)
    try {
      const timestamp = Math.floor(new Date(date + 'T12:00:00Z').getTime() / 1000);
      const url = `https://api.aladhan.com/v1/timings/${timestamp}?latitude=${lat}&longitude=${lng}&method=${aladhanMethod}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      const data = await response.json();
      if (data.code === 200 && data.data?.timings) {
        const t = data.data.timings;
        const result: PrayerTimesResponse = {
          date,
          timings: {
            fajr: t.Fajr?.replace(/\s*\(.*\)/, '') ?? '',
            sunrise: t.Sunrise?.replace(/\s*\(.*\)/, '') ?? '',
            dhuhr: t.Dhuhr?.replace(/\s*\(.*\)/, '') ?? '',
            asr: t.Asr?.replace(/\s*\(.*\)/, '') ?? '',
            maghrib: t.Maghrib?.replace(/\s*\(.*\)/, '') ?? '',
            isha: t.Isha?.replace(/\s*\(.*\)/, '') ?? '',
          },
          method: methodObj.name,
          location: { lat, lng },
        };

        // Cache for 24 hours
        try {
          await this.redis.setex(cacheKey, 86400, JSON.stringify(result));
        } catch (cacheErr) {
          this.logger.debug(`Redis cache write failed: ${cacheErr instanceof Error ? cacheErr.message : cacheErr}`);
        }

        return result;
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Aladhan API failed, falling back to local calculation: ${msg}`);
    }

    // 3. Fallback: local solar angle calculation
    const localTimes = calculatePrayerTimes(new Date(date), lat, lng, method);
    const result: PrayerTimesResponse = {
      date,
      timings: {
        fajr: localTimes.fajr,
        sunrise: localTimes.sunrise,
        dhuhr: localTimes.dhuhr,
        asr: localTimes.asr,
        maghrib: localTimes.maghrib,
        isha: localTimes.isha,
      },
      method: methodObj.name,
      location: { lat, lng },
    };

    // Cache local result for 1 hour (less reliable than API)
    try {
      await this.redis.setex(cacheKey, 3600, JSON.stringify(result));
    } catch (cacheErr) {
      this.logger.debug(`Redis cache write failed: ${cacheErr instanceof Error ? cacheErr.message : cacheErr}`);
    }

    return result;
  }

  getPrayerMethods(): CalculationMethod[] {
    return this.prayerMethods;
  }

  getDailyHadith(): Hadith {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    const index = dayOfYear % this.hadiths.length;
    return this.hadiths[index];
  }

  getHadithById(id: number): Hadith {
    const hadith = this.hadiths.find(h => h.id === id);
    if (!hadith) {
      throw new NotFoundException(`Hadith with ID ${id} not found`);
    }
    return hadith;
  }

  getHadiths(cursor?: number, limit = 20): { data: Hadith[]; cursor?: number; hasMore: boolean } {
    const start = cursor ? this.hadiths.findIndex(h => h.id === cursor) + 1 : 0;
    const data = this.hadiths.slice(start, start + limit);
    const nextCursor = data.length > 0 ? data[data.length - 1].id : undefined;
    const hasMore = start + limit < this.hadiths.length;
    return { data, cursor: nextCursor, hasMore };
  }

  async toggleHadithBookmark(userId: string, hadithId: number): Promise<{ bookmarked: boolean }> {
    if (hadithId < 1 || hadithId > this.hadiths.length) {
      throw new NotFoundException('Hadith not found');
    }
    const existing = await this.prisma.hadithBookmark.findUnique({
      where: { userId_hadithId: { userId, hadithId } },
    });
    if (existing) {
      await this.prisma.hadithBookmark.delete({ where: { id: existing.id } });
      return { bookmarked: false };
    }
    await this.prisma.hadithBookmark.create({ data: { userId, hadithId } });
    return { bookmarked: true };
  }

  async getNearbyMosques(lat: number, lng: number, radiusKm = 10, limit = 20): Promise<Mosque[]> {
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new BadRequestException('Invalid coordinates');
    }

    const safeLimit = Math.min(Math.max(limit, 1), 50);

    // 1. Query MosqueCommunity database using Haversine formula
    try {
      const dbMosques = await this.prisma.$queryRaw<Array<{
        id: string; name: string; address: string; city: string; country: string;
        latitude: number; longitude: number; madhab: string | null; language: string | null;
        phone: string | null; website: string | null; imageUrl: string | null;
        memberCount: number; isVerified: boolean; distance: number;
      }>>`
        SELECT id, name, address, city, country, latitude, longitude,
          madhab, language, phone, website, "imageUrl", "memberCount", "isVerified",
          (6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians(${lat})) * cos(radians(latitude))
              * cos(radians(longitude) - radians(${lng}))
              + sin(radians(${lat})) * sin(radians(latitude))
            ))
          )) AS distance
        FROM "mosque_communities"
        WHERE (6371 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(${lat})) * cos(radians(latitude))
            * cos(radians(longitude) - radians(${lng}))
            + sin(radians(${lat})) * sin(radians(latitude))
          ))
        )) < ${radiusKm}
        ORDER BY distance
        LIMIT ${safeLimit}
      `;

      if (dbMosques.length > 0) {
        return dbMosques.map(m => ({
          id: m.id,
          name: m.name,
          address: `${m.address}, ${m.city}, ${m.country}`,
          lat: m.latitude,
          lng: m.longitude,
          facilities: [],
          distance: Math.round(m.distance * 1000), // km to meters
        }));
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`MosqueCommunity query failed: ${msg}`);
    }

    // 2. Fallback: query OpenStreetMap Overpass API for mosques
    const cacheKey = `mosques:${lat.toFixed(1)}:${lng.toFixed(1)}:${radiusKm}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (cacheErr) {
      this.logger.debug(`Redis cache read failed: ${cacheErr instanceof Error ? cacheErr.message : cacheErr}`);
    }

    try {
      const radiusMeters = radiusKm * 1000;
      const query = `[out:json][timeout:10];node["amenity"="place_of_worship"]["religion"="muslim"](around:${radiusMeters},${lat},${lng});out body ${safeLimit};`;
      const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      const data = await response.json();
      const elements = data.elements || [];

      const mosques: Mosque[] = elements.map((el: { id: number; lat: number; lon: number; tags?: Record<string, string> }) => ({
        id: `osm-${el.id}`,
        name: el.tags?.name || el.tags?.['name:en'] || 'Mosque',
        address: [el.tags?.['addr:street'], el.tags?.['addr:city'], el.tags?.['addr:country']].filter(Boolean).join(', ') || 'Address unavailable',
        lat: el.lat,
        lng: el.lon,
        facilities: [],
        distance: this.calculateDistance(lat, lng, el.lat, el.lon),
      }));

      mosques.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));

      // Cache OSM results for 7 days
      try {
        await this.redis.setex(cacheKey, 604800, JSON.stringify(mosques));
      } catch (cacheErr) {
        this.logger.debug(`Redis cache write failed: ${cacheErr instanceof Error ? cacheErr.message : cacheErr}`);
      }

      return mosques;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`OSM Overpass API failed: ${msg}`);
    }

    // 3. No results from either source
    return [];
  }

  calculateZakat(params: ZakatCalculationRequest): ZakatCalculationResponse {
    if (params.cash < 0 || params.gold < 0 || params.silver < 0 || params.investments < 0 || params.debts < 0) {
      throw new BadRequestException('All values must be non-negative');
    }

    // Configurable via env/config, fallback to approximate market values
    const goldPricePerGram = parseFloat(this.config.get<string>('GOLD_PRICE_PER_GRAM') || '92');
    const silverPricePerGram = parseFloat(this.config.get<string>('SILVER_PRICE_PER_GRAM') || '1.05');

    const goldValue = params.gold * goldPricePerGram;
    const silverValue = params.silver * silverPricePerGram;
    const totalAssets = params.cash + goldValue + silverValue + params.investments;

    // Nisab: 87.48g gold OR 612.36g silver (standard Islamic thresholds)
    const nisabGold = 87.48 * goldPricePerGram;
    const nisabSilver = 612.36 * silverPricePerGram;
    const nisab = Math.min(nisabGold, nisabSilver); // use the lower threshold (more inclusive)

    const nisabMet = totalAssets - params.debts >= nisab;
    const zakatDue = nisabMet ? (totalAssets - params.debts) * 0.025 : 0;

    return {
      totalAssets,
      nisab,
      nisabMet,
      zakatDue,
      breakdown: {
        cash: params.cash,
        goldValue,
        silverValue,
        investments: params.investments,
        debts: params.debts,
      },
      goldPricePerGram,
      silverPricePerGram,
    };
  }

  async getRamadanInfo(params: RamadanInfoRequest): Promise<RamadanInfoResponse> {
    const year = params.year || new Date().getFullYear();

    // Calculate Ramadan dates from Hijri calendar (not hardcoded)
    const { startDate, endDate } = getRamadanDatesForYear(year);

    const today = new Date();
    const ramadanStart = new Date(startDate);
    const ramadanEnd = new Date(endDate);
    let currentDay: number | undefined;
    if (today >= ramadanStart && today <= ramadanEnd) {
      currentDay = Math.floor((today.getTime() - ramadanStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }

    // Get real iftar/suhoor times from prayer calculation if location provided
    let iftarTime: string | undefined;
    let suhoorTime: string | undefined;
    let nextPrayer = 'Maghrib';
    let nextPrayerTime: string | undefined;

    if (params.lat !== undefined && params.lng !== undefined) {
      try {
        const prayerResult = await this.getPrayerTimes({
          lat: params.lat,
          lng: params.lng,
          date: today.toISOString().split('T')[0],
        });
        // Iftar = Maghrib time, Suhoor end = Fajr time minus 10 minutes
        iftarTime = prayerResult.timings.maghrib;
        const fajrParts = prayerResult.timings.fajr.split(':').map(Number);
        let suhoorMinutes = fajrParts[0] * 60 + fajrParts[1] - 10;
        if (suhoorMinutes < 0) suhoorMinutes += 1440;
        const sh = Math.floor(suhoorMinutes / 60);
        const sm = suhoorMinutes % 60;
        suhoorTime = `${sh.toString().padStart(2, '0')}:${sm.toString().padStart(2, '0')}`;

        // Determine next prayer
        const window = this.getCurrentPrayerWindow(prayerResult.timings);
        nextPrayer = window.nextPrayer;
        nextPrayerTime = prayerResult.timings[nextPrayer as keyof typeof prayerResult.timings];
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to get prayer times for Ramadan info: ${msg}`);
      }
    }

    return {
      year,
      startDate,
      endDate,
      currentDay,
      iftarTime,
      suhoorTime,
      nextPrayer,
      nextPrayerTime,
    };
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  async getPrayerNotificationSettings(userId: string) {
    let settings = await this.prisma.prayerNotificationSetting.findUnique({
      where: { userId },
    });
    if (!settings) {
      settings = await this.prisma.prayerNotificationSetting.create({
        data: { userId },
      });
    }
    return settings;
  }

  async updatePrayerNotificationSettings(userId: string, dto: UpdatePrayerNotificationDto) {
    const data = { ...dto, adhanStyle: dto.adhanStyle as AdhanStyle | undefined };
    return this.prisma.prayerNotificationSetting.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  }

  // ── Quran Reading Plans ──

  async createReadingPlan(userId: string, dto: CreateQuranPlanDto) {
    const days = dto.planType === '30day' ? 30 : dto.planType === '60day' ? 60 : 90;
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    return this.prisma.quranReadingPlan.create({
      data: {
        userId,
        planType: dto.planType,
        startDate,
        endDate,
      },
    });
  }

  async getActiveReadingPlan(userId: string) {
    return this.prisma.quranReadingPlan.findFirst({
      where: { userId, isComplete: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getReadingPlanHistory(userId: string, cursor?: string, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 50);
    const plans = await this.prisma.quranReadingPlan.findMany({
      where: { userId, isComplete: true },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = plans.length > take;
    if (hasMore) plans.pop();
    return { data: plans, meta: { hasMore, cursor: plans[plans.length - 1]?.id } };
  }

  async updateReadingPlan(userId: string, planId: string, dto: UpdateQuranPlanDto) {
    const plan = await this.prisma.quranReadingPlan.findFirst({
      where: { id: planId, userId },
    });
    if (!plan) throw new NotFoundException('Reading plan not found');

    const updated = await this.prisma.quranReadingPlan.update({
      where: { id: planId },
      data: dto,
    });

    // Finding #214: Khatm celebration — when plan is completed, send celebration notification
    if (dto.isComplete && !plan.isComplete) {
      await this.notificationsService.create({
        userId,
        actorId: null,
        type: 'SYSTEM',
        title: '🎉 Khatm al-Quran!',
        body: 'Masha Allah! You have completed reading the entire Quran. May Allah accept your effort and reward you abundantly.',
      }).catch((err: unknown) => this.logger.warn('Failed to send Khatm notification', err instanceof Error ? err.message : err));
    }

    return updated;
  }

  async deleteReadingPlan(userId: string, planId: string) {
    const plan = await this.prisma.quranReadingPlan.findFirst({
      where: { id: planId, userId },
    });
    if (!plan) throw new NotFoundException('Reading plan not found');
    return this.prisma.quranReadingPlan.delete({ where: { id: planId } });
  }

  // ── Charity / Sadaqah ──

  async createCampaign(userId: string, dto: CreateCampaignDto) {
    return this.prisma.charityCampaign.create({
      data: { userId, ...dto },
    });
  }

  async listCampaigns(cursor?: string, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 50);
    const campaigns = await this.prisma.charityCampaign.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = campaigns.length > take;
    if (hasMore) campaigns.pop();
    return { data: campaigns, meta: { hasMore, cursor: campaigns[campaigns.length - 1]?.id } };
  }

  async getCampaign(campaignId: string) {
    const campaign = await this.prisma.charityCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async createDonation(userId: string, dto: CreateDonationDto) {
    throw new BadRequestException('Charity donations require payment integration. Coming soon.');

    if (dto.amount <= 0 || dto.amount > 1000000) {
      throw new BadRequestException('Donation amount must be between $0.01 and $1,000,000');
    }
    if (dto.campaignId) {
      const campaign = await this.prisma.charityCampaign.findUnique({ where: { id: dto.campaignId } });
      if (!campaign) throw new NotFoundException('Campaign not found');
    }
    // Create donation as pending — campaign totals should only be updated
    // after payment confirmation via Stripe webhook
    const donation = await this.prisma.charityDonation.create({
      data: {
        userId,
        campaignId: dto.campaignId,
        recipientUserId: dto.recipientUserId,
        amount: dto.amount,
        currency: dto.currency || 'usd',
        status: 'pending',
      },
    });

    return donation;
  }

  async getMyDonations(userId: string, cursor?: string, limit = 20) {
    limit = Math.min(Math.max(limit, 1), 50);
    const donations = await this.prisma.charityDonation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = donations.length > limit;
    if (hasMore) donations.pop();
    return { data: donations, meta: { hasMore, cursor: donations[donations.length - 1]?.id } };
  }

  // ── Hajj & Umrah ──

  private hajjGuide = hajjGuideData;

  getHajjGuide() {
    return this.hajjGuide;
  }

  async getHajjProgress(userId: string) {
    return this.prisma.hajjProgress.findFirst({
      where: { userId },
      orderBy: { year: 'desc' },
    });
  }

  async createHajjProgress(userId: string, dto: CreateHajjProgressDto) {
    try {
      return await this.prisma.hajjProgress.create({
        data: { userId, year: dto.year },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Hajj progress already exists for this year');
      }
      throw error;
    }
  }

  async updateHajjProgress(userId: string, progressId: string, dto: UpdateHajjProgressDto) {
    const progress = await this.prisma.hajjProgress.findFirst({
      where: { id: progressId, userId },
    });
    if (!progress) throw new NotFoundException('Hajj progress not found');
    return this.prisma.hajjProgress.update({
      where: { id: progressId },
      data: dto,
    });
  }

  // ── Tafsir ──

  private tafsirData: TafsirEntry[] = tafsirJson as TafsirEntry[];

  getTafsir(surahNumber: number, verseNumber: number, source?: string): TafsirEntry {
    const entry = this.tafsirData.find(
      (t) => t.surahNumber === surahNumber && t.verseNumber === verseNumber,
    );
    if (!entry) throw new NotFoundException('Tafsir not available for this verse');

    if (source) {
      const filtered = entry.tafsirSources.filter(
        (s) => s.name.toLowerCase() === source.toLowerCase(),
      );
      return { ...entry, tafsirSources: filtered };
    }
    return entry;
  }

  getTafsirSources(): Array<{ name: string }> {
    const sources = new Set<string>();
    for (const entry of this.tafsirData) {
      for (const s of entry.tafsirSources) {
        sources.add(s.name);
      }
    }
    return Array.from(sources).map((name) => ({ name }));
  }

  // ── Scholar Verification ──

  async applyScholarVerification(userId: string, dto: ApplyScholarVerificationDto) {
    const existing = await this.prisma.scholarVerification.findUnique({ where: { userId } });
    if (existing) throw new BadRequestException('Application already submitted');
    return this.prisma.scholarVerification.create({
      data: { userId, ...dto, madhab: dto.madhab as MType | undefined },
    });
  }

  async getScholarVerificationStatus(userId: string) {
    return this.prisma.scholarVerification.findUnique({ where: { userId } });
  }

  // ── Content Filter ──

  async getContentFilterSettings(userId: string) {
    let settings = await this.prisma.contentFilterSetting.findUnique({ where: { userId } });
    if (!settings) {
      settings = await this.prisma.contentFilterSetting.create({ data: { userId } });
    }
    return settings;
  }

  async updateContentFilterSettings(userId: string, dto: UpdateContentFilterDto) {
    const data = { ...dto, strictnessLevel: dto.strictnessLevel as ContentStrictnessLevel | undefined };
    return this.prisma.contentFilterSetting.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  }

  // ── Dhikr Social ──

  async saveDhikrSession(userId: string, dto: SaveDhikrSessionDto) {
    if (dto.count <= 0 || dto.count > 100000) {
      throw new BadRequestException('Count must be between 1 and 100,000');
    }
    if (dto.target !== undefined && (dto.target <= 0 || dto.target > 100000)) {
      throw new BadRequestException('Target must be between 1 and 100,000');
    }
    // Increment global community dhikr counter (Finding #280)
    await this.redis.incrby('community:dhikr:total', dto.count);
    const todayKey = `community:dhikr:today:${new Date().toISOString().slice(0, 10)}`;
    await this.redis.incrby(todayKey, dto.count);
    // 48-hour TTL prevents stale daily keys from accumulating indefinitely
    await this.redis.expire(todayKey, 48 * 60 * 60);

    const session = await this.prisma.dhikrSession.create({
      data: {
        userId,
        phrase: dto.phrase,
        count: dto.count,
        target: dto.target || 33,
        completedAt: dto.count >= (dto.target || 33) ? new Date() : null,
      },
    });

    // Finding #216: Islamic milestone badges — check dhikr milestones
    const totalDhikr = parseInt(await this.redis.get('community:dhikr:total') ?? '0', 10);
    const milestones: Array<{ threshold: number; badge: string }> = [
      { threshold: 1000, badge: 'dhikr_1000' },
      { threshold: 10000, badge: 'dhikr_10000' },
      { threshold: 100000, badge: 'dhikr_100000' },
    ];
    for (const m of milestones) {
      if (totalDhikr >= m.threshold) {
        // Unlock via gamification queue (fire-and-forget, won't crash if badge doesn't exist yet)
        this.prisma.userAchievement.upsert({
          where: { userId_achievementId: { userId, achievementId: m.badge } },
          update: {},
          create: { userId, achievementId: m.badge },
        }).catch(() => {}); // Silently skip if achievement not seeded
      }
    }

    return session;
  }

  /**
   * Finding #280: Get global community dhikr counter.
   */
  async getCommunityDhikrTotal() {
    const [total, todayKey] = await Promise.all([
      this.redis.get('community:dhikr:total'),
      this.redis.get(`community:dhikr:today:${new Date().toISOString().slice(0, 10)}`),
    ]);
    return {
      allTimeTotal: parseInt(total ?? '0', 10),
      todayTotal: parseInt(todayKey ?? '0', 10),
    };
  }

  async getDhikrStats(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalResult, todayResult, sessions] = await Promise.all([
      this.prisma.dhikrSession.aggregate({
        where: { userId },
        _sum: { count: true },
      }),
      this.prisma.dhikrSession.aggregate({
        where: { userId, createdAt: { gte: today } },
        _sum: { count: true },
      }),
      this.prisma.dhikrSession.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 90,
        select: { createdAt: true, count: true },
      }),
    ]);

    // Calculate streak (consecutive days with sessions)
    let streak = 0;
    const dayMs = 86400000;
    let checkDate = new Date();
    checkDate.setHours(0, 0, 0, 0);

    const sessionDates = new Set(
      sessions.map((s: { createdAt: Date }) => {
        const d = new Date(s.createdAt);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      }),
    );

    while (sessionDates.has(checkDate.getTime())) {
      streak++;
      checkDate = new Date(checkDate.getTime() - dayMs);
    }

    return {
      totalCount: totalResult._sum.count || 0,
      todayCount: todayResult._sum.count || 0,
      streak,
      setsCompleted: sessions.filter((s: { count: number }) => s.count >= 33).length,
    };
  }

  async getDhikrLeaderboard(period: string = 'week') {
    const since = new Date();
    if (period === 'day') {
      since.setHours(0, 0, 0, 0);
    } else {
      since.setDate(since.getDate() - 7);
    }

    const results = await this.prisma.dhikrSession.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: since } },
      _sum: { count: true },
      orderBy: { _sum: { count: 'desc' } },
      take: 20,
    });

    const userIds = results.map((r: { userId: string }) => r.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true, avatarUrl: true },
      take: 50,
    });

    const userMap = new Map(users.map((u: { id: string; displayName: string | null; avatarUrl: string | null }) => [u.id, u]));

    return results.map((r: { userId: string; _sum: { count: number | null } }) => ({
      userId: r.userId,
      totalCount: r._sum.count || 0,
      user: userMap.get(r.userId) || null,
    }));
  }

  async createDhikrChallenge(userId: string, dto: CreateDhikrChallengeDto) {
    return this.prisma.dhikrChallenge.create({
      data: {
        userId,
        title: dto.title,
        phrase: dto.phrase,
        targetTotal: dto.targetTotal,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
  }

  async listActiveChallenges(cursor?: string, limit = 20) {
    limit = Math.min(Math.max(limit, 1), 50);
    const challenges = await this.prisma.dhikrChallenge.findMany({
      where: {
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = challenges.length > limit;
    if (hasMore) challenges.pop();
    return { data: challenges, meta: { hasMore, cursor: challenges[challenges.length - 1]?.id } };
  }

  async getChallengeDetail(challengeId: string) {
    const challenge = await this.prisma.dhikrChallenge.findUnique({ where: { id: challengeId } });
    if (!challenge) throw new NotFoundException('Challenge not found');

    const participants = await this.prisma.dhikrChallengeParticipant.findMany({
      where: { challengeId },
      orderBy: { contributed: 'desc' },
      take: 20,
    });

    const userIds = participants.map((p: { userId: string }) => p.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true, avatarUrl: true },
      take: 50,
    });
    const userMap = new Map(users.map((u: { id: string; displayName: string | null; avatarUrl: string | null }) => [u.id, u]));

    return {
      ...challenge,
      topContributors: participants.map((p: { userId: string; contributed: number }) => ({
        ...p,
        user: userMap.get(p.userId) || null,
      })),
    };
  }

  async joinChallenge(userId: string, challengeId: string) {
    const challenge = await this.prisma.dhikrChallenge.findUnique({ where: { id: challengeId } });
    if (!challenge) throw new NotFoundException('Challenge not found');

    try {
      await this.prisma.dhikrChallengeParticipant.create({
        data: { userId, challengeId },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Already joined this challenge');
      }
      throw error;
    }
    await this.prisma.$executeRaw`UPDATE "dhikr_challenges" SET "participantCount" = "participantCount" + 1 WHERE id = ${challengeId}`;
    return { joined: true };
  }

  async contributeToChallenge(userId: string, challengeId: string, count: number) {
    if (!count || count <= 0 || count > 100000) {
      throw new BadRequestException('Count must be between 1 and 100,000');
    }

    const challenge = await this.prisma.dhikrChallenge.findUnique({ where: { id: challengeId } });
    if (!challenge) throw new NotFoundException('Challenge not found');
    if (challenge.expiresAt && challenge.expiresAt < new Date()) {
      throw new BadRequestException('Challenge has expired');
    }

    const participant = await this.prisma.dhikrChallengeParticipant.findUnique({
      where: { userId_challengeId: { userId, challengeId } },
    });
    if (!participant) throw new BadRequestException('Not a participant');

    // Use transaction to keep participant and challenge counters in sync
    await this.prisma.$transaction([
      this.prisma.$executeRaw`UPDATE "dhikr_challenge_participants" SET contributed = contributed + ${count} WHERE "userId" = ${userId} AND "challengeId" = ${challengeId}`,
      this.prisma.$executeRaw`UPDATE "dhikr_challenges" SET "currentTotal" = "currentTotal" + ${count} WHERE id = ${challengeId}`,
    ]);

    return { contributed: count };
  }

  // ── Adhan Reciters & Calculation Methods ───────────

  getAdhanReciters() {
    return [
      { id: 'mishary', name: 'Mishary Rashid Alafasy', arabicName: 'مشاري راشد العفاسي' },
      { id: 'abdulbasit', name: 'Abdul Basit Abdul Samad', arabicName: 'عبد الباسط عبد الصمد' },
      { id: 'maher', name: 'Maher Al-Muaiqly', arabicName: 'ماهر المعيقلي' },
      { id: 'sudais', name: 'Abdul Rahman Al-Sudais', arabicName: 'عبد الرحمن السديس' },
      { id: 'husary', name: 'Mahmoud Khalil Al-Husary', arabicName: 'محمود خليل الحصري' },
      { id: 'minshawi', name: 'Mohamed Siddiq Al-Minshawi', arabicName: 'محمد صديق المنشاوي' },
    ];
  }

  getCalculationMethods() {
    return [
      { id: 'MWL', name: 'Muslim World League', fajrAngle: 18, ishaAngle: 17 },
      { id: 'ISNA', name: 'Islamic Society of North America', fajrAngle: 15, ishaAngle: 15 },
      { id: 'Egypt', name: 'Egyptian General Authority of Survey', fajrAngle: 19.5, ishaAngle: 17.5 },
      { id: 'Makkah', name: 'Umm al-Qura, Makkah', fajrAngle: 18.5, ishaAngle: 90 },
      { id: 'Karachi', name: 'University of Islamic Sciences, Karachi', fajrAngle: 18, ishaAngle: 18 },
      { id: 'Tehran', name: 'Institute of Geophysics, Tehran', fajrAngle: 17.7, ishaAngle: 14 },
      { id: 'JAKIM', name: 'Department of Islamic Advancement, Malaysia', fajrAngle: 20, ishaAngle: 18 },
      { id: 'DIYANET', name: 'Diyanet İşleri Başkanlığı, Turkey', fajrAngle: 18, ishaAngle: 17 },
    ];
  }

  // ── Quran Audio Recitation ─────────────────────────

  getQuranReciters() {
    return [
      { id: 'mishary', name: 'Mishary Rashid Alafasy', arabicName: 'مشاري راشد العفاسي', audioBaseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy' },
      { id: 'sudais', name: 'Abdul Rahman Al-Sudais', arabicName: 'عبد الرحمن السديس', audioBaseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.abdurrahmaansudais' },
      { id: 'husary', name: 'Mahmoud Khalil Al-Husary', arabicName: 'محمود خليل الحصري', audioBaseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.husary' },
      { id: 'minshawi', name: 'Mohamed Siddiq Al-Minshawi', arabicName: 'محمد صديق المنشاوي', audioBaseUrl: 'https://cdn.islamic.network/quran/audio/128/ar.minshawi' },
    ];
  }

  getQuranAudioUrl(surah: number, ayah: number, reciterId = 'mishary') {
    const reciters = this.getQuranReciters();
    const reciter = reciters.find(r => r.id === reciterId) ?? reciters[0];
    const audioNumber = this.getAudioAyahNumber(surah, ayah);
    return { url: `${reciter.audioBaseUrl}/${audioNumber}.mp3`, reciter: reciter.name };
  }

  private getAudioAyahNumber(surah: number, ayah: number): number {
    // Correct cumulative ayah offsets computed from canonical per-surah counts:
    // [7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, ...]
    // surahOffsets[i] = sum of ayah counts for surahs 1..i
    // So for surah N, the audio number = surahOffsets[N-1] + ayah
    const surahOffsets = [
      0, 7, 293, 493, 669, 789, 954, 1160, 1235, 1364, 1473, 1596, 1707, 1750,
      1802, 1901, 2029, 2140, 2250, 2348, 2483, 2595, 2673, 2791, 2855, 2932,
      3159, 3252, 3340, 3409, 3469, 3503, 3533, 3606, 3660, 3705, 3788, 3970,
      4058, 4133, 4218, 4272, 4325, 4414, 4473, 4510, 4545, 4583, 4612, 4630,
      4675, 4735, 4784, 4846, 4901, 4979, 5075, 5104, 5126, 5150, 5163, 5177,
      5188, 5199, 5217, 5229, 5241, 5271, 5323, 5375, 5419, 5447, 5475, 5495,
      5551, 5591, 5622, 5672, 5712, 5758, 5800, 5829, 5848, 5884, 5909, 5931,
      5948, 5967, 5993, 6023, 6043, 6058, 6079, 6090, 6098, 6106, 6125, 6130,
      6138, 6146, 6157, 6168, 6176, 6179, 6188, 6193, 6197, 6204, 6207, 6213,
      6216, 6221, 6225, 6230,
    ];
    if (surah < 1 || surah > 114) return ayah;
    return (surahOffsets[surah - 1] || 0) + ayah;
  }

  // ── Quran Text API (Quran.com v4) ───────────────────

  getQuranChapters(): SurahMetadata[] {
    return SURAH_METADATA;
  }

  getQuranChapter(surahNumber: number): SurahMetadata {
    const surah = SURAH_METADATA.find(s => s.number === surahNumber);
    if (!surah) throw new NotFoundException(`Surah ${surahNumber} not found (valid: 1-114)`);
    return surah;
  }

  async getQuranVerses(surahNumber: number, translation = 'en'): Promise<{
    surah: SurahMetadata;
    verses: { number: number; arabicText: string; translation: string }[];
  }> {
    const surah = this.getQuranChapter(surahNumber);

    // Translation resource ID mapping for Quran.com API v4
    const translationIds: Record<string, number> = {
      en: 131,  // Dr. Mustafa Khattab (The Clear Quran)
      ar: 0,    // Arabic only (no translation needed)
      tr: 77,   // Diyanet
      ur: 97,   // Fateh Muhammad Jalandhry
      bn: 161,  // Muhiuddin Khan
      fr: 136,  // Muhammad Hamidullah
      id: 33,   // Indonesian - Ministry of Religious Affairs
      ms: 39,   // Malay - Abdullah Muhammad Basmeih
    };
    const transId = translationIds[translation] ?? 131;

    const cacheKey = `quran:verses:${surahNumber}:${translation}`;

    // Check Redis cache
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (cacheErr) {
      this.logger.debug(`Redis cache read failed: ${cacheErr instanceof Error ? cacheErr.message : cacheErr}`);
    }

    // Fetch from Quran.com API v4
    try {
      const url = translation === 'ar'
        ? `https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number=${surahNumber}`
        : `https://api.quran.com/api/v4/verses/by_chapter/${surahNumber}?language=${translation}&translations=${transId}&per_page=${surah.ayahCount}&fields=text_uthmani`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      const data = await response.json();

      let verses: { number: number; arabicText: string; translation: string }[];

      if (translation === 'ar') {
        // Arabic-only endpoint returns { verses: [{ id, verse_key, text_uthmani }] }
        verses = (data.verses || []).map((v: { verse_key: string; text_uthmani: string }, idx: number) => ({
          number: idx + 1,
          arabicText: v.text_uthmani || '',
          translation: '',
        }));
      } else {
        // Translation endpoint returns { verses: [{ verse_number, text_uthmani, translations: [{text}] }] }
        verses = (data.verses || []).map((v: { verse_number: number; text_uthmani: string; translations: { text: string }[] }) => ({
          number: v.verse_number,
          arabicText: v.text_uthmani || '',
          translation: v.translations?.[0]?.text?.replace(/<[^>]+>/g, '') || '',
        }));
      }

      const result = { surah, verses };

      // Cache for 30 days (Quran text doesn't change)
      try {
        await this.redis.setex(cacheKey, 2592000, JSON.stringify(result));
      } catch (cacheErr) {
        this.logger.debug(`Redis cache write failed: ${cacheErr instanceof Error ? cacheErr.message : cacheErr}`);
      }

      return result;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Quran.com API failed: ${msg}`);
      throw new BadRequestException('Unable to fetch Quran verses — please try again later');
    }
  }

  async getQuranVerse(surahNumber: number, ayahNumber: number, translation = 'en'): Promise<{
    surah: SurahMetadata;
    verse: { number: number; arabicText: string; translation: string };
    audioUrl: string;
  }> {
    const surah = this.getQuranChapter(surahNumber);
    if (ayahNumber < 1 || ayahNumber > surah.ayahCount) {
      throw new BadRequestException(`Ayah ${ayahNumber} not valid for Surah ${surahNumber} (has ${surah.ayahCount} ayahs)`);
    }

    const translationIds: Record<string, number> = {
      en: 131, ar: 0, tr: 77, ur: 97, bn: 161, fr: 136, id: 33, ms: 39,
    };
    const transId = translationIds[translation] ?? 131;
    const verseKey = `${surahNumber}:${ayahNumber}`;
    const cacheKey = `quran:verse:${verseKey}:${translation}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (cacheErr) {
      this.logger.debug(`Redis cache read failed: ${cacheErr instanceof Error ? cacheErr.message : cacheErr}`);
    }

    try {
      const url = `https://api.quran.com/api/v4/verses/by_key/${verseKey}?language=${translation}&translations=${transId}&fields=text_uthmani`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      const data = await response.json();
      const v = data.verse;

      const verse = {
        number: ayahNumber,
        arabicText: v?.text_uthmani || '',
        translation: v?.translations?.[0]?.text?.replace(/<[^>]+>/g, '') || '',
      };

      const audio = this.getQuranAudioUrl(surahNumber, ayahNumber);
      const result = { surah, verse, audioUrl: audio.url };

      try {
        await this.redis.setex(cacheKey, 2592000, JSON.stringify(result));
      } catch (cacheErr) {
        this.logger.debug(`Redis cache write failed: ${cacheErr instanceof Error ? cacheErr.message : cacheErr}`);
      }

      return result;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Quran.com API failed for verse ${verseKey}: ${msg}`);
      throw new BadRequestException('Unable to fetch verse — please try again later');
    }
  }

  async searchQuran(query: string, translation = 'en', limit = 20): Promise<{
    results: { surahNumber: number; ayahNumber: number; surahName: string; arabicText: string; translationText: string }[];
    total: number;
  }> {
    if (!query || query.trim().length < 2) {
      throw new BadRequestException('Search query must be at least 2 characters');
    }

    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const cacheKey = `quran:search:${query.toLowerCase().trim()}:${translation}:${safeLimit}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (cacheErr) {
      this.logger.debug(`Redis cache read failed: ${cacheErr instanceof Error ? cacheErr.message : cacheErr}`);
    }

    try {
      const translationIds: Record<string, number> = {
        en: 131, tr: 77, ur: 97, bn: 161, fr: 136, id: 33, ms: 39,
      };
      const transId = translationIds[translation] ?? 131;
      const url = `https://api.quran.com/api/v4/search?q=${encodeURIComponent(query)}&size=${safeLimit}&language=${translation}&translations=${transId}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      const data = await response.json();
      const searchResults = data.search?.results || [];

      const results = searchResults.map((r: { verse_key: string; text: string; translations: { text: string }[] }) => {
        const [surahNum, ayahNum] = r.verse_key.split(':').map(Number);
        const surah = SURAH_METADATA.find(s => s.number === surahNum);
        return {
          surahNumber: surahNum,
          ayahNumber: ayahNum,
          surahName: surah?.nameEnglish ?? `Surah ${surahNum}`,
          arabicText: r.text || '',
          translationText: r.translations?.[0]?.text?.replace(/<[^>]+>/g, '') || '',
        };
      });

      const result = { results, total: data.search?.total_results || results.length };

      try {
        await this.redis.setex(cacheKey, 3600, JSON.stringify(result)); // 1h cache for search
      } catch (cacheErr) {
        this.logger.debug(`Redis cache write failed: ${cacheErr instanceof Error ? cacheErr.message : cacheErr}`);
      }

      return result;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Quran search failed: ${msg}`);
      throw new BadRequestException('Unable to search Quran — please try again later');
    }
  }

  async getRandomAyah(translation = 'en'): Promise<{
    surahNumber: number;
    surahName: string;
    ayahNumber: number;
    arabicText: string;
    translation: string;
    audioUrl: string;
  }> {
    // Pick a random surah:ayah
    const randomIndex = Math.floor(Math.random() * TOTAL_AYAHS);
    let cumulative = 0;
    let surahNumber = 1;
    let ayahNumber = 1;
    for (const s of SURAH_METADATA) {
      if (randomIndex < cumulative + s.ayahCount) {
        surahNumber = s.number;
        ayahNumber = randomIndex - cumulative + 1;
        break;
      }
      cumulative += s.ayahCount;
    }

    try {
      const result = await this.getQuranVerse(surahNumber, ayahNumber, translation);
      const surah = SURAH_METADATA.find(s => s.number === surahNumber);
      return {
        surahNumber,
        surahName: surah?.nameEnglish ?? `Surah ${surahNumber}`,
        ayahNumber,
        arabicText: result.verse.arabicText,
        translation: result.verse.translation,
        audioUrl: result.audioUrl,
      };
    } catch (apiErr) {
      this.logger.debug(`Quran API call failed, using fallback: ${apiErr instanceof Error ? apiErr.message : apiErr}`);
      // If API fails, return a placeholder with reference
      const surah = SURAH_METADATA.find(s => s.number === surahNumber);
      const audio = this.getQuranAudioUrl(surahNumber, ayahNumber);
      return {
        surahNumber,
        surahName: surah?.nameEnglish ?? `Surah ${surahNumber}`,
        ayahNumber,
        arabicText: '',
        translation: `Surah ${surah?.nameEnglish ?? surahNumber}, Ayah ${ayahNumber}`,
        audioUrl: audio.url,
      };
    }
  }

  async getQuranJuz(juzNumber: number, translation = 'en'): Promise<{
    juz: number;
    verses: { surahNumber: number; surahName: string; ayahNumber: number; arabicText: string; translation: string }[];
  }> {
    if (juzNumber < 1 || juzNumber > 30) {
      throw new BadRequestException('Juz number must be 1-30');
    }

    const cacheKey = `quran:juz:${juzNumber}:${translation}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (cacheErr) {
      this.logger.debug(`Redis cache read failed: ${cacheErr instanceof Error ? cacheErr.message : cacheErr}`);
    }

    try {
      const translationIds: Record<string, number> = {
        en: 131, tr: 77, ur: 97, bn: 161, fr: 136, id: 33, ms: 39,
      };
      const transId = translationIds[translation] ?? 131;
      const url = `https://api.quran.com/api/v4/verses/by_juz/${juzNumber}?language=${translation}&translations=${transId}&per_page=300&fields=text_uthmani`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      const data = await response.json();

      const verses = (data.verses || []).map((v: { verse_key: string; verse_number: number; text_uthmani: string; translations: { text: string }[] }) => {
        const [surahNum] = v.verse_key.split(':').map(Number);
        const surah = SURAH_METADATA.find(s => s.number === surahNum);
        return {
          surahNumber: surahNum,
          surahName: surah?.nameEnglish ?? `Surah ${surahNum}`,
          ayahNumber: v.verse_number,
          arabicText: v.text_uthmani || '',
          translation: v.translations?.[0]?.text?.replace(/<[^>]+>/g, '') || '',
        };
      });

      const result = { juz: juzNumber, verses };

      try {
        await this.redis.setex(cacheKey, 2592000, JSON.stringify(result));
      } catch (cacheErr) {
        this.logger.debug(`Redis cache write failed: ${cacheErr instanceof Error ? cacheErr.message : cacheErr}`);
      }

      return result;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Quran.com juz API failed: ${msg}`);
      throw new BadRequestException('Unable to fetch juz — please try again later');
    }
  }

  // ============================================================
  // DUA COLLECTION
  // ============================================================

  private get duas(): DuaEntry[] {
    // JSON imports are typed at compile time; runtime shape validated by usage
    return duasData as DuaEntry[];
  }

  getDuasByCategory(category?: string): DuaEntry[] {
    if (!category) return this.duas;
    return this.duas.filter((d) => d.category === category);
  }

  getDuaById(id: string): DuaEntry | undefined {
    return this.duas.find((d) => d.id === id);
  }

  getDuaOfTheDay(): DuaEntry {
    // Deterministic per day: hash the date to pick a dua
    const today = new Date();
    const daysSinceEpoch = Math.floor(today.getTime() / 86400000);
    const index = daysSinceEpoch % this.duas.length;
    return this.duas[index];
  }

  getDuaCategories(): string[] {
    const cats = new Set<string>();
    for (const d of this.duas) cats.add(d.category);
    return [...cats];
  }

  async bookmarkDua(userId: string, duaId: string) {
    const existing = await this.prisma.duaBookmark.findUnique({
      where: { userId_duaId: { userId, duaId } },
    });
    if (existing) return existing;
    return this.prisma.duaBookmark.create({
      data: { userId, duaId },
    });
  }

  async unbookmarkDua(userId: string, duaId: string) {
    try {
      await this.prisma.duaBookmark.delete({
        where: { userId_duaId: { userId, duaId } },
      });
    } catch (err) {
      // Already removed — idempotent
      this.logger.debug(`Dua bookmark delete (may be already removed): ${err instanceof Error ? err.message : err}`);
    }
    return { removed: true };
  }

  // ============================================================
  // FASTING TRACKER
  // ============================================================

  async logFast(userId: string, data: { date: string; isFasting: boolean; fastType?: string; reason?: string }) {
    const dateObj = new Date(data.date);
    const ft = (data.fastType ?? 'RAMADAN') as FastingType;
    return this.prisma.fastingLog.upsert({
      where: { userId_date: { userId, date: dateObj } },
      update: {
        isFasting: data.isFasting,
        fastType: ft,
        reason: data.reason,
      },
      create: {
        userId,
        date: dateObj,
        isFasting: data.isFasting,
        fastType: ft,
        reason: data.reason,
      },
    });
  }

  async getFastingLog(userId: string, month: string) {
    // month format: YYYY-MM
    const [year, mon] = month.split('-').map(Number);
    const startDate = new Date(year, mon - 1, 1);
    const endDate = new Date(year, mon, 0); // Last day of month

    return this.prisma.fastingLog.findMany({
      where: {
        userId,
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: 'asc' },
      take: 50,
    });
  }

  async getFastingStats(userId: string) {
    const yearStart = new Date(new Date().getFullYear(), 0, 1);

    const logs = await this.prisma.fastingLog.findMany({
      where: { userId, date: { gte: yearStart } },
      orderBy: { date: 'asc' },
      take: 400,
    });

    const totalFasts = logs.filter((l) => l.isFasting).length;
    const missedRamadan = logs.filter((l) => !l.isFasting && l.fastType === 'RAMADAN').length;

    // Calculate current streak
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sortedDesc = [...logs].filter((l) => l.isFasting).reverse();
    for (const log of sortedDesc) {
      const logDate = new Date(log.date);
      logDate.setHours(0, 0, 0, 0);
      const expected = new Date(today);
      expected.setDate(expected.getDate() - streak);
      expected.setHours(0, 0, 0, 0);
      if (logDate.getTime() === expected.getTime()) {
        streak++;
      } else {
        break;
      }
    }

    return {
      totalFastsThisYear: totalFasts,
      currentStreak: streak,
      makeupNeeded: missedRamadan,
    };
  }

  async getBookmarkedDuas(userId: string): Promise<DuaEntry[]> {
    const bookmarks = await this.prisma.duaBookmark.findMany({
      where: { userId },
      select: { duaId: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const ids = new Set(bookmarks.map((b) => b.duaId));
    return this.duas.filter((d) => ids.has(d.id));
  }

  // ============================================================
  // 99 NAMES OF ALLAH
  // ============================================================

  private get namesOfAllah(): NameOfAllah[] {
    return asmaUlHusnaData as NameOfAllah[];
  }

  getAllNamesOfAllah(): NameOfAllah[] {
    return this.namesOfAllah;
  }

  getNameOfAllahByNumber(num: number): NameOfAllah | undefined {
    return this.namesOfAllah.find((n) => n.number === num);
  }

  // ============================================================
  // PRAYER TIME WINDOW
  // ============================================================

  getCurrentPrayerWindow(prayerTimings: Record<string, string>): {
    currentPrayer: string;
    nextPrayer: string;
    minutesUntilNext: number;
  } {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
    const prayerMinutes: { name: string; minutes: number }[] = [];

    for (const prayer of prayers) {
      const timeStr = prayerTimings[prayer];
      if (!timeStr) continue;
      const [h, m] = timeStr.split(':').map(Number);
      prayerMinutes.push({ name: prayer, minutes: h * 60 + m });
    }

    if (prayerMinutes.length === 0) {
      return { currentPrayer: 'unknown', nextPrayer: 'fajr', minutesUntilNext: 0 };
    }

    // Find current and next prayer
    let currentPrayer = prayerMinutes[prayerMinutes.length - 1].name; // default: last prayer (isha)
    let nextPrayer = prayerMinutes[0].name; // default: first prayer (fajr)
    let minutesUntilNext = (prayerMinutes[0].minutes + 1440 - currentMinutes) % 1440;

    for (let i = 0; i < prayerMinutes.length; i++) {
      if (currentMinutes >= prayerMinutes[i].minutes) {
        currentPrayer = prayerMinutes[i].name;
        const nextIdx = (i + 1) % prayerMinutes.length;
        nextPrayer = prayerMinutes[nextIdx].name;
        minutesUntilNext = (prayerMinutes[nextIdx].minutes + 1440 - currentMinutes) % 1440;
      }
    }

    return { currentPrayer, nextPrayer, minutesUntilNext };
  }

  getDailyNameOfAllah(): NameOfAllah {
    const daysSinceEpoch = Math.floor(Date.now() / 86400000);
    const index = daysSinceEpoch % 99;
    return this.namesOfAllah[index];
  }

  // ============================================================
  // HIFZ (QURAN MEMORIZATION) TRACKER
  // ============================================================

  async getHifzProgress(userId: string) {
    const progress = await this.prisma.hifzProgress.findMany({
      where: { userId },
      orderBy: { surahNum: 'asc' },
      take: 120,
    });

    // Build full 114 surah list with default status
    const progressMap = new Map(progress.map((p) => [p.surahNum, p]));
    const allSurahs = [];
    for (let i = 1; i <= 114; i++) {
      const existing = progressMap.get(i);
      allSurahs.push({
        surahNum: i,
        status: existing?.status ?? 'NOT_STARTED',
        lastReviewedAt: existing?.lastReviewedAt ?? null,
      });
    }
    return allSurahs;
  }

  async updateHifzProgress(userId: string, surahNum: number, status: string) {
    if (surahNum < 1 || surahNum > 114) {
      throw new BadRequestException('Surah number must be 1-114');
    }
    const validStatuses = ['NOT_STARTED', 'IN_PROGRESS', 'MEMORIZED', 'NEEDS_REVIEW'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(`Status must be one of: ${validStatuses.join(', ')}`);
    }

    const hs = status as HifzStatus;
    return this.prisma.hifzProgress.upsert({
      where: { userId_surahNum: { userId, surahNum } },
      update: {
        status: hs,
        lastReviewedAt: hs === 'MEMORIZED' || hs === 'NEEDS_REVIEW' ? new Date() : undefined,
      },
      create: {
        userId,
        surahNum,
        status: hs,
        lastReviewedAt: hs === 'MEMORIZED' ? new Date() : null,
      },
    });
  }

  async getHifzStats(userId: string) {
    const progress = await this.prisma.hifzProgress.findMany({
      where: { userId },
      take: 120,
    });

    const memorized = progress.filter((p) => p.status === 'MEMORIZED').length;
    const inProgress = progress.filter((p) => p.status === 'IN_PROGRESS').length;
    const needsReview = progress.filter((p) => p.status === 'NEEDS_REVIEW').length;

    return {
      memorized,
      inProgress,
      needsReview,
      notStarted: 114 - memorized - inProgress - needsReview,
      percentage: Math.round((memorized / 114) * 100),
    };
  }

  // ============================================================
  // DAILY BRIEFING
  // ============================================================

  async getDailyBriefing(userId: string, lat?: number, lng?: number) {
    const today = new Date();
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // Get hadith and dua of the day (deterministic per date)
    const hadith = this.getDailyHadith();
    const dua = this.getDuaOfTheDay();

    // Ayah of the day — deterministic based on date
    const daysSinceEpoch = Math.floor(today.getTime() / 86400000);
    const TOTAL_AYAHS = 6236;
    const ayahIndex = daysSinceEpoch % TOTAL_AYAHS;
    const ayahOfTheDay = {
      surah: this.getAyahSurahName(ayahIndex),
      ayahNumber: this.getAyahNumber(ayahIndex),
      arabic: '',
      translation: '',
    };

    // Get prayer times if location provided
    let prayerTimes: Record<string, string> | null = null;
    if (lat && lng) {
      try {
        const pt = await this.getPrayerTimes({ lat, lng });
        prayerTimes = pt.timings;
      } catch (ptErr) {
        this.logger.debug(`Prayer times unavailable for morning briefing: ${ptErr instanceof Error ? ptErr.message : ptErr}`);
      }
    }

    // Get dhikr progress for today
    const todayDhikrSessions = await this.prisma.dhikrSession.findMany({
      where: {
        userId,
        createdAt: { gte: todayDate },
      },
      take: 50,
    });
    const dhikrTotal = todayDhikrSessions.reduce((sum, s) => sum + s.count, 0);

    // Get daily task completions
    const completions = await this.prisma.dailyTaskCompletion.findMany({
      where: { userId, date: todayDate },
      take: 50,
    });
    const completedTasks = completions.map((c) => c.taskType);

    // Hijri date (computed server-side for consistency)
    const hijriDate = this.computeHijriDateString(today);

    return {
      hijriDate,
      prayerTimes,
      hadithOfTheDay: {
        text: hadith.english,
        arabic: hadith.arabic,
        source: hadith.source,
        narrator: hadith.narrator,
      },
      ayahOfTheDay,
      duaOfTheDay: {
        arabic: dua.arabicText,
        translation: dua.translation?.en || '',
        transliteration: dua.transliteration,
        category: dua.category,
        source: dua.source,
      },
      dhikrChallenge: {
        text: 'SubhanAllah',
        target: 33,
        completed: Math.min(dhikrTotal, 33),
        streakDays: 0,
      },
      tasksCompleted: completedTasks.length,
      totalTasks: 3,
      completedTasks,
    };
  }

  async completeDailyTask(userId: string, taskType: string) {
    const validTypes = ['DHIKR', 'QURAN', 'REFLECTION'];
    if (!validTypes.includes(taskType)) {
      throw new BadRequestException(`Invalid task type. Must be one of: ${validTypes.join(', ')}`);
    }

    const today = new Date();
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // Upsert to handle duplicate completion attempts
    const tt = taskType as DailyTaskType;
    const completion = await this.prisma.dailyTaskCompletion.upsert({
      where: {
        userId_date_taskType: { userId, date: todayDate, taskType: tt },
      },
      create: { userId, date: todayDate, taskType: tt },
      update: {},
    });

    // Check if all 3 tasks are now complete
    const allCompletions = await this.prisma.dailyTaskCompletion.findMany({
      where: { userId, date: todayDate },
      take: 50,
    });

    const allComplete = allCompletions.length >= 3;

    return {
      taskType,
      completed: true,
      allTasksComplete: allComplete,
      bonusXPAwarded: allComplete,
    };
  }

  async getDailyTasksToday(userId: string) {
    const today = new Date();
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const completions = await this.prisma.dailyTaskCompletion.findMany({
      where: { userId, date: todayDate },
      take: 50,
    });

    return {
      tasks: [
        { type: 'dhikr', completed: completions.some((c) => c.taskType === 'DHIKR') },
        { type: 'quran', completed: completions.some((c) => c.taskType === 'QURAN') },
        { type: 'reflection', completed: completions.some((c) => c.taskType === 'REFLECTION') },
      ],
      totalCompleted: completions.length,
      allComplete: completions.length >= 3,
    };
  }

  private getAyahSurahName(ayahIndex: number): string {
    // Simplified mapping — maps cumulative ayah index to surah name
    const surahAyahCounts = [7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6];
    let cumulative = 0;
    for (let i = 0; i < surahAyahCounts.length; i++) {
      cumulative += surahAyahCounts[i];
      if (ayahIndex < cumulative) {
        return `Surah ${i + 1}`;
      }
    }
    return 'Surah 114';
  }

  private getAyahNumber(ayahIndex: number): number {
    const surahAyahCounts = [7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6];
    let cumulative = 0;
    for (let i = 0; i < surahAyahCounts.length; i++) {
      const prev = cumulative;
      cumulative += surahAyahCounts[i];
      if (ayahIndex < cumulative) {
        return ayahIndex - prev + 1;
      }
    }
    return 1;
  }

  private computeHijriDateString(date: Date): string {
    // Simple Kuwaiti algorithm for Hijri date
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
    const MONTHS = ['Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani', 'Jumada al-Ula', 'Jumada al-Thani', 'Rajab', 'Shaban', 'Ramadan', 'Shawwal', 'Dhu al-Qadah', 'Dhu al-Hijjah'];
    return `${hijriDay} ${MONTHS[hijriMonth - 1] || MONTHS[0]} ${hijriYear}`;
  }

  async getHifzReviewSchedule(userId: string) {
    // Spaced repetition: return surahs not reviewed in the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    return this.prisma.hifzProgress.findMany({
      where: {
        userId,
        status: { in: ['MEMORIZED', 'NEEDS_REVIEW'] },
        OR: [
          { lastReviewedAt: null },
          { lastReviewedAt: { lt: sevenDaysAgo } },
        ],
      },
      orderBy: { lastReviewedAt: 'asc' },
      take: 10,
    });
  }

  /**
   * Finding #281: Follow a mosque — store lat/lng in Redis for prayer time fetching.
   */
  async followMosque(userId: string, mosqueName: string, lat: number, lng: number) {
    await this.redis.hset(`user:mosque:${userId}`, {
      name: mosqueName,
      lat: String(lat),
      lng: String(lng),
    });
    return { followed: true, mosqueName };
  }

  /**
   * Finding #281: Get prayer times for the user's followed mosque.
   */
  async getFollowedMosqueTimes(userId: string) {
    const mosque = await this.redis.hgetall(`user:mosque:${userId}`);
    if (!mosque?.lat || !mosque?.lng) {
      return { hasMosque: false, message: 'No mosque followed yet' };
    }

    const prayerTimes = await this.getPrayerTimes({
      lat: parseFloat(mosque.lat),
      lng: parseFloat(mosque.lng),
    });

    return {
      hasMosque: true,
      mosqueName: mosque.name,
      prayerTimes,
    };
  }

  /**
   * Finding #215: Quran verse of the day — daily push notification at 6 AM.
   * Sends a random verse to all users with push tokens.
   */
  @Cron('0 6 * * *') // 6:00 AM daily
  async sendVerseOfTheDay() {
    try {
      // Pick a random surah (1-114), then fetch surah info for valid verse range
      const surah = Math.floor(Math.random() * 114) + 1;

      // Verse counts per surah (all 114 surahs)
      const SURAH_VERSE_COUNTS = [
        7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111,
        110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45,
        83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55,
        78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20,
        56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21,
        11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
      ];
      const maxVerse = SURAH_VERSE_COUNTS[surah - 1] || 7;
      const verse = Math.floor(Math.random() * maxVerse) + 1;

      // Fetch from Quran.com API
      const response = await fetch(`https://api.quran.com/api/v4/verses/by_key/${surah}:${verse}?language=en&translations=131`);
      if (!response.ok) return;

      const data = await response.json() as { verse?: { text_uthmani?: string; translations?: Array<{ text?: string }> } };
      const arabicText = data.verse?.text_uthmani ?? '';
      const translationText = data.verse?.translations?.[0]?.text?.replace(/<[^>]*>/g, '') ?? '';

      if (!arabicText) return;

      // Send to all users with push tokens — batched createMany
      const usersWithTokens = await this.prisma.device.findMany({
        where: { isActive: true, pushToken: { not: '' } },
        select: { userId: true },
        take: 10000,
      });
      const userIds = [...new Set(usersWithTokens.map(d => d.userId))];

      const title = `📖 Verse of the Day (${surah}:${verse})`;
      const body = translationText.slice(0, 200);
      const BATCH_SIZE = 500;
      let created = 0;
      for (let i = 0; i < Math.min(userIds.length, 10000); i += BATCH_SIZE) {
        const batch = userIds.slice(i, i + BATCH_SIZE);
        const result = await this.prisma.notification.createMany({
          data: batch.map(uid => ({
            userId: uid,
            type: 'SYSTEM' as const,
            title,
            body,
          })),
          skipDuplicates: true,
        });
        created += result.count;

        // Queue push delivery for created notifications
        const recentNotifs = await this.prisma.notification.findMany({
          where: { userId: { in: batch }, type: 'SYSTEM', title, createdAt: { gte: new Date(Date.now() - 60000) } },
          select: { id: true },
          take: BATCH_SIZE,
        });
        for (const n of recentNotifs) {
          this.queueService.addPushNotificationJob({ notificationId: n.id }).catch(() => {});
        }
      }

      this.logger.log(`Verse of the day sent: ${surah}:${verse} to ${created} users (batched)`);
    } catch (err: unknown) {
      this.logger.error(`Verse of the day failed: ${err instanceof Error ? err.message : String(err)}`);
      Sentry.captureException(err);
    }
  }

  /**
   * Finding #279: Islamic event reminders — notify users about key dates.
   * Runs daily at 8 AM, checks if today matches any Islamic event.
   */
  @Cron('0 8 * * *')
  async checkIslamicEventReminders() {
    try {
    // Key Islamic events with approximate Hijri month/day
    const events = [
      { month: 9, day: 1, name: 'Ramadan begins', key: 'ramadan_start' },
      { month: 9, day: 27, name: 'Laylat al-Qadr (approximate)', key: 'laylat_al_qadr' },
      { month: 10, day: 1, name: 'Eid al-Fitr', key: 'eid_al_fitr' },
      { month: 12, day: 10, name: 'Eid al-Adha', key: 'eid_al_adha' },
      { month: 1, day: 10, name: 'Ashura', key: 'ashura' },
      { month: 3, day: 12, name: 'Mawlid al-Nabi', key: 'mawlid' },
      { month: 7, day: 27, name: "Isra' Mi'raj", key: 'isra_miraj' },
    ];

    // Get today's Hijri date (approximate conversion)
    const today = new Date();
    const hijriApprox = this.approximateHijriDate(today);
    const todayEvent = events.find(e => e.month === hijriApprox.month && e.day === hijriApprox.day);

    if (!todayEvent) return;

    // Dedup: check Redis to avoid sending same event twice
    const dedup = await this.redis.get(`islamic_event:${todayEvent.key}:${today.toISOString().slice(0, 10)}`);
    if (dedup) return;
    await this.redis.setex(`islamic_event:${todayEvent.key}:${today.toISOString().slice(0, 10)}`, 86400, '1');

    // Send notification to all users — batched to avoid blocking event loop
    const users = await this.prisma.user.findMany({
      where: { isDeactivated: false, isBanned: false, isDeleted: false },
      select: { id: true },
      take: 10000,
    });

    const BATCH_SIZE = 500;
    const title = todayEvent.name;
    const body = `Today is ${todayEvent.name}. May Allah bless you on this special day.`;
    let created = 0;

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      const batchIds = batch.map(u => u.id);
      const result = await this.prisma.notification.createMany({
        data: batch.map(user => ({
          userId: user.id,
          type: 'SYSTEM' as const,
          title,
          body,
        })),
        skipDuplicates: true,
      });
      created += result.count;

      // Queue push delivery for created notifications
      const recentNotifs = await this.prisma.notification.findMany({
        where: { userId: { in: batchIds }, type: 'SYSTEM', title, createdAt: { gte: new Date(Date.now() - 60000) } },
        select: { id: true },
        take: BATCH_SIZE,
      });
      for (const n of recentNotifs) {
        this.queueService.addPushNotificationJob({ notificationId: n.id }).catch(() => {});
      }
    }

    this.logger.log(`Islamic event reminder sent: ${title} to ${created} users (batched)`);
    } catch (error) {
      this.logger.error('checkIslamicEventReminders cron failed', error instanceof Error ? error.message : error);
      Sentry.captureException(error);
    }
  }

  /**
   * Approximate Hijri date from Gregorian (rough calculation for event matching).
   */
  private approximateHijriDate(date: Date): { year: number; month: number; day: number } {
    const epoch = new Date(622, 6, 16).getTime(); // Hijri epoch approximate
    const daysSinceEpoch = Math.floor((date.getTime() - epoch) / (1000 * 60 * 60 * 24));
    const lunarYear = 354.36667;
    const year = Math.floor(daysSinceEpoch / lunarYear) + 1;
    const dayInYear = daysSinceEpoch % Math.floor(lunarYear);
    const month = Math.floor(dayInYear / 29.5) + 1;
    const day = Math.floor(dayInYear % 29.5) + 1;
    return { year, month: Math.min(month, 12), day: Math.min(day, 30) };
  }

  // Finding #247: Islamic glossary — returns definitions for common Islamic terms
  getGlossary(query?: string) {
    const glossary = [
      { term: 'Sunnah', arabic: 'سنة', definition: 'The practices and traditions of Prophet Muhammad (PBUH)' },
      { term: 'Fiqh', arabic: 'فقه', definition: 'Islamic jurisprudence — understanding of Sharia law' },
      { term: 'Tafsir', arabic: 'تفسير', definition: 'Scholarly commentary and interpretation of the Quran' },
      { term: 'Hadith', arabic: 'حديث', definition: 'Recorded sayings and actions of Prophet Muhammad (PBUH)' },
      { term: 'Dawah', arabic: 'دعوة', definition: 'Invitation to Islam; sharing Islamic knowledge' },
      { term: 'Seerah', arabic: 'سيرة', definition: 'Biography of Prophet Muhammad (PBUH)' },
      { term: 'Aqeedah', arabic: 'عقيدة', definition: 'Islamic creed and core beliefs' },
      { term: 'Halal', arabic: 'حلال', definition: 'Permissible according to Islamic law' },
      { term: 'Haram', arabic: 'حرام', definition: 'Forbidden according to Islamic law' },
      { term: 'Wudu', arabic: 'وضوء', definition: 'Ritual ablution before prayer' },
      { term: 'Salah', arabic: 'صلاة', definition: 'The five daily obligatory prayers' },
      { term: 'Zakat', arabic: 'زكاة', definition: 'Obligatory charity (2.5% of qualifying wealth annually)' },
      { term: 'Sawm', arabic: 'صوم', definition: 'Fasting, especially during Ramadan' },
      { term: 'Hajj', arabic: 'حج', definition: 'Annual pilgrimage to Makkah (one of the five pillars)' },
      { term: 'Umrah', arabic: 'عمرة', definition: 'Lesser pilgrimage to Makkah (can be performed anytime)' },
      { term: 'Dhikr', arabic: 'ذكر', definition: 'Remembrance of Allah through repeated phrases' },
      { term: 'Dua', arabic: 'دعاء', definition: 'Personal supplication/prayer to Allah' },
      { term: 'Taqwa', arabic: 'تقوى', definition: 'God-consciousness; being mindful of Allah in all actions' },
      { term: 'Shura', arabic: 'شورى', definition: 'Consultation — making decisions through group counsel' },
      { term: 'Iman', arabic: 'إيمان', definition: 'Faith; belief in the six articles of faith' },
      { term: 'Ihsan', arabic: 'إحسان', definition: 'Excellence in worship; acting as though Allah sees you' },
      { term: 'Sahih', arabic: 'صحيح', definition: 'Authentic — highest grade of hadith reliability' },
      { term: 'Hasan', arabic: 'حسن', definition: 'Good — second grade of hadith reliability' },
      { term: "Da'if", arabic: 'ضعيف', definition: 'Weak — hadith with reliability concerns' },
      { term: 'Isnad', arabic: 'إسناد', definition: 'Chain of narrators transmitting a hadith' },
      { term: 'Ijma', arabic: 'إجماع', definition: 'Scholarly consensus on an Islamic ruling' },
      { term: 'Qiyas', arabic: 'قياس', definition: 'Analogical reasoning in Islamic jurisprudence' },
      { term: 'Fatwa', arabic: 'فتوى', definition: 'Islamic legal ruling issued by a qualified scholar' },
      { term: 'Khutbah', arabic: 'خطبة', definition: 'Sermon delivered during Friday prayers or Eid' },
      { term: 'Masjid', arabic: 'مسجد', definition: 'Mosque — place of worship and community gathering' },
      { term: 'Ummah', arabic: 'أمة', definition: 'The global Muslim community' },
      { term: 'Barakah', arabic: 'بركة', definition: 'Blessings and divine grace from Allah' },
      { term: 'Niyyah', arabic: 'نية', definition: 'Intention — required before every act of worship' },
      { term: 'Sharia', arabic: 'شريعة', definition: 'Islamic law derived from Quran and Sunnah' },
      { term: 'Qadr', arabic: 'قدر', definition: 'Divine decree — belief that everything happens by Allah\'s will' },
      { term: 'Tawbah', arabic: 'توبة', definition: 'Repentance — sincerely returning to Allah after sin' },
      { term: 'Sadaqah', arabic: 'صدقة', definition: 'Voluntary charity given for the sake of Allah' },
      { term: 'Waqf', arabic: 'وقف', definition: 'Charitable endowment — assets dedicated to benefit the community' },
      { term: 'Khatm', arabic: 'ختم', definition: 'Completion of reading the entire Quran' },
      { term: 'Tajweed', arabic: 'تجويد', definition: 'Rules for correct pronunciation of Quran recitation' },
    ];

    if (query) {
      const q = query.toLowerCase();
      return {
        data: glossary.filter(g =>
          g.term.toLowerCase().includes(q) ||
          g.arabic.includes(q) ||
          g.definition.toLowerCase().includes(q),
        ),
      };
    }

    return { data: glossary };
  }

  // Finding #319-321, 323: Islamic content classification
  // Auto-classifies content into Islamic categories based on keywords
  classifyIslamicContent(content: string): { category: string | null; confidence: number; tags: string[] } {
    if (!content) return { category: null, confidence: 0, tags: [] };

    const text = content.toLowerCase();
    const tags: string[] = [];
    const scores: Record<string, number> = {};

    // Quran/Tafsir indicators
    const quranPatterns = [/surah/i, /ayah/i, /verse/i, /quran/i, /\d+:\d+/, /tafsir/i, /ibn kathir/i, /al-tabari/i];
    const quranScore = quranPatterns.reduce((s, p) => s + (p.test(text) ? 1 : 0), 0);
    if (quranScore > 0) { scores['quran_tafsir'] = quranScore; tags.push('quran'); }

    // Hadith indicators
    const hadithPatterns = [/hadith/i, /sahih/i, /bukhari/i, /muslim/i, /tirmidhi/i, /abu dawud/i, /narrated/i, /prophet.*said/i, /pbuh/i, /isnad/i];
    const hadithScore = hadithPatterns.reduce((s, p) => s + (p.test(text) ? 1 : 0), 0);
    if (hadithScore > 0) { scores['hadith'] = hadithScore; tags.push('hadith'); }

    // Fiqh indicators
    const fiqhPatterns = [/fiqh/i, /ruling/i, /fatwa/i, /halal/i, /haram/i, /makruh/i, /mustahab/i, /hanafi/i, /maliki/i, /shafi/i, /hanbali/i, /permissible/i, /impermissible/i];
    const fiqhScore = fiqhPatterns.reduce((s, p) => s + (p.test(text) ? 1 : 0), 0);
    if (fiqhScore > 0) { scores['fiqh'] = fiqhScore; tags.push('fiqh'); }

    // Seerah indicators
    const seerahPatterns = [/seerah/i, /prophet muhammad/i, /biography/i, /mecca/i, /medina/i, /hijrah/i, /companions/i, /sahaba/i];
    const seerahScore = seerahPatterns.reduce((s, p) => s + (p.test(text) ? 1 : 0), 0);
    if (seerahScore > 0) { scores['seerah'] = seerahScore; tags.push('seerah'); }

    // Dawah indicators
    const dawahPatterns = [/dawah/i, /invite/i, /revert/i, /convert/i, /shahada/i, /islam is/i, /new muslim/i];
    const dawahScore = dawahPatterns.reduce((s, p) => s + (p.test(text) ? 1 : 0), 0);
    if (dawahScore > 0) { scores['dawah'] = dawahScore; tags.push('dawah'); }

    // Spirituality/worship indicators
    const worshipPatterns = [/dhikr/i, /dua/i, /salah/i, /prayer/i, /fasting/i, /ramadan/i, /taqwa/i, /iman/i, /ihsan/i];
    const worshipScore = worshipPatterns.reduce((s, p) => s + (p.test(text) ? 1 : 0), 0);
    if (worshipScore > 0) { scores['worship'] = worshipScore; tags.push('worship'); }

    // Lifestyle indicators
    const lifestylePatterns = [/muslim lifestyle/i, /modest/i, /hijab/i, /halal food/i, /islamic finance/i, /nikah/i, /marriage/i];
    const lifestyleScore = lifestylePatterns.reduce((s, p) => s + (p.test(text) ? 1 : 0), 0);
    if (lifestyleScore > 0) { scores['lifestyle'] = lifestyleScore; tags.push('lifestyle'); }

    // Determine primary category
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return { category: null, confidence: 0, tags: [] };

    const [category, score] = sorted[0];
    const maxPossible = 10; // rough max pattern matches
    const confidence = Math.min(score / maxPossible, 1);

    return { category, confidence: Math.round(confidence * 100) / 100, tags: [...new Set(tags)] };
  }

  // Finding #323: Detect hadith grade from known collections
  detectHadithGrade(content: string): { grade: string | null; collection: string | null } {
    if (!content) return { grade: null, collection: null };
    const text = content.toLowerCase();

    // Check for explicit grade mentions
    if (/sahih(?!\s+al)/i.test(text) && !/sahih bukhari|sahih muslim/i.test(text)) {
      return { grade: 'sahih', collection: null };
    }

    // Check for collection references which imply grade
    if (/sahih bukhari/i.test(text) || /bukhari/i.test(text)) return { grade: 'sahih', collection: 'Sahih al-Bukhari' };
    if (/sahih muslim/i.test(text)) return { grade: 'sahih', collection: 'Sahih Muslim' };
    if (/tirmidhi/i.test(text)) return { grade: 'hasan', collection: 'Jami at-Tirmidhi' };
    if (/abu dawud/i.test(text)) return { grade: 'hasan', collection: 'Sunan Abu Dawud' };
    if (/ibn majah/i.test(text)) return { grade: 'hasan', collection: 'Sunan Ibn Majah' };
    if (/nasai/i.test(text)) return { grade: 'sahih', collection: "Sunan an-Nasa'i" };
    if (/muwatta/i.test(text)) return { grade: 'sahih', collection: 'Muwatta Malik' };
    if (/da.?if/i.test(text) || /weak hadith/i.test(text)) return { grade: "da'if", collection: null };
    if (/mawdu/i.test(text) || /fabricated/i.test(text)) return { grade: 'mawdu', collection: null };

    return { grade: null, collection: null };
  }
}