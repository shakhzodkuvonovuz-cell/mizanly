import { Test } from '@nestjs/testing';
import { IslamicService } from './islamic.service';
import { PrismaService } from '../../config/prisma.service';
import { mockRedis, mockConfigService, mockNotificationsService } from '../../common/test/mock-providers';

// Minimal prisma mock — glossary/classification methods don't use prisma
const mockPrisma = {
  provide: PrismaService,
  useValue: {
    user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    notification: { create: jest.fn() },
    quranPlan: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    dhikrSession: { findMany: jest.fn().mockResolvedValue([]) },
    audioRoom: { findUnique: jest.fn(), update: jest.fn() },
    userSettings: { findUnique: jest.fn(), upsert: jest.fn() },
    contentFilterSetting: { findUnique: jest.fn(), upsert: jest.fn() },
    scholarVerification: { findFirst: jest.fn(), create: jest.fn() },
    waqfCampaign: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    waqfDonation: { create: jest.fn() },
    hajjProgress: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    prayerNotificationSetting: { findFirst: jest.fn(), upsert: jest.fn() },
    dailyTaskCompletion: { findFirst: jest.fn(), create: jest.fn() },
    $transaction: jest.fn().mockImplementation((fns: any[]) => Promise.all(fns.map((f: any) => f))),
    $executeRaw: jest.fn(),
  },
};

describe('IslamicService — Glossary, Classification & Hadith Grade', () => {
  let service: IslamicService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        IslamicService,
        mockPrisma,
        mockRedis,
        mockConfigService,
        mockNotificationsService,
      ],
    }).compile();

    service = module.get(IslamicService);
  });

  describe('getGlossary', () => {
    it('should return all terms without query', () => {
      const result = service.getGlossary();
      expect(result.data.length).toBeGreaterThan(30);
      expect(result.data[0]).toHaveProperty('term');
      expect(result.data[0]).toHaveProperty('arabic');
      expect(result.data[0]).toHaveProperty('definition');
    });

    it('should filter by English term', () => {
      const result = service.getGlossary('sunnah');
      expect(result.data.length).toBeGreaterThanOrEqual(1);
      expect(result.data.some(g => g.term === 'Sunnah')).toBe(true);
    });

    it('should filter by Arabic', () => {
      const result = service.getGlossary('سنة');
      expect(result.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by definition keyword', () => {
      const result = service.getGlossary('pilgrimage');
      expect(result.data.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty for no match', () => {
      expect(service.getGlossary('xyz').data).toHaveLength(0);
    });

    it('should be case-insensitive', () => {
      expect(service.getGlossary('ZAKAT').data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('classifyIslamicContent', () => {
    it('should classify Quran/tafsir', () => {
      const r = service.classifyIslamicContent('Surah Al-Baqarah verse 2:255 tafsir');
      expect(r.category).toBe('quran_tafsir');
      expect(r.tags).toContain('quran');
    });

    it('should classify hadith', () => {
      const r = service.classifyIslamicContent('Sahih Bukhari, narrated, Prophet PBUH said');
      expect(r.category).toBe('hadith');
    });

    it('should classify fiqh', () => {
      const r = service.classifyIslamicContent('The Hanafi fiqh ruling says halal and permissible');
      expect(r.category).toBe('fiqh');
    });

    it('should classify seerah', () => {
      const r = service.classifyIslamicContent('The seerah of Prophet Muhammad, hijrah from Mecca');
      expect(r.category).toBe('seerah');
    });

    it('should classify dawah', () => {
      const r = service.classifyIslamicContent('Dawah for reverts, shahada guidance');
      expect(r.category).toBe('dawah');
    });

    it('should classify worship', () => {
      const r = service.classifyIslamicContent('Dhikr and dua during salah Ramadan fasting');
      expect(r.category).toBe('worship');
    });

    it('should classify lifestyle', () => {
      const r = service.classifyIslamicContent('Muslim lifestyle, modest hijab, halal food');
      expect(r.category).toBe('lifestyle');
    });

    it('should return null for non-Islamic', () => {
      const r = service.classifyIslamicContent('I went to the store');
      expect(r.category).toBeNull();
    });

    it('should handle empty', () => {
      expect(service.classifyIslamicContent('').category).toBeNull();
    });
  });

  describe('detectHadithGrade', () => {
    it('should detect Sahih Bukhari', () => {
      const r = service.detectHadithGrade('Sahih Bukhari #1234');
      expect(r.grade).toBe('sahih');
      expect(r.collection).toBe('Sahih al-Bukhari');
    });

    it('should detect Sahih Muslim', () => {
      const r = service.detectHadithGrade('Sahih Muslim narrates');
      expect(r.grade).toBe('sahih');
      expect(r.collection).toBe('Sahih Muslim');
    });

    it('should detect Tirmidhi', () => {
      const r = service.detectHadithGrade('Tirmidhi reports');
      expect(r.grade).toBe('hasan');
    });

    it('should detect weak hadith', () => {
      const r = service.detectHadithGrade("da'if narration");
      expect(r.grade).toBe("da'if");
    });

    it('should detect fabricated', () => {
      const r = service.detectHadithGrade('mawdu fabricated');
      expect(r.grade).toBe('mawdu');
    });

    it('should return null for unknown', () => {
      const r = service.detectHadithGrade('Someone told me');
      expect(r.grade).toBeNull();
    });

    it('should handle empty', () => {
      expect(service.detectHadithGrade('').grade).toBeNull();
    });
  });
});
