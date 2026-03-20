import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { IslamicService } from './islamic.service';
import { PrismaService } from '../../config/prisma.service';
import { globalMockProviders } from '../../common/test/mock-providers';

// Mock hadiths data
jest.mock('./data/hadiths.json', () => [
  { id: 1, arabic: 'حديث 1', english: 'Hadith 1', source: 'Bukhari', narrator: 'Abu Hurairah', chapter: 'Faith' },
  { id: 2, arabic: 'حديث 2', english: 'Hadith 2', source: 'Muslim', narrator: 'Umar', chapter: 'Prayer' },
], { virtual: true });

// Mock fetch to prevent real API calls
const mockFetch = jest.fn().mockRejectedValue(new Error('Network disabled in tests'));
global.fetch = mockFetch as any;

describe('IslamicService — edge cases', () => {
  let service: IslamicService;
  let prisma: any;

  const userId = 'user-edge-1';

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
      mosqueCommunity: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValue(1),
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
    mockFetch.mockRejectedValue(new Error('Network disabled in tests'));
  });

  describe('getPrayerTimes — coordinate edge cases', () => {
    it('should reject latitude > 90', async () => {
      await expect(service.getPrayerTimes({ lat: 91, lng: 0 }))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject latitude < -90', async () => {
      await expect(service.getPrayerTimes({ lat: -91, lng: 0 }))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject longitude > 180', async () => {
      await expect(service.getPrayerTimes({ lat: 0, lng: 181 }))
        .rejects.toThrow(BadRequestException);
    });

    it('should use local fallback for Arctic coordinates (lat=65)', async () => {
      // API is mocked to fail — should fall back to local calculator without crashing
      const result = await service.getPrayerTimes({ lat: 65, lng: 25, method: 'MWL', date: '2026-06-15' });
      expect(result.date).toBe('2026-06-15');
      expect(result.timings.fajr).toBeDefined();
      expect(result.timings.isha).toBeDefined();
    });

    it('should handle coordinates at equator (lat=0, lng=0)', async () => {
      const result = await service.getPrayerTimes({ lat: 0, lng: 0, method: 'MWL', date: '2026-03-21' });
      expect(result.date).toBe('2026-03-21');
      expect(result.timings).toBeDefined();
    });
  });

  describe('getQuranChapter — boundary edge cases', () => {
    it('should reject surahNumber = 0 (valid range: 1-114)', () => {
      expect(() => service.getQuranChapter(0)).toThrow(NotFoundException);
    });

    it('should reject surahNumber = 115', () => {
      expect(() => service.getQuranChapter(115)).toThrow(NotFoundException);
    });

    it('should reject surahNumber = -1', () => {
      expect(() => service.getQuranChapter(-1)).toThrow(NotFoundException);
    });

    it('should reject non-integer surahNumber = 1.5', () => {
      // getQuranChapter finds by number, 1.5 doesn't match any entry
      expect(() => service.getQuranChapter(1.5)).toThrow(NotFoundException);
    });

    it('should accept surahNumber = 1 (Al-Fatiha)', () => {
      const result = service.getQuranChapter(1);
      expect(result.number).toBe(1);
      expect(result.nameEnglish).toBeDefined();
    });

    it('should accept surahNumber = 114 (An-Nas)', () => {
      const result = service.getQuranChapter(114);
      expect(result.number).toBe(114);
    });
  });

  describe('searchQuran — edge cases', () => {
    it('should handle Arabic query without crashing', async () => {
      // API is mocked to fail — should throw BadRequestException from the catch block
      await expect(service.searchQuran('الصبر'))
        .rejects.toThrow(BadRequestException);
    });

    it('should handle query with regex special chars without regex injection', async () => {
      // Should not crash due to regex injection
      await expect(service.searchQuran('verse (1) [test]'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('getNearbyMosques — edge cases', () => {
    it('should reject invalid coordinates (lat > 90)', async () => {
      await expect(service.getNearbyMosques(91, 0))
        .rejects.toThrow(BadRequestException);
    });

    it('should return empty array when no mosques found in DB or OSM', async () => {
      // DB query returns empty, and OSM API is mocked to fail
      prisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getNearbyMosques(40.7128, -74.006, 10, 20);
      // Should return empty array (or from fallback), not crash
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
