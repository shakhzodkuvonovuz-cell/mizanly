import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { IslamicService } from '../modules/islamic/islamic.service';
import { PrismaService } from '../config/prisma.service';
import { globalMockProviders } from '../common/test/mock-providers';

/**
 * Integration: Islamic Features
 * Prayer times → Quran chapters → Duas → Fasting → Daily briefing → Zakat
 */
describe('Integration: Islamic Features', () => {
  let islamicService: IslamicService;
  let prisma: any;

  beforeEach(async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: { timings: { Fajr: '05:00', Dhuhr: '12:00', Asr: '15:30', Maghrib: '18:00', Isha: '19:30' } },
      }),
    });
    (global as any).fetch = mockFetch;

    const prismaValue: any = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }), findMany: jest.fn().mockResolvedValue([]) },
      fastingLog: {
        create: jest.fn().mockResolvedValue({ id: 'fl-1', userId: 'user-1', date: new Date(), completed: false }),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      dailyTaskCompletion: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      duaBookmark: { findMany: jest.fn().mockResolvedValue([]) },
      hifzProgress: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn().mockResolvedValue({}) },
      prayerNotification: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) },
      readingPlan: { findMany: jest.fn().mockResolvedValue([]) },
      dhikrSession: { findMany: jest.fn().mockResolvedValue([]) },
      hajjProgress: { findFirst: jest.fn().mockResolvedValue(null) },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        IslamicService,
        { provide: PrismaService, useValue: prismaValue },
      ],
    }).compile();

    islamicService = module.get(IslamicService);
    prisma = module.get(PrismaService) as any;
  });

  afterEach(() => {
    delete (global as any).fetch;
  });

  it('should return Quran chapters (114 surahs)', () => {
    const result = islamicService.getQuranChapters();
    expect(result).toHaveLength(114);
    expect(result[0]).toHaveProperty('nameTransliteration', 'Al-Fatihah');
    expect(result[113]).toHaveProperty('nameTransliteration', 'An-Nas');
  });

  it('should return duas by category', () => {
    const all = islamicService.getDuasByCategory();
    expect(all.length).toBeGreaterThan(0);
    const morning = islamicService.getDuasByCategory('morning');
    expect(morning.every(d => d.category === 'morning')).toBe(true);
  });

  it('should return 99 names of Allah', () => {
    const result = islamicService.getAllNamesOfAllah();
    expect(result).toHaveLength(99);
    expect(result[0]).toHaveProperty('arabicName');
    expect(result[0]).toHaveProperty('englishMeaning');
  });

  it('should return hajj guide steps', () => {
    const result = islamicService.getHajjGuide();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('name');
    expect(result[0]).toHaveProperty('checklist');
  });

  it('should return tafsir for Al-Fatiha verse 1', () => {
    const result = islamicService.getTafsir(1, 1);
    expect(result.surahNumber).toBe(1);
    expect(result.verseNumber).toBe(1);
    expect(result.tafsirSources.length).toBeGreaterThan(0);
  });

  it('should throw NotFoundException for invalid tafsir', () => {
    expect(() => islamicService.getTafsir(999, 999)).toThrow(NotFoundException);
  });
});
