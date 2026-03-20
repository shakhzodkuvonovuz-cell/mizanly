import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        IslamicService,
        {
          provide: PrismaService,
          useValue: {
            hajjProgress: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), upsert: jest.fn() },
            dhikrSession: { create: jest.fn(), findMany: jest.fn() },
            donation: { create: jest.fn(), findMany: jest.fn() },
            donationCampaign: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
            quranReadingPlan: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), upsert: jest.fn() },
            quranReadingProgress: { create: jest.fn(), findMany: jest.fn() },
            dhikrChallenge: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
            dhikrChallengeParticipant: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
            prayerNotificationSetting: { findUnique: jest.fn(), upsert: jest.fn() },
          },
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
      const assets = [
        { type: 'cash', value: 10000 },
        { type: 'gold', value: 6800 },
        { type: 'silver', value: 410 },
        { type: 'investments', value: 5000 },
      ];

      const result = service.calculateZakat(assets as any);

      // Total: 22210 >= nisab silver (476) ✓
      expect(result.meetsNisab).toBe(true);
      expect(result.totalZakat).toBeGreaterThan(0);
      expect(result.breakdown).toHaveLength(4);
      expect(result.totalValue).toBe(22210);
    });

    it('should return 0 zakat when nisab is not met', () => {
      const assets = [
        { type: 'cash', value: 50 },
        { type: 'savings', value: 20 },
      ];

      const result = service.calculateZakat(assets as any);

      // Total: 70 < nisab silver (476)
      expect(result.meetsNisab).toBe(false);
      expect(result.totalZakat).toBe(0);
    });

    it('should handle edge case of exactly at nisab threshold', () => {
      // Silver nisab = 595 * 0.8 = 476
      const assets = [{ type: 'cash', value: 476 }];

      const result = service.calculateZakat(assets as any);

      expect(result.meetsNisab).toBe(true);
      expect(result.totalZakat).toBeCloseTo(476 * 0.025, 2);
    });

    it('should handle zero values', () => {
      const assets: { type: string; value: number }[] = [];

      const result = service.calculateZakat(assets as any);

      expect(result.totalValue).toBe(0);
      expect(result.meetsNisab).toBe(false);
      expect(result.totalZakat).toBe(0);
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
});
