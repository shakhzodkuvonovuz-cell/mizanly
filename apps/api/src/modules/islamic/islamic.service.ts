import { Injectable, Inject, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { PrismaService } from '../../config/prisma.service';
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

interface NameOfAllah {
  number: number;
  arabicName: string;
  transliteration: string;
  englishMeaning: string;
  explanation: string;
  quranRef?: string;
}

interface DuaEntry {
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
    } catch {
      // Redis unavailable — continue without cache
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
        } catch {
          // Redis write failed — non-critical
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
    } catch {
      // Redis write failed — non-critical
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

  getNearbyMosques(lat: number, lng: number, radiusKm = 10): Mosque[] {
    // Mock data for 8 mosques
    const mockMosques: Mosque[] = [
      {
        id: '1',
        name: 'Masjid al-Haram',
        address: 'Mecca, Saudi Arabia',
        lat: 21.4225,
        lng: 39.8262,
        facilities: ['Prayer Hall', 'Ablution', 'Library', 'Cafeteria'],
      },
      {
        id: '2',
        name: 'Masjid an-Nabawi',
        address: 'Medina, Saudi Arabia',
        lat: 24.4672,
        lng: 39.6111,
        facilities: ['Prayer Hall', 'Ablution', 'Library', 'Hospital'],
      },
      {
        id: '3',
        name: 'Al-Aqsa Mosque',
        address: 'Jerusalem, Palestine',
        lat: 31.7761,
        lng: 35.2358,
        facilities: ['Prayer Hall', 'Ablution', 'Historical Site'],
      },
      {
        id: '4',
        name: 'Sultan Ahmed Mosque',
        address: 'Istanbul, Turkey',
        lat: 41.0054,
        lng: 28.9768,
        facilities: ['Prayer Hall', 'Ablution', 'Tourist Guide'],
      },
      {
        id: '5',
        name: 'Sheikh Zayed Grand Mosque',
        address: 'Abu Dhabi, UAE',
        lat: 24.4129,
        lng: 54.4740,
        facilities: ['Prayer Hall', 'Ablution', 'Library', 'Cafeteria', 'Guided Tours'],
      },
      {
        id: '6',
        name: 'Islamic Center of Washington',
        address: 'Washington D.C., USA',
        lat: 38.9186,
        lng: -77.0600,
        facilities: ['Prayer Hall', 'Ablution', 'Library', 'Community Center'],
      },
      {
        id: '7',
        name: 'East London Mosque',
        address: 'London, UK',
        lat: 51.5187,
        lng: -0.0656,
        facilities: ['Prayer Hall', 'Ablution', 'School', 'Clinic'],
      },
      {
        id: '8',
        name: 'Sydney Islamic Centre',
        address: 'Sydney, Australia',
        lat: -33.8688,
        lng: 151.2093,
        facilities: ['Prayer Hall', 'Ablution', 'Sports Hall', 'Cafeteria'],
      },
    ];

    // Filter by distance (simplified)
    const filtered = mockMosques.map(mosque => ({
      ...mosque,
      distance: this.calculateDistance(lat, lng, mosque.lat, mosque.lng),
    })).filter(m => m.distance <= radiusKm * 1000); // convert km to meters

    // Sort by distance
    filtered.sort((a, b) => a.distance - b.distance);
    return filtered;
  }

  calculateZakat(params: ZakatCalculationRequest): ZakatCalculationResponse {
    if (params.cash < 0 || params.gold < 0 || params.silver < 0 || params.investments < 0 || params.debts < 0) {
      throw new BadRequestException('All values must be non-negative');
    }
    const goldPricePerGram = 68; // USD per gram
    const silverPricePerGram = 0.82; // USD per gram
    const goldValue = params.gold * goldPricePerGram;
    const silverValue = params.silver * silverPricePerGram;
    const totalAssets = params.cash + goldValue + silverValue + params.investments;
    const nisabGold = 85 * goldPricePerGram; // 85g of gold
    const nisabSilver = 595 * silverPricePerGram; // 595g of silver
    const nisab = Math.min(nisabGold, nisabSilver); // use the lower threshold
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
    return this.prisma.prayerNotificationSetting.upsert({
      where: { userId },
      update: dto,
      create: { userId, ...dto },
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
    return this.prisma.quranReadingPlan.update({
      where: { id: planId },
      data: dto,
    });
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
    if (dto.amount <= 0 || dto.amount > 1000000) {
      throw new BadRequestException('Donation amount must be between $0.01 and $1,000,000');
    }
    if (dto.campaignId) {
      const campaign = await this.prisma.charityCampaign.findUnique({ where: { id: dto.campaignId } });
      if (!campaign) throw new NotFoundException('Campaign not found');
    }
    const donation = await this.prisma.charityDonation.create({
      data: {
        userId,
        campaignId: dto.campaignId,
        recipientUserId: dto.recipientUserId,
        amount: dto.amount,
        currency: dto.currency || 'usd',
        status: 'completed',
      },
    });

    // Update campaign raised amount if applicable
    if (dto.campaignId) {
      await this.prisma.$executeRaw`UPDATE "charity_campaigns" SET "raisedAmount" = "raisedAmount" + ${dto.amount}, "donorCount" = "donorCount" + 1 WHERE id = ${dto.campaignId}`;
    }

    return donation;
  }

  async getMyDonations(userId: string, cursor?: string, limit = 20) {
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
      data: { userId, ...dto },
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
    return this.prisma.contentFilterSetting.upsert({
      where: { userId },
      update: dto,
      create: { userId, ...dto },
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
    return this.prisma.dhikrSession.create({
      data: {
        userId,
        phrase: dto.phrase,
        count: dto.count,
        target: dto.target || 33,
        completedAt: dto.count >= (dto.target || 33) ? new Date() : null,
      },
    });
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

    const participant = await this.prisma.dhikrChallengeParticipant.findUnique({
      where: { userId_challengeId: { userId, challengeId } },
    });
    if (!participant) throw new BadRequestException('Not a participant');

    await this.prisma.$executeRaw`UPDATE "dhikr_challenge_participants" SET contributed = contributed + ${count} WHERE "userId" = ${userId} AND "challengeId" = ${challengeId}`;
    await this.prisma.$executeRaw`UPDATE "dhikr_challenges" SET "currentTotal" = "currentTotal" + ${count} WHERE id = ${challengeId}`;

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
    const audioNumber = this.getAyahNumber(surah, ayah);
    return { url: `${reciter.audioBaseUrl}/${audioNumber}.mp3`, reciter: reciter.name };
  }

  private getAyahNumber(surah: number, ayah: number): number {
    // Cumulative ayah counts for each surah (simplified — surah 1 starts at 1)
    const surahOffsets = [0, 1, 8, 35, 92, 148, 207, 252, 296, 382, 435, 466, 495, 538, 548, 558, 578, 601, 611, 621, 636, 648, 651, 669, 693, 710, 720, 754, 779, 790, 820, 833, 856, 869, 890, 926, 953, 978, 1012, 1086, 1098, 1123, 1158, 1213, 1270, 1305, 1340, 1379, 1411, 1430, 1459, 1510, 1554, 1604, 1664, 1715, 1772, 1855, 1920, 1958, 1970, 1985, 1993, 2004, 2008, 2012, 2018, 2025, 2030, 2048, 2066, 2071, 2099, 2113, 2121, 2147, 2166, 2179, 2219, 2226, 2232, 2261, 2283, 2292, 2311, 2318, 2325, 2341, 2359, 2360, 2375, 2386, 2392, 2413, 2422, 2431, 2436, 2452, 2460, 2468, 2471, 2476, 2479, 2487, 2496, 2503, 2508, 2511, 2514, 2518, 2523, 2527, 2530, 2533];
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
    } catch {
      // Cache miss or Redis unavailable
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
      } catch {
        // Non-critical
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
    } catch {
      // Cache miss
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
      } catch {
        // Non-critical
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
    } catch {
      // Cache miss
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
      } catch {
        // Non-critical
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
    } catch {
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
    } catch {
      // Cache miss
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
      } catch {
        // Non-critical
      }

      return result;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Quran.com juz API failed: ${msg}`);
      throw new BadRequestException('Unable to fetch juz — please try again later');
    }
  }

  // ── Zakat Calculator ───────────────────────────────

  calculateZakat(assets: { type: string; value: number; currency?: string }[]) {
    const nisabGold = 85 * 60; // 85g gold × ~$60/g (approximate)
    const nisabSilver = 595 * 0.8; // 595g silver × ~$0.80/g (approximate)

    let totalValue = 0;
    const breakdown: { type: string; value: number; zakat: number }[] = [];

    for (const asset of assets) {
      const zakatAmount = asset.value * 0.025; // 2.5%
      breakdown.push({ type: asset.type, value: asset.value, zakat: zakatAmount });
      totalValue += asset.value;
    }

    const totalZakat = totalValue * 0.025;
    const meetsNisab = totalValue >= nisabSilver; // Use silver nisab (lower, more inclusive)

    return {
      totalValue,
      totalZakat: meetsNisab ? totalZakat : 0,
      meetsNisab,
      nisabGold,
      nisabSilver,
      breakdown,
    };
  }

  // ============================================================
  // DUA COLLECTION
  // ============================================================

  private get duas(): DuaEntry[] {
    return duasData as unknown as DuaEntry[];
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
    } catch {
      // Already removed
    }
    return { removed: true };
  }

  // ============================================================
  // FASTING TRACKER
  // ============================================================

  async logFast(userId: string, data: { date: string; isFasting: boolean; fastType?: string; reason?: string }) {
    const dateObj = new Date(data.date);
    return this.prisma.fastingLog.upsert({
      where: { userId_date: { userId, date: dateObj } },
      update: {
        isFasting: data.isFasting,
        fastType: data.fastType ?? 'ramadan',
        reason: data.reason,
      },
      create: {
        userId,
        date: dateObj,
        isFasting: data.isFasting,
        fastType: data.fastType ?? 'ramadan',
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
    });
  }

  async getFastingStats(userId: string) {
    const yearStart = new Date(new Date().getFullYear(), 0, 1);

    const logs = await this.prisma.fastingLog.findMany({
      where: { userId, date: { gte: yearStart } },
      orderBy: { date: 'asc' },
    });

    const totalFasts = logs.filter((l) => l.isFasting).length;
    const missedRamadan = logs.filter((l) => !l.isFasting && l.fastType === 'ramadan').length;

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
    return asmaUlHusnaData as unknown as NameOfAllah[];
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
    });

    // Build full 114 surah list with default status
    const progressMap = new Map(progress.map((p) => [p.surahNum, p]));
    const allSurahs = [];
    for (let i = 1; i <= 114; i++) {
      const existing = progressMap.get(i);
      allSurahs.push({
        surahNum: i,
        status: existing?.status ?? 'not_started',
        lastReviewedAt: existing?.lastReviewedAt ?? null,
      });
    }
    return allSurahs;
  }

  async updateHifzProgress(userId: string, surahNum: number, status: string) {
    if (surahNum < 1 || surahNum > 114) {
      throw new BadRequestException('Surah number must be 1-114');
    }
    const validStatuses = ['not_started', 'in_progress', 'memorized', 'needs_review'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(`Status must be one of: ${validStatuses.join(', ')}`);
    }

    return this.prisma.hifzProgress.upsert({
      where: { userId_surahNum: { userId, surahNum } },
      update: {
        status,
        lastReviewedAt: status === 'memorized' || status === 'needs_review' ? new Date() : undefined,
      },
      create: {
        userId,
        surahNum,
        status,
        lastReviewedAt: status === 'memorized' ? new Date() : null,
      },
    });
  }

  async getHifzStats(userId: string) {
    const progress = await this.prisma.hifzProgress.findMany({
      where: { userId },
    });

    const memorized = progress.filter((p) => p.status === 'memorized').length;
    const inProgress = progress.filter((p) => p.status === 'in_progress').length;
    const needsReview = progress.filter((p) => p.status === 'needs_review').length;

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
      arabic: hadith.arabic ? hadith.arabic.substring(0, 100) : '',
      translation: `Reflect on verse ${ayahIndex + 1} of the Quran today`,
    };

    // Get prayer times if location provided
    let prayerTimes: Record<string, string> | null = null;
    if (lat && lng) {
      try {
        const pt = await this.getPrayerTimes({ lat, lng });
        prayerTimes = pt.timings;
      } catch {
        // Non-critical, continue without prayer times
      }
    }

    // Get dhikr progress for today
    const todayDhikrSessions = await this.prisma.dhikrSession.findMany({
      where: {
        userId,
        createdAt: { gte: todayDate },
      },
    });
    const dhikrTotal = todayDhikrSessions.reduce((sum, s) => sum + s.count, 0);

    // Get daily task completions
    const completions = await this.prisma.dailyTaskCompletion.findMany({
      where: { userId, date: todayDate },
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
    const validTypes = ['dhikr', 'quran', 'reflection'];
    if (!validTypes.includes(taskType)) {
      throw new BadRequestException(`Invalid task type. Must be one of: ${validTypes.join(', ')}`);
    }

    const today = new Date();
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // Upsert to handle duplicate completion attempts
    const completion = await this.prisma.dailyTaskCompletion.upsert({
      where: {
        userId_date_taskType: { userId, date: todayDate, taskType },
      },
      create: { userId, date: todayDate, taskType },
      update: {},
    });

    // Check if all 3 tasks are now complete
    const allCompletions = await this.prisma.dailyTaskCompletion.findMany({
      where: { userId, date: todayDate },
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
    });

    return {
      tasks: [
        { type: 'dhikr', completed: completions.some((c) => c.taskType === 'dhikr') },
        { type: 'quran', completed: completions.some((c) => c.taskType === 'quran') },
        { type: 'reflection', completed: completions.some((c) => c.taskType === 'reflection') },
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
        status: { in: ['memorized', 'needs_review'] },
        OR: [
          { lastReviewedAt: null },
          { lastReviewedAt: { lt: sevenDaysAgo } },
        ],
      },
      orderBy: { lastReviewedAt: 'asc' },
      take: 10,
    });
  }
}