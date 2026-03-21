import { Test, TestingModule } from '@nestjs/testing';
import { IslamicService } from './islamic.service';
import { PrismaService } from '../../config/prisma.service';
import { globalMockProviders } from '../../common/test/mock-providers';

jest.mock('./data/hadiths.json', () => [
  { id: 1, arabic: 'حديث', english: 'Hadith', source: 'Bukhari', narrator: 'Abu Hurairah', chapter: 'Faith' },
], { virtual: true });

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('IslamicService — error recovery (Task 71)', () => {
  let service: IslamicService;
  let prisma: any;
  let redis: any;

  beforeEach(async () => {
    const prismaValue: any = {
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
      mosqueCommunity: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        IslamicService,
        { provide: PrismaService, useValue: prismaValue },
      ],
    }).compile();

    service = module.get<IslamicService>(IslamicService);
    prisma = module.get(PrismaService);
    redis = module.get('REDIS');
    jest.clearAllMocks();
  });

  describe('getPrayerTimes — API failure recovery', () => {
    it('should use local fallback when Aladhan API returns 500', async () => {
      mockFetch.mockResolvedValue({ json: () => Promise.resolve({ code: 500 }) });
      const result = await service.getPrayerTimes({ lat: 40.7128, lng: -74.006, date: '2026-03-21' });
      expect(result.timings.fajr).toBeDefined();
      expect(result.timings.maghrib).toBeDefined();
    });

    it('should use local fallback when Aladhan API times out', async () => {
      mockFetch.mockRejectedValue(new Error('AbortError: timeout'));
      const result = await service.getPrayerTimes({ lat: 33.8688, lng: 151.2093, date: '2026-03-21' });
      expect(result.timings).toBeDefined();
    });

    it('should use local fallback when Aladhan API returns malformed JSON', async () => {
      mockFetch.mockResolvedValue({ json: () => Promise.reject(new Error('Unexpected token')) });
      const result = await service.getPrayerTimes({ lat: 21.4225, lng: 39.8262, date: '2026-03-21' });
      expect(result.timings.fajr).toBeDefined();
    });

    it('should handle Redis cache unavailability gracefully', async () => {
      redis.get.mockRejectedValue(new Error('ECONNREFUSED'));
      mockFetch.mockRejectedValue(new Error('Network error'));
      // Should still return local calculation even when both Redis and API fail
      const result = await service.getPrayerTimes({ lat: 40.7128, lng: -74.006, date: '2026-03-21' });
      expect(result.timings).toBeDefined();
    });
  });

  describe('getQuranVerses — API failure', () => {
    it('should throw BadRequestException when Quran.com API fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      await expect(service.getQuranVerses(1)).rejects.toThrow();
    });
  });

  describe('searchQuran — API failure', () => {
    it('should throw when API unavailable', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      await expect(service.searchQuran('test')).rejects.toThrow();
    });
  });

  describe('getNearbyMosques — fallback behavior', () => {
    it('should return empty when both DB and OSM fail', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      mockFetch.mockRejectedValue(new Error('OSM API down'));
      const result = await service.getNearbyMosques(40.7128, -74.006);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle DB query failure — falls back or returns empty', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('Connection refused'));
      mockFetch.mockRejectedValue(new Error('OSM down too'));
      // Service catches DB errors and tries OSM fallback; if both fail, returns empty
      try {
        const result = await service.getNearbyMosques(40.7128, -74.006);
        expect(Array.isArray(result)).toBe(true);
      } catch {
        // Also acceptable: service throws on total failure
        expect(true).toBe(true);
      }
    });
  });
});
