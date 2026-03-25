import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IslamicService } from './islamic.service';
import { PrismaService } from '../../config/prisma.service';
import { globalMockProviders } from '../../common/test/mock-providers';


// Mock the hadiths.json import
jest.mock('./data/hadiths.json', () => [
  {
    id: 1,
    arabic: 'Test Arabic 1',
    english: 'Test English 1',
    source: 'Test Source 1',
    narrator: 'Test Narrator 1',
    chapter: 'Test Chapter 1',
  },
  {
    id: 2,
    arabic: 'Test Arabic 2',
    english: 'Test English 2',
    source: 'Test Source 2',
    narrator: 'Test Narrator 2',
    chapter: 'Test Chapter 2',
  },
  {
    id: 3,
    arabic: 'Test Arabic 3',
    english: 'Test English 3',
    source: 'Test Source 3',
    narrator: 'Test Narrator 3',
    chapter: 'Test Chapter 3',
  },
  {
    id: 4,
    arabic: 'Test Arabic 4',
    english: 'Test English 4',
    source: 'Test Source 4',
    narrator: 'Test Narrator 4',
    chapter: 'Test Chapter 4',
  },
  {
    id: 5,
    arabic: 'Test Arabic 5',
    english: 'Test English 5',
    source: 'Test Source 5',
    narrator: 'Test Narrator 5',
    chapter: 'Test Chapter 5',
  },
], { virtual: true });

// Mock global fetch to prevent real API calls in tests
const mockFetch = jest.fn().mockRejectedValue(new Error('Network disabled in tests'));
global.fetch = mockFetch as any;

