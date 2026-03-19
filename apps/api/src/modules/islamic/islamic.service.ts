import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { UpdatePrayerNotificationDto } from './dto/prayer-notification.dto';
import { CreateQuranPlanDto, UpdateQuranPlanDto } from './dto/quran-plan.dto';
import { CreateCampaignDto, CreateDonationDto } from './dto/charity.dto';
import { CreateHajjProgressDto, UpdateHajjProgressDto } from './dto/hajj.dto';
import { ApplyScholarVerificationDto } from './dto/scholar-verification.dto';
import { UpdateContentFilterDto } from './dto/content-filter.dto';
import { SaveDhikrSessionDto, CreateDhikrChallengeDto } from './dto/dhikr.dto';
import * as hadiths from './data/hadiths.json';
import * as hajjGuideData from './data/hajj-guide.json';
import * as tafsirJson from './data/tafsir.json';

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
  constructor(private readonly prisma: PrismaService) {}

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
    // For simplicity, we'll compute approximate timings based on solar calculations.
    // This is a placeholder implementation; real implementation would use proper astronomy formulas.
    const methodObj = this.prayerMethods.find(m => m.id === method) || this.prayerMethods[0];

    // Mock timings (in reality, compute based on latitude, longitude, date, and method)
    const timings = {
      fajr: '05:30',
      sunrise: '06:45',
      dhuhr: '12:30',
      asr: '15:45',
      maghrib: '18:20',
      isha: '19:45',
    };

    return {
      date,
      timings,
      method: methodObj.name,
      location: { lat, lng },
    };
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

  getRamadanInfo(params: RamadanInfoRequest): RamadanInfoResponse {
    const year = params.year || new Date().getFullYear();
    // Simple approximation: Ramadan start = first day of lunar month 9 (approximated)
    // This is a placeholder; real calculation requires Hijri calendar conversion.
    const startDate = `${year}-03-10`; // dummy
    const endDate = `${year}-04-09`; // dummy
    const today = new Date();
    const ramadanStart = new Date(startDate);
    const ramadanEnd = new Date(endDate);
    let currentDay: number | undefined;
    if (today >= ramadanStart && today <= ramadanEnd) {
      currentDay = Math.floor((today.getTime() - ramadanStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }
    // Mock iftar/suhoor times based on location (simplified)
    const iftarTime = '18:45';
    const suhoorTime = '04:30';

    return {
      year,
      startDate,
      endDate,
      currentDay,
      iftarTime,
      suhoorTime,
      nextPrayer: 'Maghrib',
      nextPrayerTime: iftarTime,
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
}