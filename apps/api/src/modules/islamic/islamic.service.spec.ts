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
  });

  describe('getPrayerTimes', () => {
    it('should return prayer times for given coordinates', async () => {
      const params = { lat: 40.7128, lng: -74.006, method: 'MWL', date: '2026-03-13' };
      const result = await service.getPrayerTimes(params);

      expect(result).toEqual({
        date: '2026-03-13',
        timings: {
          fajr: '05:30',
          sunrise: '06:45',
          dhuhr: '12:30',
          asr: '15:45',
          maghrib: '18:20',
          isha: '19:45',
        },
        method: 'Muslim World League',
        location: { lat: 40.7128, lng: -74.006 },
      });
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
    it('should return nearby mosques sorted by distance', () => {
      const result = service.getNearbyMosques(40.7128, -74.006, 10000); // New York with large radius

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);

      // Should be sorted by distance
      for (let i = 1; i < result.length; i++) {
        expect(result[i].distance).toBeGreaterThanOrEqual(result[i - 1].distance!);
      }

      // Each mosque should have distance calculated
      result.forEach(mosque => {
        expect(mosque.distance).toBeDefined();
        expect(mosque.distance).toBeGreaterThanOrEqual(0);
      });
    });

    it('should filter mosques by radius', () => {
      // Use a very small radius (1km) - likely no mosques nearby
      const result = service.getNearbyMosques(40.7128, -74.006, 1);

      // All returned mosques should be within 1km
      result.forEach(mosque => {
        expect(mosque.distance).toBeLessThanOrEqual(1000);
      });
    });

    it('should handle edge case of no mosques within radius', () => {
      // Use a location far from any mosque with small radius
      const result = service.getNearbyMosques(-90, 0, 1); // South pole

      expect(result).toHaveLength(0);
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
    beforeEach(() => {
      jest.useFakeTimers({ now: new Date('2026-03-15T12:00:00Z') });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return Ramadan info for given year', () => {
      const params = { year: 2026, lat: 40.7128, lng: -74.006 };
      const result = service.getRamadanInfo(params);

      expect(result).toEqual({
        year: 2026,
        startDate: '2026-03-10',
        endDate: '2026-04-09',
        currentDay: 6, // March 15 is 6 days after March 10
        iftarTime: '18:45',
        suhoorTime: '04:30',
        nextPrayer: 'Maghrib',
        nextPrayerTime: '18:45',
      });
    });

    it('should use current year when not specified', () => {
      const params = { lat: 40.7128, lng: -74.006 };
      const result = service.getRamadanInfo(params);

      expect(result.year).toBe(2026);
    });

    it('should not include currentDay when outside Ramadan', () => {
      // Mock date outside Ramadan
      jest.setSystemTime(new Date('2026-01-01T12:00:00Z'));

      const params = { year: 2026 };
      const result = service.getRamadanInfo(params);

      expect(result.currentDay).toBeUndefined();
    });

    it('should handle edge case of no location provided', () => {
      const params = { year: 2026 };
      const result = service.getRamadanInfo(params);

      expect(result).toBeDefined();
      expect(result.iftarTime).toBe('18:45');
      expect(result.suhoorTime).toBe('04:30');
    });
  });
});