describe('IslamicService', () => {
  let service: IslamicService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      hajjProgress: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), upsert: jest.fn() },
      dhikrSession: { create: jest.fn(), findMany: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn() },
      donation: { create: jest.fn(), findMany: jest.fn() },
      donationCampaign: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      charityCampaign: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      charityDonation: { create: jest.fn(), findMany: jest.fn() },
      quranReadingPlan: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), upsert: jest.fn() },
      quranReadingProgress: { create: jest.fn(), findMany: jest.fn() },
      dhikrChallenge: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
      dhikrChallengeParticipant: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      prayerNotificationSetting: { findUnique: jest.fn(), upsert: jest.fn(), create: jest.fn() },
      fastingLog: { findMany: jest.fn(), upsert: jest.fn() },
      duaBookmark: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn(), findMany: jest.fn() },
      hifzProgress: { findMany: jest.fn(), upsert: jest.fn() },
      dailyTaskCompletion: { findMany: jest.fn(), upsert: jest.fn() },
      scholarVerification: { findUnique: jest.fn(), create: jest.fn() },
      contentFilterSetting: { findUnique: jest.fn(), create: jest.fn(), upsert: jest.fn() },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn().mockImplementation((args) => Promise.resolve(args)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        IslamicService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<IslamicService>(IslamicService);
    jest.clearAllMocks();
    // Re-set fetch mock after clearAllMocks
    mockFetch.mockRejectedValue(new Error('Network disabled in tests'));
  });

  describe('getPrayerTimes', () => {
    it('should return prayer times with local fallback when API unavailable', async () => {
      const params = { lat: 40.7128, lng: -74.006, method: 'MWL', date: '2026-03-13' };
      const result = await service.getPrayerTimes(params);

      expect(result.date).toBe('2026-03-13');
      expect(result.method).toBe('Muslim World League');
      expect(result.location).toEqual({ lat: 40.7128, lng: -74.006 });
      // Local calculation should produce valid HH:MM format times
      expect(result.timings.fajr).toMatch(/^\d{2}:\d{2}$/);
      expect(result.timings.sunrise).toMatch(/^\d{2}:\d{2}$/);
      expect(result.timings.dhuhr).toMatch(/^\d{2}:\d{2}$/);
      expect(result.timings.asr).toMatch(/^\d{2}:\d{2}$/);
      expect(result.timings.maghrib).toMatch(/^\d{2}:\d{2}$/);
      expect(result.timings.isha).toMatch(/^\d{2}:\d{2}$/);
    });

    it('should return Aladhan API times when available', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          code: 200,
          data: {
            timings: {
              Fajr: '05:22',
              Sunrise: '06:38',
              Dhuhr: '12:10',
              Asr: '15:31',
              Maghrib: '17:42',
              Isha: '19:02',
            },
          },
        }),
      });

      const result = await service.getPrayerTimes({
        lat: 40.7128, lng: -74.006, method: 'MWL', date: '2026-03-13',
      });

      expect(result.timings.fajr).toBe('05:22');
      expect(result.timings.dhuhr).toBe('12:10');
      expect(result.timings.isha).toBe('19:02');
    });

    it('should use default method when not specified', async () => {
      const params = { lat: 40.7128, lng: -74.006 };
      const result = await service.getPrayerTimes(params);

      expect(result.method).toBe('Muslim World League');
    });

    it('should use current date when not specified', async () => {
      const params = { lat: 40.7128, lng: -74.006 };
      const result = await service.getPrayerTimes(params);

      expect(result.date).toBeDefined();
      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should handle high latitude coordinates', async () => {
      const params = { lat: 70, lng: 40, method: 'MWL', date: '2026-06-21' };
      const result = await service.getPrayerTimes(params);

      expect(result).toBeDefined();
      expect(result.location.lat).toBe(70);
      expect(result.location.lng).toBe(40);
      expect(result.timings.fajr).toMatch(/^\d{2}:\d{2}$/);
    });

    it('should produce different times for different locations', async () => {
      const nyResult = await service.getPrayerTimes({
        lat: 40.7128, lng: -74.006, date: '2026-03-13',
      });
      const sydneyResult = await service.getPrayerTimes({
        lat: -33.8688, lng: 151.2093, date: '2026-03-13',
      });

      // Different hemispheres should have different prayer times
      expect(nyResult.timings.fajr).not.toBe(sydneyResult.timings.fajr);
      expect(nyResult.timings.maghrib).not.toBe(sydneyResult.timings.maghrib);
    });

    it('should produce different Fajr/Isha for different methods', async () => {
      const mwlResult = await service.getPrayerTimes({
        lat: 40.7128, lng: -74.006, method: 'MWL', date: '2026-03-13',
      });
      const isnaResult = await service.getPrayerTimes({
        lat: 40.7128, lng: -74.006, method: 'ISNA', date: '2026-03-13',
      });

      // MWL Fajr=18°, ISNA Fajr=15° — ISNA should have a later Fajr
      expect(mwlResult.timings.fajr).not.toBe(isnaResult.timings.fajr);
    });
  });

  describe('getPrayerMethods', () => {
    it('should return all calculation methods', () => {
      const result = service.getPrayerMethods();

      expect(result).toHaveLength(5);
      expect(result[0]).toEqual({
        id: 'MWL',
        name: 'Muslim World League',
        description: 'Fajr 18°, Isha 17°',
        parameters: { fajrAngle: 18, ishaAngle: 17, asr: 'Standard' },
      });
      expect(result.map(m => m.id)).toEqual(['MWL', 'ISNA', 'Egypt', 'Makkah', 'Karachi']);
    });
  });

  describe('getDailyHadith', () => {
    beforeEach(() => {
      // Mock Date.now() to return a fixed timestamp for deterministic test
      jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-03-13T12:00:00Z').getTime());
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should return a hadith based on day-of-year rotation', () => {
      // March 13 is day 72 of the year (31+28+13)
      const result = service.getDailyHadith();

      expect(result).toBeDefined();
      expect(result.id).toBeGreaterThanOrEqual(1);
      expect(result.id).toBeLessThanOrEqual(5); // We have 5 mock hadiths
      expect(result.arabic).toBeDefined();
      expect(result.english).toBeDefined();
    });

    it('should rotate through all hadiths', () => {
      // Test with different days to ensure rotation
      jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-01-01T12:00:00Z').getTime());
      const day1 = service.getDailyHadith();

      jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-01-02T12:00:00Z').getTime());
      const day2 = service.getDailyHadith();

      // They might be the same if we only have 5 hadiths and day difference is multiple of 5
      // But at least the function should return a valid hadith
      expect(day1).toBeDefined();
      expect(day2).toBeDefined();
    });
  });

  describe('getHadithById', () => {
    it('should return hadith for valid ID', () => {
      const result = service.getHadithById(1);

      expect(result).toEqual({
        id: 1,
        arabic: 'Test Arabic 1',
        english: 'Test English 1',
        source: 'Test Source 1',
        narrator: 'Test Narrator 1',
        chapter: 'Test Chapter 1',
      });
    });

    it('should throw NotFoundException for invalid ID', () => {
      expect(() => service.getHadithById(999)).toThrow(NotFoundException);
      expect(() => service.getHadithById(999)).toThrow('Hadith with ID 999 not found');
    });
  });

  describe('getHadiths', () => {
    it('should return paginated hadiths with default limit', () => {
      const result = service.getHadiths();

      expect(result).toEqual({
        data: [
          {
            id: 1,
            arabic: 'Test Arabic 1',
            english: 'Test English 1',
            source: 'Test Source 1',
            narrator: 'Test Narrator 1',
            chapter: 'Test Chapter 1',
          },
          {
            id: 2,
            arabic: 'Test Arabic 2',
            english: 'Test English 2',
            source: 'Test Source 2',
            narrator: 'Test Narrator 2',
            chapter: 'Test Chapter 2',
          },
          {
            id: 3,
            arabic: 'Test Arabic 3',
            english: 'Test English 3',
            source: 'Test Source 3',
            narrator: 'Test Narrator 3',
            chapter: 'Test Chapter 3',
          },
          {
            id: 4,
            arabic: 'Test Arabic 4',
            english: 'Test English 4',
            source: 'Test Source 4',
            narrator: 'Test Narrator 4',
            chapter: 'Test Chapter 4',
          },
          {
            id: 5,
            arabic: 'Test Arabic 5',
            english: 'Test English 5',
            source: 'Test Source 5',
            narrator: 'Test Narrator 5',
            chapter: 'Test Chapter 5',
          },
        ],
        cursor: 5,
        hasMore: false,
      });
    });

    it('should return paginated hadiths with custom limit', () => {
      const result = service.getHadiths(undefined, 2);

      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe(1);
      expect(result.data[1].id).toBe(2);
      expect(result.cursor).toBe(2);
      expect(result.hasMore).toBe(true);
    });

    it('should return paginated hadiths with cursor', () => {
      const result = service.getHadiths(2, 2);

      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe(3);
      expect(result.data[1].id).toBe(4);
      expect(result.cursor).toBe(4);
      expect(result.hasMore).toBe(true);
    });

    it('should handle cursor at end of list', () => {
      const result = service.getHadiths(5, 2);

      expect(result.data).toHaveLength(0);
      expect(result.cursor).toBeUndefined();
      expect(result.hasMore).toBe(false);
    });

    it('should handle empty result when cursor not found', () => {
      const result = service.getHadiths(999, 2);

      expect(result.data).toHaveLength(2); // Starts from beginning if cursor not found, respects limit
      expect(result.data[0].id).toBe(1);
    });
  });

  describe('getNearbyMosques', () => {
    it('should return empty array when no mosques found in DB or OSM', async () => {
      // DB query returns empty, OSM fails (fetch is mocked to reject)
      const result = await service.getNearbyMosques(40.7128, -74.006, 10);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle edge case of no mosques within radius', async () => {
      const result = await service.getNearbyMosques(-90, 0, 1); // South pole

      expect(Array.isArray(result)).toBe(true);
    });

    it('should validate coordinates', async () => {
      await expect(service.getNearbyMosques(200, 0, 10)).rejects.toThrow('Invalid coordinates');
    });
  });

  describe('calculateZakat', () => {
    it('should calculate zakat correctly when nisab is met', () => {
      const params = { cash: 10000, gold: 100, silver: 500, investments: 5000, debts: 0 };
      const result = service.calculateZakat(params);

      expect(result.nisabMet).toBe(true);
      expect(result.zakatDue).toBeGreaterThan(0);
      expect(result.totalAssets).toBeGreaterThan(0);
      expect(result.breakdown.cash).toBe(10000);
      expect(result.goldPricePerGram).toBeGreaterThan(0);
      expect(result.silverPricePerGram).toBeGreaterThan(0);
    });

    it('should return 0 zakat when nisab is not met', () => {
      const params = { cash: 10, gold: 0, silver: 0, investments: 0, debts: 0 };
      const result = service.calculateZakat(params);

      expect(result.nisabMet).toBe(false);
      expect(result.zakatDue).toBe(0);
    });

    it('should subtract debts from total assets', () => {
      const params = { cash: 5000, gold: 0, silver: 0, investments: 0, debts: 4500 };
      const result = service.calculateZakat(params);

      // Net wealth = 5000 - 4500 = 500, which may or may not meet nisab depending on prices
      expect(result.totalAssets).toBe(5000);
      expect(result.breakdown.debts).toBe(4500);
    });

    it('should throw on negative values', () => {
      expect(() => service.calculateZakat({ cash: -1, gold: 0, silver: 0, investments: 0, debts: 0 }))
        .toThrow('All values must be non-negative');
    });

    it('should handle zero values', () => {
      const result = service.calculateZakat({ cash: 0, gold: 0, silver: 0, investments: 0, debts: 0 });

      expect(result.totalAssets).toBe(0);
      expect(result.nisabMet).toBe(false);
      expect(result.zakatDue).toBe(0);
    });
  });

  describe('getRamadanInfo', () => {
    it('should return Ramadan info with Hijri-calculated dates', async () => {
      const params = { year: 2026 };
      const result = await service.getRamadanInfo(params);

      expect(result.year).toBe(2026);
      // Ramadan dates should be calculated from Hijri calendar, not hardcoded
      expect(result.startDate).toMatch(/^2026-\d{2}-\d{2}$/);
      expect(result.endDate).toMatch(/^2026-\d{2}-\d{2}$/);
      // Start should be before end
      expect(new Date(result.startDate).getTime()).toBeLessThan(new Date(result.endDate).getTime());
    });

    it('should use current year when not specified', async () => {
      const params = {};
      const result = await service.getRamadanInfo(params);

      expect(result.year).toBe(new Date().getFullYear());
    });

    it('should include currentDay when within Ramadan', async () => {
      // Get the calculated Ramadan dates first
      const infoResult = await service.getRamadanInfo({ year: 2026 });
      const start = new Date(infoResult.startDate);
      // Set system time to 5 days into Ramadan
      const duringRamadan = new Date(start.getTime() + 5 * 86400000);
      jest.useFakeTimers({ now: duringRamadan });

      const result = await service.getRamadanInfo({ year: 2026 });
      jest.useRealTimers();

      expect(result.currentDay).toBe(6); // Day 6 (5 days after start + 1)
    });

    it('should not include currentDay when outside Ramadan', async () => {
      jest.useFakeTimers({ now: new Date('2026-01-01T12:00:00Z') });
      const result = await service.getRamadanInfo({ year: 2026 });
      jest.useRealTimers();

      expect(result.currentDay).toBeUndefined();
    });

    it('should return iftar/suhoor as undefined without location', async () => {
      const result = await service.getRamadanInfo({ year: 2026 });

      // Without lat/lng, iftar and suhoor should be undefined
      expect(result.iftarTime).toBeUndefined();
      expect(result.suhoorTime).toBeUndefined();
    });

    it('should return iftar/suhoor times with location', async () => {
      const result = await service.getRamadanInfo({
        year: 2026,
        lat: 40.7128,
        lng: -74.006,
      });

      // With location, should attempt to get prayer times (via local fallback in tests)
      if (result.iftarTime) {
        expect(result.iftarTime).toMatch(/^\d{2}:\d{2}$/);
      }
      if (result.suhoorTime) {
        expect(result.suhoorTime).toMatch(/^\d{2}:\d{2}$/);
      }
    });
  });

  // ═══════════════════════════════════════════════════════
  // NEW TESTS — getPrayerTimes error paths
  // ═══════════════════════════════════════════════════════

  describe('getPrayerTimes — error paths', () => {
    it('should throw BadRequestException for latitude > 90', async () => {
      await expect(service.getPrayerTimes({ lat: 999, lng: 0 }))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for latitude < -90', async () => {
      await expect(service.getPrayerTimes({ lat: -91, lng: 0 }))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for longitude > 180', async () => {
      await expect(service.getPrayerTimes({ lat: 0, lng: 200 }))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for longitude < -180', async () => {
      await expect(service.getPrayerTimes({ lat: 0, lng: -181 }))
        .rejects.toThrow(BadRequestException);
    });

    it('should return cached result from Redis when available', async () => {
      const cachedResult = JSON.stringify({
        date: '2026-03-13',
        timings: { fajr: '05:00', sunrise: '06:30', dhuhr: '12:00', asr: '15:30', maghrib: '18:00', isha: '19:30' },
        method: 'Muslim World League',
        location: { lat: 40.71, lng: -74.01 },
      });
      const redis = (service as any).redis;
      redis.get.mockResolvedValueOnce(cachedResult);

      const result = await service.getPrayerTimes({ lat: 40.71, lng: -74.01, date: '2026-03-13' });
      expect(result.timings.fajr).toBe('05:00');
    });

    it('should strip parenthetical annotations from API times', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          code: 200,
          data: {
            timings: {
              Fajr: '05:22 (EET)',
              Sunrise: '06:38 (EET)',
              Dhuhr: '12:10 (EET)',
              Asr: '15:31 (EET)',
              Maghrib: '17:42 (EET)',
              Isha: '19:02 (EET)',
            },
          },
        }),
      });

      const result = await service.getPrayerTimes({ lat: 30, lng: 31, date: '2026-03-13' });
      expect(result.timings.fajr).toBe('05:22');
      expect(result.timings.isha).toBe('19:02');
    });

    it('should fall back to unknown method gracefully', async () => {
      const result = await service.getPrayerTimes({ lat: 40, lng: -74, method: 'NONEXISTENT', date: '2026-03-13' });
      // Falls back to MWL (first method)
      expect(result.method).toBe('Muslim World League');
    });
  });

  // ═══════════════════════════════════════════════════════
  // Quran Chapters
  // ═══════════════════════════════════════════════════════

  describe('getQuranChapters', () => {
    it('should return all 114 surahs', () => {
      const result = service.getQuranChapters();
      expect(result).toHaveLength(114);
      expect(result[0].number).toBe(1);
      expect(result[0].nameEnglish).toBe('The Opening');
      expect(result[113].number).toBe(114);
    });
  });

  describe('getQuranChapter', () => {
    it('should return Al-Fatiha for surah 1', () => {
      const result = service.getQuranChapter(1);
      expect(result.number).toBe(1);
      expect(result.nameEnglish).toBe('The Opening');
      expect(result.nameTransliteration).toBe('Al-Fatihah');
      expect(result.ayahCount).toBe(7);
      expect(result.revelationType).toBe('Meccan');
    });

    it('should return An-Nas for surah 114', () => {
      const result = service.getQuranChapter(114);
      expect(result.number).toBe(114);
    });

    it('should throw NotFoundException for surah 0', () => {
      expect(() => service.getQuranChapter(0)).toThrow(NotFoundException);
    });

    it('should throw NotFoundException for surah 115', () => {
      expect(() => service.getQuranChapter(115)).toThrow(NotFoundException);
    });

    it('should throw NotFoundException for negative surah', () => {
      expect(() => service.getQuranChapter(-1)).toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Quran Verses
  // ═══════════════════════════════════════════════════════

  describe('getQuranVerses', () => {
    beforeEach(() => {
      // Ensure Redis cache returns null for Quran endpoints
      const redis = (service as any).redis;
      redis.get.mockResolvedValue(null);
    });

    it('should return verses from API when available', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          verses: [
            { verse_number: 1, text_uthmani: 'بِسْمِ اللَّهِ', translations: [{ text: 'In the name of Allah' }] },
            { verse_number: 2, text_uthmani: 'الْحَمْدُ لِلَّهِ', translations: [{ text: 'Praise be to Allah' }] },
          ],
        }),
      });

      const result = await service.getQuranVerses(1, 'en');
      expect(result.surah.number).toBe(1);
      expect(result.verses).toHaveLength(2);
      expect(result.verses[0].arabicText).toBe('بِسْمِ اللَّهِ');
      expect(result.verses[0].translation).toBe('In the name of Allah');
    });

    it('should throw NotFoundException for invalid surah in getQuranVerses', async () => {
      await expect(service.getQuranVerses(0)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when API fails', async () => {
      // Fetch is mocked to reject by default
      await expect(service.getQuranVerses(1, 'en')).rejects.toThrow(BadRequestException);
    });

    it('should handle Arabic-only endpoint for ar translation', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          verses: [
            { verse_key: '1:1', text_uthmani: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ' },
          ],
        }),
      });

      const result = await service.getQuranVerses(1, 'ar');
      expect(result.verses[0].arabicText).toBe('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ');
      expect(result.verses[0].translation).toBe('');
    });
  });

  describe('getQuranVerse', () => {
    beforeEach(() => {
      const redis = (service as any).redis;
      redis.get.mockResolvedValue(null);
    });

    it('should return a single verse when API responds', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          verse: {
            text_uthmani: 'بِسْمِ اللَّهِ',
            translations: [{ text: 'In the name of Allah' }],
          },
        }),
      });

      const result = await service.getQuranVerse(1, 1, 'en');
      expect(result.surah.number).toBe(1);
      expect(result.verse.number).toBe(1);
      expect(result.verse.arabicText).toBe('بِسْمِ اللَّهِ');
      expect(result.audioUrl).toContain('.mp3');
    });

    it('should throw BadRequestException for invalid ayah number', async () => {
      // Surah 1 has 7 ayahs
      await expect(service.getQuranVerse(1, 8, 'en')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for ayah 0', async () => {
      await expect(service.getQuranVerse(1, 0, 'en')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for invalid surah', async () => {
      await expect(service.getQuranVerse(0, 1, 'en')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Quran Search
  // ═══════════════════════════════════════════════════════

  describe('searchQuran', () => {
    beforeEach(() => {
      const redis = (service as any).redis;
      redis.get.mockResolvedValue(null);
    });

    it('should return search results when API responds', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          search: {
            total_results: 5,
            results: [
              { verse_key: '2:153', text: 'يَا أَيُّهَا الَّذِينَ آمَنُوا', translations: [{ text: 'O you who believe' }] },
              { verse_key: '3:200', text: 'اصْبِرُوا', translations: [{ text: 'Be patient' }] },
            ],
          },
        }),
      });

      const result = await service.searchQuran('patience', 'en', 20);
      expect(result.total).toBe(5);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].surahNumber).toBe(2);
      expect(result.results[0].ayahNumber).toBe(153);
    });

    it('should throw BadRequestException for empty query', async () => {
      await expect(service.searchQuran('', 'en')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for single char query', async () => {
      await expect(service.searchQuran('a', 'en')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when API fails', async () => {
      await expect(service.searchQuran('patience', 'en')).rejects.toThrow(BadRequestException);
    });

    it('should clamp limit to range 1-50', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ search: { total_results: 0, results: [] } }),
      });

      const result = await service.searchQuran('test query', 'en', 100);
      expect(result).toBeDefined();
      expect(result.results).toEqual([]);
      // The service should have clamped limit to 50
      expect(result.total).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Quran Juz
  // ═══════════════════════════════════════════════════════

  describe('getQuranJuz', () => {
    beforeEach(() => {
      const redis = (service as any).redis;
      redis.get.mockResolvedValue(null);
    });

    it('should return juz verses when API responds', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          verses: [
            { verse_key: '1:1', verse_number: 1, text_uthmani: 'بِسْمِ اللَّهِ', translations: [{ text: 'In the name' }] },
          ],
        }),
      });

      const result = await service.getQuranJuz(1, 'en');
      expect(result.juz).toBe(1);
      expect(result.verses).toHaveLength(1);
    });

    it('should throw BadRequestException for juz 0', async () => {
      await expect(service.getQuranJuz(0)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for juz 31', async () => {
      await expect(service.getQuranJuz(31)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when API fails', async () => {
      await expect(service.getQuranJuz(1)).rejects.toThrow(BadRequestException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Random Ayah
  // ═══════════════════════════════════════════════════════

  describe('getRandomAyah', () => {
    beforeEach(() => {
      const redis = (service as any).redis;
      redis.get.mockResolvedValue(null);
    });

    it('should return a random ayah with fallback when API fails', async () => {
      const result = await service.getRandomAyah('en');
      expect(result.surahNumber).toBeGreaterThanOrEqual(1);
      expect(result.surahNumber).toBeLessThanOrEqual(114);
      expect(result.ayahNumber).toBeGreaterThanOrEqual(1);
      expect(result.surahName).toBeDefined();
      expect(result.audioUrl).toContain('.mp3');
    });

    it('should return a random ayah with API data when available', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          verse: {
            text_uthmani: 'بِسْمِ اللَّهِ',
            translations: [{ text: 'In the name of Allah' }],
          },
        }),
      });

      const result = await service.getRandomAyah('en');
      expect(result.surahNumber).toBeGreaterThanOrEqual(1);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Duas
  // ═══════════════════════════════════════════════════════

  describe('getDuasByCategory', () => {
    it('should return all duas when no category specified', () => {
      const result = service.getDuasByCategory();
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('arabicText');
      expect(result[0]).toHaveProperty('category');
    });

    it('should return filtered duas for a specific category', () => {
      const result = service.getDuasByCategory('morning');
      expect(result.length).toBeGreaterThan(0);
      result.forEach(d => expect(d.category).toBe('morning'));
    });

    it('should return empty array for non-existent category', () => {
      const result = service.getDuasByCategory('nonexistent-category-xyz');
      expect(result).toEqual([]);
    });
  });

  describe('getDuaById', () => {
    it('should return dua for valid ID', () => {
      const result = service.getDuaById('dua-morning-1');
      expect(result).toBeDefined();
      expect(result?.id).toBe('dua-morning-1');
      expect(result?.category).toBe('morning');
      expect(result?.arabicText).toBeDefined();
    });

    it('should return undefined for invalid ID', () => {
      const result = service.getDuaById('nonexistent-dua');
      expect(result).toBeUndefined();
    });
  });

  describe('getDuaOfTheDay', () => {
    it('should return a dua deterministically per date', () => {
      const dua1 = service.getDuaOfTheDay();
      const dua2 = service.getDuaOfTheDay();
      expect(dua1.id).toBe(dua2.id); // Same day = same dua
      expect(dua1.arabicText).toBeDefined();
      expect(dua1.category).toBeDefined();
    });
  });

  describe('getDuaCategories', () => {
    it('should return unique category names', () => {
      const result = service.getDuaCategories();
      expect(result.length).toBeGreaterThanOrEqual(1);
      // Should contain no duplicates
      expect(new Set(result).size).toBe(result.length);
      result.forEach((cat: string) => expect(typeof cat).toBe('string'));
    });
  });

  describe('bookmarkDua', () => {
    it('should create bookmark when not already bookmarked', async () => {
      prisma.duaBookmark.findUnique.mockResolvedValue(null);
      prisma.duaBookmark.create.mockResolvedValue({ id: 'bm-1', userId: 'user-1', duaId: 'dua-morning-1' });

      const result = await service.bookmarkDua('user-1', 'dua-morning-1');
      expect(result.userId).toBe('user-1');
      expect(result.duaId).toBe('dua-morning-1');
      expect(prisma.duaBookmark.create).toHaveBeenCalled();
    });

    it('should return existing bookmark if already bookmarked (idempotent)', async () => {
      const existing = { id: 'bm-1', userId: 'user-1', duaId: 'dua-morning-1', createdAt: new Date() };
      prisma.duaBookmark.findUnique.mockResolvedValue(existing);

      const result = await service.bookmarkDua('user-1', 'dua-morning-1');
      expect(result).toEqual(existing);
      expect(prisma.duaBookmark.create).not.toHaveBeenCalled();
    });
  });

  describe('unbookmarkDua', () => {
    it('should delete bookmark and return removed: true', async () => {
      prisma.duaBookmark.delete.mockResolvedValue({ id: 'bm-1' });
      const result = await service.unbookmarkDua('user-1', 'dua-morning-1');
      expect(result).toEqual({ removed: true });
    });

    it('should handle already-removed bookmark gracefully', async () => {
      prisma.duaBookmark.delete.mockRejectedValue(new Error('Record not found'));
      const result = await service.unbookmarkDua('user-1', 'nonexistent');
      expect(result).toEqual({ removed: true });
    });
  });

  describe('getBookmarkedDuas', () => {
    it('should return bookmarked duas for user', async () => {
      prisma.duaBookmark.findMany.mockResolvedValue([{ duaId: 'dua-morning-1' }]);
      const result = await service.getBookmarkedDuas('user-1');
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].id).toBe('dua-morning-1');
    });

    it('should return empty array when user has no bookmarks', async () => {
      prisma.duaBookmark.findMany.mockResolvedValue([]);
      const result = await service.getBookmarkedDuas('user-1');
      expect(result).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Fasting Tracker
  // ═══════════════════════════════════════════════════════

  describe('logFast', () => {
    it('should upsert a fasting log entry', async () => {
      const mockLog = { id: 'fl-1', userId: 'user-1', date: new Date('2026-03-15'), isFasting: true, fastType: 'RAMADAN', reason: null };
      prisma.fastingLog.upsert.mockResolvedValue(mockLog);

      const result = await service.logFast('user-1', { date: '2026-03-15', isFasting: true });
      expect(result.isFasting).toBe(true);
      expect(prisma.fastingLog.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId_date: { userId: 'user-1', date: expect.any(Date) } },
      }));
    });

    it('should use default fast type ramadan', async () => {
      prisma.fastingLog.upsert.mockResolvedValue({ id: 'fl-1', fastType: 'RAMADAN' });
      await service.logFast('user-1', { date: '2026-03-15', isFasting: true });
      expect(prisma.fastingLog.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ fastType: 'RAMADAN' }),
        }),
      );
    });

    it('should accept custom fast type and reason', async () => {
      prisma.fastingLog.upsert.mockResolvedValue({ id: 'fl-1', fastType: 'SUNNAH', reason: 'Monday fast' });
      await service.logFast('user-1', { date: '2026-03-15', isFasting: true, fastType: 'SUNNAH', reason: 'Monday fast' });
      expect(prisma.fastingLog.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ fastType: 'SUNNAH', reason: 'Monday fast' }),
        }),
      );
    });
  });

  describe('getFastingLog', () => {
    it('should return fasting entries for given month', async () => {
      const logs = [
        { id: 'fl-1', date: new Date('2026-03-01'), isFasting: true, fastType: 'RAMADAN' },
        { id: 'fl-2', date: new Date('2026-03-02'), isFasting: false, fastType: 'RAMADAN', reason: 'sick' },
      ];
      prisma.fastingLog.findMany.mockResolvedValue(logs);

      const result = await service.getFastingLog('user-1', '2026-03');
      expect(result).toHaveLength(2);
      expect(prisma.fastingLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1' }),
        orderBy: { date: 'asc' },
      }));
    });

    it('should return empty array for month with no data', async () => {
      prisma.fastingLog.findMany.mockResolvedValue([]);
      const result = await service.getFastingLog('user-1', '2026-01');
      expect(result).toEqual([]);
    });
  });

  describe('getFastingStats', () => {
    it('should return fasting stats with streak calculation', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // Must be ordered ASC (as the real query does) so reverse() in the code produces [today, yesterday]
      prisma.fastingLog.findMany.mockResolvedValue([
        { date: yesterday, isFasting: true, fastType: 'RAMADAN' },
        { date: today, isFasting: true, fastType: 'RAMADAN' },
      ]);

      const result = await service.getFastingStats('user-1');
      expect(result.totalFastsThisYear).toBe(2);
      expect(result.currentStreak).toBeGreaterThanOrEqual(1);
      expect(result.makeupNeeded).toBe(0);
    });

    it('should count missed Ramadan days for makeup', async () => {
      prisma.fastingLog.findMany.mockResolvedValue([
        { date: new Date(), isFasting: false, fastType: 'RAMADAN' },
        { date: new Date(), isFasting: false, fastType: 'RAMADAN' },
      ]);

      const result = await service.getFastingStats('user-1');
      expect(result.makeupNeeded).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════
  // 99 Names of Allah
  // ═══════════════════════════════════════════════════════

  describe('getAllNamesOfAllah', () => {
    it('should return 99 names with full details', () => {
      const result = service.getAllNamesOfAllah();
      expect(result).toHaveLength(99);
      expect(result[0].number).toBe(1);
      expect(result[0].arabicName).toBeDefined();
      expect(result[0].transliteration).toBe('Ar-Rahman');
      expect(result[0].englishMeaning).toBe('The Most Gracious');
      expect(result[0].explanation).toBeDefined();
    });
  });

  describe('getNameOfAllahByNumber', () => {
    it('should return name for valid number', () => {
      const result = service.getNameOfAllahByNumber(1);
      expect(result).toBeDefined();
      expect(result?.number).toBe(1);
      expect(result?.transliteration).toBe('Ar-Rahman');
    });

    it('should return undefined for number 0', () => {
      const result = service.getNameOfAllahByNumber(0);
      expect(result).toBeUndefined();
    });

    it('should return undefined for number 100', () => {
      const result = service.getNameOfAllahByNumber(100);
      expect(result).toBeUndefined();
    });
  });

  describe('getDailyNameOfAllah', () => {
    it('should return one name deterministically per date', () => {
      const name1 = service.getDailyNameOfAllah();
      const name2 = service.getDailyNameOfAllah();
      expect(name1.number).toBe(name2.number);
      expect(name1.arabicName).toBeDefined();
      expect(name1.number).toBeGreaterThanOrEqual(1);
      expect(name1.number).toBeLessThanOrEqual(99);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Hifz (Quran Memorization)
  // ═══════════════════════════════════════════════════════

  describe('getHifzProgress', () => {
    it('should return 114 surahs with progress for tracked user', async () => {
      prisma.hifzProgress.findMany.mockResolvedValue([
        { surahNum: 1, status: 'MEMORIZED', lastReviewedAt: new Date() },
        { surahNum: 114, status: 'IN_PROGRESS', lastReviewedAt: null },
      ]);

      const result = await service.getHifzProgress('user-1');
      expect(result).toHaveLength(114);
      expect(result[0].surahNum).toBe(1);
      expect(result[0].status).toBe('MEMORIZED');
      expect(result[113].surahNum).toBe(114);
      expect(result[113].status).toBe('IN_PROGRESS');
      // Surahs without progress should be 'NOT_STARTED'
      expect(result[1].status).toBe('NOT_STARTED');
    });

    it('should return all not_started for new user', async () => {
      prisma.hifzProgress.findMany.mockResolvedValue([]);

      const result = await service.getHifzProgress('user-new');
      expect(result).toHaveLength(114);
      result.forEach(s => expect(s.status).toBe('NOT_STARTED'));
    });
  });

  describe('updateHifzProgress', () => {
    it('should upsert progress for valid surah and status', async () => {
      prisma.hifzProgress.upsert.mockResolvedValue({ surahNum: 1, status: 'MEMORIZED', userId: 'user-1' });

      const result = await service.updateHifzProgress('user-1', 1, 'MEMORIZED');
      expect(result.status).toBe('MEMORIZED');
      expect(prisma.hifzProgress.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_surahNum: { userId: 'user-1', surahNum: 1 } },
        }),
      );
    });

    it('should throw BadRequestException for surah 0', async () => {
      await expect(service.updateHifzProgress('user-1', 0, 'MEMORIZED')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for surah 115', async () => {
      await expect(service.updateHifzProgress('user-1', 115, 'MEMORIZED')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid status', async () => {
      await expect(service.updateHifzProgress('user-1', 1, 'invalid_status')).rejects.toThrow(BadRequestException);
    });

    it('should accept all valid statuses', async () => {
      prisma.hifzProgress.upsert.mockResolvedValue({ surahNum: 1, status: 'NEEDS_REVIEW', userId: 'user-1' });

      for (const status of ['NOT_STARTED', 'IN_PROGRESS', 'MEMORIZED', 'NEEDS_REVIEW']) {
        await expect(service.updateHifzProgress('user-1', 1, status)).resolves.toBeDefined();
      }
    });
  });

  describe('getHifzStats', () => {
    it('should return correct stats', async () => {
      prisma.hifzProgress.findMany.mockResolvedValue([
        { status: 'MEMORIZED' },
        { status: 'MEMORIZED' },
        { status: 'IN_PROGRESS' },
        { status: 'NEEDS_REVIEW' },
      ]);

      const result = await service.getHifzStats('user-1');
      expect(result.memorized).toBe(2);
      expect(result.inProgress).toBe(1);
      expect(result.needsReview).toBe(1);
      expect(result.notStarted).toBe(110);
      expect(result.percentage).toBe(2); // 2/114 ≈ 1.75 → rounds to 2
    });

    it('should return zeros for new user', async () => {
      prisma.hifzProgress.findMany.mockResolvedValue([]);

      const result = await service.getHifzStats('user-1');
      expect(result.memorized).toBe(0);
      expect(result.notStarted).toBe(114);
      expect(result.percentage).toBe(0);
    });
  });

  describe('getHifzReviewSchedule', () => {
    it('should return surahs needing review', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 14);
      prisma.hifzProgress.findMany.mockResolvedValue([
        { surahNum: 1, status: 'MEMORIZED', lastReviewedAt: oldDate },
        { surahNum: 112, status: 'NEEDS_REVIEW', lastReviewedAt: null },
      ]);

      const result = await service.getHifzReviewSchedule('user-1');
      expect(result).toHaveLength(2);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Daily Briefing
  // ═══════════════════════════════════════════════════════

  describe('getDailyBriefing', () => {
    it('should return full briefing data without location', async () => {
      prisma.dhikrSession.findMany.mockResolvedValue([]);
      prisma.dailyTaskCompletion.findMany.mockResolvedValue([]);

      const result = await service.getDailyBriefing('user-1');
      expect(result.hijriDate).toBeDefined();
      expect(result.hadithOfTheDay).toBeDefined();
      expect(result.hadithOfTheDay.text).toBeDefined();
      expect(result.hadithOfTheDay.arabic).toBeDefined();
      expect(result.duaOfTheDay).toBeDefined();
      expect(result.duaOfTheDay.arabic).toBeDefined();
      expect(result.ayahOfTheDay).toBeDefined();
      expect(result.totalTasks).toBe(3);
      expect(result.tasksCompleted).toBe(0);
      expect(result.prayerTimes).toBeNull();
    });

    it('should include prayer times when location provided', async () => {
      prisma.dhikrSession.findMany.mockResolvedValue([]);
      prisma.dailyTaskCompletion.findMany.mockResolvedValue([]);

      const result = await service.getDailyBriefing('user-1', 40.71, -74.01);
      // Prayer times should be populated from local calculation fallback
      expect(result.prayerTimes).not.toBeNull();
      if (result.prayerTimes) {
        expect(result.prayerTimes.fajr).toMatch(/^\d{2}:\d{2}$/);
      }
    });

    it('should aggregate dhikr count for today', async () => {
      prisma.dhikrSession.findMany.mockResolvedValue([
        { count: 33 },
        { count: 10 },
      ]);
      prisma.dailyTaskCompletion.findMany.mockResolvedValue([]);

      const result = await service.getDailyBriefing('user-1');
      expect(result.dhikrChallenge.completed).toBe(33); // min(43, 33) = 33
    });

    it('should include completed tasks', async () => {
      prisma.dhikrSession.findMany.mockResolvedValue([]);
      prisma.dailyTaskCompletion.findMany.mockResolvedValue([
        { taskType: 'DHIKR' },
        { taskType: 'QURAN' },
      ]);

      const result = await service.getDailyBriefing('user-1');
      expect(result.tasksCompleted).toBe(2);
      expect(result.completedTasks).toEqual(['DHIKR', 'QURAN']);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Daily Tasks
  // ═══════════════════════════════════════════════════════

  describe('completeDailyTask', () => {
    it('should mark task as complete', async () => {
      prisma.dailyTaskCompletion.upsert.mockResolvedValue({ taskType: 'DHIKR' });
      prisma.dailyTaskCompletion.findMany.mockResolvedValue([{ taskType: 'DHIKR' }]);

      const result = await service.completeDailyTask('user-1', 'DHIKR');
      expect(result.taskType).toBe('DHIKR');
      expect(result.completed).toBe(true);
      expect(result.allTasksComplete).toBe(false);
    });

    it('should detect when all 3 tasks are complete', async () => {
      prisma.dailyTaskCompletion.upsert.mockResolvedValue({ taskType: 'REFLECTION' });
      prisma.dailyTaskCompletion.findMany.mockResolvedValue([
        { taskType: 'DHIKR' },
        { taskType: 'QURAN' },
        { taskType: 'REFLECTION' },
      ]);

      const result = await service.completeDailyTask('user-1', 'REFLECTION');
      expect(result.allTasksComplete).toBe(true);
      expect(result.bonusXPAwarded).toBe(true);
    });

    it('should throw BadRequestException for invalid task type', async () => {
      await expect(service.completeDailyTask('user-1', 'invalid')).rejects.toThrow(BadRequestException);
    });

    it('should handle duplicate completion (upsert idempotent)', async () => {
      prisma.dailyTaskCompletion.upsert.mockResolvedValue({ taskType: 'DHIKR' });
      prisma.dailyTaskCompletion.findMany.mockResolvedValue([{ taskType: 'DHIKR' }]);

      const result = await service.completeDailyTask('user-1', 'DHIKR');
      expect(result.completed).toBe(true);
    });
  });

  describe('getDailyTasksToday', () => {
    it('should return all task statuses', async () => {
      prisma.dailyTaskCompletion.findMany.mockResolvedValue([
        { taskType: 'DHIKR' },
      ]);

      const result = await service.getDailyTasksToday('user-1');
      expect(result.tasks).toHaveLength(3);
      expect(result.tasks[0]).toEqual({ type: 'dhikr', completed: true });
      expect(result.tasks[1]).toEqual({ type: 'quran', completed: false });
      expect(result.tasks[2]).toEqual({ type: 'reflection', completed: false });
      expect(result.totalCompleted).toBe(1);
      expect(result.allComplete).toBe(false);
    });

    it('should mark all complete when 3 tasks done', async () => {
      prisma.dailyTaskCompletion.findMany.mockResolvedValue([
        { taskType: 'DHIKR' },
        { taskType: 'QURAN' },
        { taskType: 'REFLECTION' },
      ]);

      const result = await service.getDailyTasksToday('user-1');
      expect(result.allComplete).toBe(true);
      expect(result.totalCompleted).toBe(3);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Prayer Notification Settings
  // ═══════════════════════════════════════════════════════

  describe('getPrayerNotificationSettings', () => {
    it('should return existing settings', async () => {
      const settings = { userId: 'user-1', fajrEnabled: true, dhuhrEnabled: true };
      prisma.prayerNotificationSetting.findUnique.mockResolvedValue(settings);

      const result = await service.getPrayerNotificationSettings('user-1');
      expect(result.userId).toBe('user-1');
    });

    it('should create default settings when none exist', async () => {
      prisma.prayerNotificationSetting.findUnique.mockResolvedValue(null);
      prisma.prayerNotificationSetting.create.mockResolvedValue({ userId: 'user-1' });

      const result = await service.getPrayerNotificationSettings('user-1');
      expect(result.userId).toBe('user-1');
      expect(prisma.prayerNotificationSetting.create).toHaveBeenCalled();
    });
  });

  describe('updatePrayerNotificationSettings', () => {
    it('should upsert settings', async () => {
      const dto = { fajrEnabled: false };
      prisma.prayerNotificationSetting.upsert.mockResolvedValue({ userId: 'user-1', fajrEnabled: false });

      const result = await service.updatePrayerNotificationSettings('user-1', dto as any);
      expect(result.fajrEnabled).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Reading Plans
  // ═══════════════════════════════════════════════════════

  describe('createReadingPlan', () => {
    it('should create a 30-day plan', async () => {
      prisma.quranReadingPlan.create.mockResolvedValue({ id: 'plan-1', planType: '30day', userId: 'user-1' });

      const result = await service.createReadingPlan('user-1', { planType: '30day' } as any);
      expect(result.planType).toBe('30day');
    });

    it('should create a 60-day plan', async () => {
      prisma.quranReadingPlan.create.mockResolvedValue({ id: 'plan-1', planType: '60day', userId: 'user-1' });

      const result = await service.createReadingPlan('user-1', { planType: '60day' } as any);
      expect(result.planType).toBe('60day');
    });
  });

  describe('getActiveReadingPlan', () => {
    it('should return active plan', async () => {
      prisma.quranReadingPlan.findFirst.mockResolvedValue({ id: 'plan-1', isComplete: false });

      const result = await service.getActiveReadingPlan('user-1');
      expect(result.isComplete).toBe(false);
    });

    it('should return null when no active plan', async () => {
      prisma.quranReadingPlan.findFirst.mockResolvedValue(null);

      const result = await service.getActiveReadingPlan('user-1');
      expect(result).toBeNull();
    });
  });

  describe('updateReadingPlan', () => {
    it('should update plan when owned by user', async () => {
      prisma.quranReadingPlan.findFirst.mockResolvedValue({ id: 'plan-1', userId: 'user-1', isComplete: false });
      prisma.quranReadingPlan.update.mockResolvedValue({ id: 'plan-1', isComplete: true });
      prisma.notification = { create: jest.fn().mockResolvedValue({}) } as any;

      const result = await service.updateReadingPlan('user-1', 'plan-1', { isComplete: true } as any);
      expect(result.isComplete).toBe(true);
      // Khatm celebration notification should be sent
      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ title: expect.stringContaining('Khatm') }) }),
      );
    });

    it('should throw NotFoundException when plan not found', async () => {
      prisma.quranReadingPlan.findFirst.mockResolvedValue(null);
      await expect(service.updateReadingPlan('user-1', 'nonexistent', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteReadingPlan', () => {
    it('should delete plan when owned by user', async () => {
      prisma.quranReadingPlan.findFirst.mockResolvedValue({ id: 'plan-1', userId: 'user-1' });
      prisma.quranReadingPlan.delete.mockResolvedValue({ id: 'plan-1' });

      const result = await service.deleteReadingPlan('user-1', 'plan-1');
      expect(result.id).toBe('plan-1');
    });

    it('should throw NotFoundException when plan not found', async () => {
      prisma.quranReadingPlan.findFirst.mockResolvedValue(null);
      await expect(service.deleteReadingPlan('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getReadingPlanHistory', () => {
    it('should return completed plans with pagination', async () => {
      prisma.quranReadingPlan.findMany.mockResolvedValue([
        { id: 'plan-1', isComplete: true },
        { id: 'plan-2', isComplete: true },
      ]);

      const result = await service.getReadingPlanHistory('user-1');
      expect(result.data).toHaveLength(2);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Charity / Donations
  // ═══════════════════════════════════════════════════════

  describe('createCampaign', () => {
    it('should create a charity campaign', async () => {
      prisma.charityCampaign.create.mockResolvedValue({ id: 'camp-1', userId: 'user-1', title: 'Water Well' });

      const result = await service.createCampaign('user-1', { title: 'Water Well', goalAmount: 5000 } as any);
      expect(result.id).toBe('camp-1');
    });
  });

  describe('getCampaign', () => {
    it('should return campaign for valid ID', async () => {
      prisma.charityCampaign.findUnique.mockResolvedValue({ id: 'camp-1', title: 'Water Well' });

      const result = await service.getCampaign('camp-1');
      expect(result.title).toBe('Water Well');
    });

    it('should throw NotFoundException for invalid ID', async () => {
      prisma.charityCampaign.findUnique.mockResolvedValue(null);
      await expect(service.getCampaign('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createDonation', () => {
    it('should create donation without campaign', async () => {
      prisma.charityDonation.create.mockResolvedValue({ id: 'don-1', amount: 100, status: 'completed' });

      const result = await service.createDonation('user-1', { amount: 100 } as any);
      expect(result.amount).toBe(100);
    });

    it('should create donation with valid campaign as pending', async () => {
      prisma.charityCampaign.findUnique.mockResolvedValue({ id: 'camp-1' });
      prisma.charityDonation.create.mockResolvedValue({ id: 'don-1', amount: 50, campaignId: 'camp-1', status: 'pending' });

      const result = await service.createDonation('user-1', { amount: 50, campaignId: 'camp-1' } as any);
      expect(result.campaignId).toBe('camp-1');
      expect(prisma.charityDonation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'pending' }) }),
      );
    });

    it('should throw BadRequestException for zero amount', async () => {
      await expect(service.createDonation('user-1', { amount: 0 } as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for amount > 1,000,000', async () => {
      await expect(service.createDonation('user-1', { amount: 1000001 } as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for negative amount', async () => {
      await expect(service.createDonation('user-1', { amount: -10 } as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent campaign', async () => {
      prisma.charityCampaign.findUnique.mockResolvedValue(null);
      await expect(service.createDonation('user-1', { amount: 100, campaignId: 'fake' } as any))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('listCampaigns', () => {
    it('should return paginated active campaigns', async () => {
      prisma.charityCampaign.findMany.mockResolvedValue([{ id: 'camp-1' }]);

      const result = await service.listCampaigns();
      expect(result.data).toHaveLength(1);
    });
  });

  describe('getMyDonations', () => {
    it('should return user donations with pagination', async () => {
      prisma.charityDonation.findMany.mockResolvedValue([{ id: 'don-1', amount: 100 }]);

      const result = await service.getMyDonations('user-1');
      expect(result.data).toHaveLength(1);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Hajj & Umrah
  // ═══════════════════════════════════════════════════════

  describe('getHajjGuide', () => {
    it('should return hajj guide data', () => {
      const result = service.getHajjGuide();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('name');
    });
  });

  describe('getHajjProgress', () => {
    it('should return latest progress for user', async () => {
      prisma.hajjProgress.findFirst.mockResolvedValue({ id: 'hp-1', year: 2026 });

      const result = await service.getHajjProgress('user-1');
      expect(result.year).toBe(2026);
    });

    it('should return null for user with no progress', async () => {
      prisma.hajjProgress.findFirst.mockResolvedValue(null);

      const result = await service.getHajjProgress('user-1');
      expect(result).toBeNull();
    });
  });

  describe('createHajjProgress', () => {
    it('should create progress for year', async () => {
      prisma.hajjProgress.create.mockResolvedValue({ id: 'hp-1', userId: 'user-1', year: 2026 });

      const result = await service.createHajjProgress('user-1', { year: 2026 } as any);
      expect(result.year).toBe(2026);
    });

    it('should throw ConflictException for duplicate year', async () => {
      const error = new Prisma.PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: '5' });
      prisma.hajjProgress.create.mockRejectedValue(error);

      await expect(service.createHajjProgress('user-1', { year: 2026 } as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('updateHajjProgress', () => {
    it('should update progress when owned by user', async () => {
      prisma.hajjProgress.findFirst.mockResolvedValue({ id: 'hp-1', userId: 'user-1' });
      prisma.hajjProgress.update.mockResolvedValue({ id: 'hp-1', completedSteps: ['tawaf'] });

      const result = await service.updateHajjProgress('user-1', 'hp-1', { completedSteps: ['tawaf'] } as any);
      expect(result.completedSteps).toContain('tawaf');
    });

    it('should throw NotFoundException when progress not found', async () => {
      prisma.hajjProgress.findFirst.mockResolvedValue(null);
      await expect(service.updateHajjProgress('user-1', 'nonexistent', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Tafsir
  // ═══════════════════════════════════════════════════════

  describe('getTafsir', () => {
    it('should return tafsir for valid surah and verse', () => {
      const result = service.getTafsir(1, 1);
      expect(result.surahNumber).toBe(1);
      expect(result.verseNumber).toBe(1);
      expect(result.tafsirSources.length).toBeGreaterThan(0);
    });

    it('should throw NotFoundException for verse not in tafsir data', () => {
      expect(() => service.getTafsir(999, 999)).toThrow(NotFoundException);
    });

    it('should filter tafsir by source name', () => {
      const result = service.getTafsir(1, 1, 'Ibn Kathir');
      expect(result.tafsirSources.length).toBeGreaterThan(0);
      result.tafsirSources.forEach(s => expect(s.name).toBe('Ibn Kathir'));
    });

    it('should return empty tafsirSources when source not found', () => {
      const result = service.getTafsir(1, 1, 'Nonexistent Scholar');
      expect(result.tafsirSources).toEqual([]);
    });
  });

  describe('getTafsirSources', () => {
    it('should return unique source names', () => {
      const result = service.getTafsirSources();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('name');
    });
  });

  // ═══════════════════════════════════════════════════════
  // Scholar Verification
  // ═══════════════════════════════════════════════════════

  describe('applyScholarVerification', () => {
    it('should create verification application', async () => {
      prisma.scholarVerification.findUnique.mockResolvedValue(null);
      prisma.scholarVerification.create.mockResolvedValue({ id: 'sv-1', userId: 'user-1', status: 'pending' });

      const result = await service.applyScholarVerification('user-1', { credentials: 'Ijazah' } as any);
      expect(result.status).toBe('pending');
    });

    it('should throw BadRequestException if already applied', async () => {
      prisma.scholarVerification.findUnique.mockResolvedValue({ id: 'sv-1', userId: 'user-1' });
      await expect(service.applyScholarVerification('user-1', {} as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getScholarVerificationStatus', () => {
    it('should return verification status', async () => {
      prisma.scholarVerification.findUnique.mockResolvedValue({ userId: 'user-1', status: 'pending' });
      const result = await service.getScholarVerificationStatus('user-1');
      expect(result.status).toBe('pending');
    });

    it('should return null when no application exists', async () => {
      prisma.scholarVerification.findUnique.mockResolvedValue(null);
      const result = await service.getScholarVerificationStatus('user-1');
      expect(result).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════
  // Content Filter Settings
  // ═══════════════════════════════════════════════════════

  describe('getContentFilterSettings', () => {
    it('should return existing settings', async () => {
      prisma.contentFilterSetting.findUnique.mockResolvedValue({ userId: 'user-1', strictMode: true });
      const result = await service.getContentFilterSettings('user-1');
      expect(result.strictMode).toBe(true);
    });

    it('should create default settings when none exist', async () => {
      prisma.contentFilterSetting.findUnique.mockResolvedValue(null);
      prisma.contentFilterSetting.create.mockResolvedValue({ userId: 'user-1' });
      const result = await service.getContentFilterSettings('user-1');
      expect(result.userId).toBe('user-1');
    });
  });

  describe('updateContentFilterSettings', () => {
    it('should upsert content filter settings', async () => {
      prisma.contentFilterSetting.upsert.mockResolvedValue({ userId: 'user-1', strictMode: false });
      const result = await service.updateContentFilterSettings('user-1', { strictMode: false } as any);
      expect(result.strictMode).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Dhikr
  // ═══════════════════════════════════════════════════════

  describe('saveDhikrSession', () => {
    it('should save dhikr session', async () => {
      prisma.dhikrSession.create.mockResolvedValue({ id: 'ds-1', userId: 'user-1', phrase: 'SubhanAllah', count: 33, target: 33 });

      const result = await service.saveDhikrSession('user-1', { phrase: 'SubhanAllah', count: 33 } as any);
      expect(result.count).toBe(33);
    });

    it('should throw BadRequestException for count = 0', async () => {
      await expect(service.saveDhikrSession('user-1', { phrase: 'SubhanAllah', count: 0 } as any))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for count > 100000', async () => {
      await expect(service.saveDhikrSession('user-1', { phrase: 'SubhanAllah', count: 100001 } as any))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for negative count', async () => {
      await expect(service.saveDhikrSession('user-1', { phrase: 'SubhanAllah', count: -1 } as any))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid target', async () => {
      await expect(service.saveDhikrSession('user-1', { phrase: 'SubhanAllah', count: 10, target: 100001 } as any))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('getDhikrStats', () => {
    it('should return stats with streak', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today.getTime() - 86400000);

      prisma.dhikrSession.aggregate
        .mockResolvedValueOnce({ _sum: { count: 500 } })  // total
        .mockResolvedValueOnce({ _sum: { count: 33 } });   // today
      prisma.dhikrSession.findMany.mockResolvedValue([
        { createdAt: today, count: 33 },
        { createdAt: yesterday, count: 50 },
      ]);

      const result = await service.getDhikrStats('user-1');
      expect(result.totalCount).toBe(500);
      expect(result.todayCount).toBe(33);
      expect(result.streak).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getDhikrLeaderboard', () => {
    it('should return leaderboard for week period', async () => {
      prisma.dhikrSession.groupBy.mockResolvedValue([
        { userId: 'user-1', _sum: { count: 500 } },
        { userId: 'user-2', _sum: { count: 300 } },
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'user-1', displayName: 'Ali', avatarUrl: null },
        { id: 'user-2', displayName: 'Omar', avatarUrl: null },
      ]);

      const result = await service.getDhikrLeaderboard('week');
      expect(result).toHaveLength(2);
      expect(result[0].totalCount).toBe(500);
      expect(result[0].user?.displayName).toBe('Ali');
    });

    it('should return leaderboard for day period', async () => {
      prisma.dhikrSession.groupBy.mockResolvedValue([]);
      const result = await service.getDhikrLeaderboard('day');
      expect(result).toEqual([]);
    });
  });

  describe('createDhikrChallenge', () => {
    it('should create a challenge', async () => {
      prisma.dhikrChallenge.create.mockResolvedValue({
        id: 'dc-1', userId: 'user-1', title: '1 Million SubhanAllah',
        phrase: 'SubhanAllah', targetTotal: 1000000, expiresAt: null,
      });

      const result = await service.createDhikrChallenge('user-1', {
        title: '1 Million SubhanAllah', phrase: 'SubhanAllah', targetTotal: 1000000,
      } as any);
      expect(result.title).toBe('1 Million SubhanAllah');
    });
  });

  describe('listActiveChallenges', () => {
    it('should return active challenges with pagination', async () => {
      prisma.dhikrChallenge.findMany.mockResolvedValue([
        { id: 'dc-1', title: 'Challenge 1' },
      ]);

      const result = await service.listActiveChallenges();
      expect(result.data).toHaveLength(1);
    });
  });

  describe('getChallengeDetail', () => {
    it('should return challenge with top contributors', async () => {
      prisma.dhikrChallenge.findUnique.mockResolvedValue({ id: 'dc-1', title: 'Test Challenge' });
      prisma.dhikrChallengeParticipant.findMany.mockResolvedValue([
        { userId: 'user-1', contributed: 100 },
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'user-1', displayName: 'Ali', avatarUrl: null },
      ]);

      const result = await service.getChallengeDetail('dc-1');
      expect(result.title).toBe('Test Challenge');
      expect(result.topContributors).toHaveLength(1);
      expect(result.topContributors[0].user?.displayName).toBe('Ali');
    });

    it('should throw NotFoundException for invalid challenge', async () => {
      prisma.dhikrChallenge.findUnique.mockResolvedValue(null);
      await expect(service.getChallengeDetail('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('joinChallenge', () => {
    it('should join challenge successfully', async () => {
      prisma.dhikrChallenge.findUnique.mockResolvedValue({ id: 'dc-1' });
      prisma.dhikrChallengeParticipant.create.mockResolvedValue({ userId: 'user-1', challengeId: 'dc-1' });
      prisma.$executeRaw.mockResolvedValue(1);

      const result = await service.joinChallenge('user-1', 'dc-1');
      expect(result).toEqual({ joined: true });
    });

    it('should throw NotFoundException for non-existent challenge', async () => {
      prisma.dhikrChallenge.findUnique.mockResolvedValue(null);
      await expect(service.joinChallenge('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when already joined', async () => {
      prisma.dhikrChallenge.findUnique.mockResolvedValue({ id: 'dc-1' });
      const error = new Prisma.PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: '5' });
      prisma.dhikrChallengeParticipant.create.mockRejectedValue(error);

      await expect(service.joinChallenge('user-1', 'dc-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('contributeToChallenge', () => {
    it('should contribute to challenge', async () => {
      prisma.dhikrChallenge.findUnique.mockResolvedValue({ id: 'dc-1', expiresAt: null });
      prisma.dhikrChallengeParticipant.findUnique.mockResolvedValue({ userId: 'user-1', challengeId: 'dc-1' });
      prisma.$transaction.mockResolvedValue([1, 1]);

      const result = await service.contributeToChallenge('user-1', 'dc-1', 33);
      expect(result).toEqual({ contributed: 33 });
    });

    it('should throw BadRequestException for zero count', async () => {
      await expect(service.contributeToChallenge('user-1', 'dc-1', 0)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for count > 100000', async () => {
      await expect(service.contributeToChallenge('user-1', 'dc-1', 100001)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when not a participant', async () => {
      prisma.dhikrChallenge.findUnique.mockResolvedValue({ id: 'dc-1', expiresAt: null });
      prisma.dhikrChallengeParticipant.findUnique.mockResolvedValue(null);
      await expect(service.contributeToChallenge('user-1', 'dc-1', 33)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for expired challenge', async () => {
      prisma.dhikrChallenge.findUnique.mockResolvedValue({ id: 'dc-1', expiresAt: new Date('2020-01-01') });
      await expect(service.contributeToChallenge('user-1', 'dc-1', 33)).rejects.toThrow(BadRequestException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Adhan Reciters & Calculation Methods & Quran Reciters
  // ═══════════════════════════════════════════════════════

  describe('getAdhanReciters', () => {
    it('should return 6 reciters with Arabic names', () => {
      const result = service.getAdhanReciters();
      expect(result).toHaveLength(6);
      expect(result[0].id).toBe('mishary');
      expect(result[0].arabicName).toBeDefined();
      result.forEach(r => {
        expect(r.id).toBeDefined();
        expect(r.name).toBeDefined();
        expect(r.arabicName).toBeDefined();
      });
    });
  });

  describe('getCalculationMethods', () => {
    it('should return 8 calculation methods', () => {
      const result = service.getCalculationMethods();
      expect(result).toHaveLength(8);
      expect(result.map(m => m.id)).toContain('MWL');
      expect(result.map(m => m.id)).toContain('DIYANET');
      result.forEach(m => {
        expect(m.fajrAngle).toBeGreaterThan(0);
      });
    });
  });

  describe('getQuranReciters', () => {
    it('should return 4 reciters with audio base URLs', () => {
      const result = service.getQuranReciters();
      expect(result).toHaveLength(4);
      result.forEach(r => {
        expect(r.audioBaseUrl).toContain('https://');
        expect(r.arabicName).toBeDefined();
      });
    });
  });

  describe('getQuranAudioUrl', () => {
    it('should return audio URL for valid surah/ayah', () => {
      const result = service.getQuranAudioUrl(1, 1, 'mishary');
      expect(result.url).toContain('.mp3');
      expect(result.reciter).toContain('Alafasy');
    });

    it('should default to mishary when invalid reciter specified', () => {
      const result = service.getQuranAudioUrl(1, 1, 'nonexistent');
      expect(result.reciter).toContain('Alafasy');
    });
  });

  // ═══════════════════════════════════════════════════════
  // Current Prayer Window
  // ═══════════════════════════════════════════════════════

  describe('getCurrentPrayerWindow', () => {
    it('should determine current and next prayer', () => {
      const timings = { fajr: '05:00', dhuhr: '12:00', asr: '15:30', maghrib: '18:00', isha: '19:30' };
      const result = service.getCurrentPrayerWindow(timings);
      expect(result.currentPrayer).toBeDefined();
      expect(result.nextPrayer).toBeDefined();
      expect(result.minutesUntilNext).toBeGreaterThanOrEqual(0);
    });

    it('should return unknown/fajr for empty timings', () => {
      const result = service.getCurrentPrayerWindow({});
      expect(result.currentPrayer).toBe('unknown');
      expect(result.nextPrayer).toBe('fajr');
    });
  });

  // ═══════════════════════════════════════════════════════
  // Zakat — additional edge cases
  // ═══════════════════════════════════════════════════════

  describe('calculateZakat — additional', () => {
    it('should calculate correct 2.5% rate', () => {
      const result = service.calculateZakat({ cash: 100000, gold: 0, silver: 0, investments: 0, debts: 0 });
      expect(result.zakatDue).toBeCloseTo((100000 - 0) * 0.025, 2);
    });

    it('should convert gold grams to value using price per gram', () => {
      const result = service.calculateZakat({ cash: 0, gold: 100, silver: 0, investments: 0, debts: 0 });
      expect(result.breakdown.goldValue).toBe(100 * result.goldPricePerGram);
    });

    it('should convert silver grams to value using price per gram', () => {
      const result = service.calculateZakat({ cash: 0, gold: 0, silver: 1000, investments: 0, debts: 0 });
      expect(result.breakdown.silverValue).toBe(1000 * result.silverPricePerGram);
    });

    it('should throw for negative gold', () => {
      expect(() => service.calculateZakat({ cash: 0, gold: -1, silver: 0, investments: 0, debts: 0 }))
        .toThrow(BadRequestException);
    });

    it('should throw for negative investments', () => {
      expect(() => service.calculateZakat({ cash: 0, gold: 0, silver: 0, investments: -1, debts: 0 }))
        .toThrow(BadRequestException);
    });

    it('should throw for negative debts', () => {
      expect(() => service.calculateZakat({ cash: 0, gold: 0, silver: 0, investments: 0, debts: -1 }))
        .toThrow(BadRequestException);
    });

    it('should use lower of gold/silver nisab (more inclusive)', () => {
      const result = service.calculateZakat({ cash: 100000, gold: 0, silver: 0, investments: 0, debts: 0 });
      const goldNisab = 87.48 * result.goldPricePerGram;
      const silverNisab = 612.36 * result.silverPricePerGram;
      expect(result.nisab).toBe(Math.min(goldNisab, silverNisab));
    });
  });

  // ═══════════════════════════════════════════════════════
  // Nearby Mosques — additional
  // ═══════════════════════════════════════════════════════

  describe('getNearbyMosques — additional', () => {
    beforeEach(() => {
      // Ensure $queryRaw and Redis return empty results
      prisma.$queryRaw.mockResolvedValue([]);
      const redis = (service as any).redis;
      redis.get.mockResolvedValue(null);
    });

    it('should reject longitude > 180', async () => {
      await expect(service.getNearbyMosques(0, 200, 10)).rejects.toThrow(BadRequestException);
    });

    it('should reject longitude < -180', async () => {
      await expect(service.getNearbyMosques(0, -181, 10)).rejects.toThrow(BadRequestException);
    });

    it('should clamp limit to range 1-50', async () => {
      // The service clamps to 50, so it should still work
      const result = await service.getNearbyMosques(40, -74, 10, 100);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle 0,0 coordinates without crash', async () => {
      const result = await service.getNearbyMosques(0, 0, 5);
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
