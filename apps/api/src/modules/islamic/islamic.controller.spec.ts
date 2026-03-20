import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { IslamicController } from './islamic.controller';
import { IslamicService } from './islamic.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('IslamicController', () => {
  let controller: IslamicController;
  let service: jest.Mocked<IslamicService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IslamicController],
      providers: [
        ...globalMockProviders,
        {
          provide: IslamicService,
          useValue: {
            getPrayerTimes: jest.fn(),
            getPrayerMethods: jest.fn(),
            getDailyHadith: jest.fn(),
            getHadithById: jest.fn(),
            getHadiths: jest.fn(),
            getNearbyMosques: jest.fn(),
            calculateZakat: jest.fn(),
            getRamadanInfo: jest.fn(),
            getPrayerNotificationSettings: jest.fn(),
            updatePrayerNotificationSettings: jest.fn(),
            createReadingPlan: jest.fn(),
            getActiveReadingPlan: jest.fn(),
            getReadingPlanHistory: jest.fn(),
            updateReadingPlan: jest.fn(),
            deleteReadingPlan: jest.fn(),
            getQuranChapters: jest.fn(),
            getQuranChapter: jest.fn(),
            getQuranVerses: jest.fn(),
            getQuranVerse: jest.fn(),
            getQuranJuz: jest.fn(),
            searchQuran: jest.fn(),
            getRandomAyah: jest.fn(),
            createCampaign: jest.fn(),
            listCampaigns: jest.fn(),
            getCampaign: jest.fn(),
            createDonation: jest.fn(),
            getMyDonations: jest.fn(),
            getHajjGuide: jest.fn(),
            getHajjProgress: jest.fn(),
            createHajjProgress: jest.fn(),
            updateHajjProgress: jest.fn(),
            getTafsirSources: jest.fn(),
            getTafsir: jest.fn(),
            applyScholarVerification: jest.fn(),
            getScholarVerificationStatus: jest.fn(),
            getContentFilterSettings: jest.fn(),
            updateContentFilterSettings: jest.fn(),
            saveDhikrSession: jest.fn(),
            getDhikrStats: jest.fn(),
            getDhikrLeaderboard: jest.fn(),
            createDhikrChallenge: jest.fn(),
            listActiveChallenges: jest.fn(),
            getChallengeDetail: jest.fn(),
            joinChallenge: jest.fn(),
            contributeToChallenge: jest.fn(),
            getCurrentPrayerWindow: jest.fn(),
            logFast: jest.fn(),
            getFastingLog: jest.fn(),
            getFastingStats: jest.fn(),
            getDuasByCategory: jest.fn(),
            getDuaOfTheDay: jest.fn(),
            getDuaCategories: jest.fn(),
            getBookmarkedDuas: jest.fn(),
            getDuaById: jest.fn(),
            bookmarkDua: jest.fn(),
            unbookmarkDua: jest.fn(),
            getAllNamesOfAllah: jest.fn(),
            getDailyNameOfAllah: jest.fn(),
            getNameOfAllahByNumber: jest.fn(),
            getHifzProgress: jest.fn(),
            updateHifzProgress: jest.fn(),
            getHifzStats: jest.fn(),
            getHifzReviewSchedule: jest.fn(),
            getDailyBriefing: jest.fn(),
            completeDailyTask: jest.fn(),
            getDailyTasksToday: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(IslamicController);
    service = module.get(IslamicService) as jest.Mocked<IslamicService>;
  });

  afterEach(() => jest.clearAllMocks());

  // ── Prayer Times ──

  describe('getPrayerTimes', () => {
    it('should call islamicService.getPrayerTimes with query params', async () => {
      service.getPrayerTimes.mockResolvedValue({ fajr: '05:00', dhuhr: '12:00' } as any);

      const result = await controller.getPrayerTimes({ lat: 24.7, lng: 46.6, method: 'MWL' } as any);

      expect(service.getPrayerTimes).toHaveBeenCalledWith({ lat: 24.7, lng: 46.6, method: 'MWL' });
      expect(result).toEqual(expect.objectContaining({ fajr: '05:00' }));
    });
  });

  describe('getPrayerMethods', () => {
    it('should call islamicService.getPrayerMethods', () => {
      service.getPrayerMethods.mockReturnValue([{ id: 'MWL', name: 'Muslim World League' }] as any);

      const result = controller.getPrayerMethods();

      expect(service.getPrayerMethods).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  // ── Hadith ──

  describe('getDailyHadith', () => {
    it('should call islamicService.getDailyHadith', () => {
      service.getDailyHadith.mockReturnValue({ id: 1, text: 'Hadith text' } as any);

      const result = controller.getDailyHadith();

      expect(service.getDailyHadith).toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({ id: 1 }));
    });
  });

  describe('getHadithById', () => {
    it('should call islamicService.getHadithById with parsed id', () => {
      service.getHadithById.mockReturnValue({ id: 5, text: 'Hadith 5' } as any);

      const result = controller.getHadithById(5);

      expect(service.getHadithById).toHaveBeenCalledWith(5);
      expect(result).toEqual(expect.objectContaining({ id: 5 }));
    });
  });

  // ── Mosques ──

  describe('getNearbyMosques', () => {
    it('should call islamicService.getNearbyMosques with lat, lng, radius', async () => {
      service.getNearbyMosques.mockResolvedValue([{ id: 'm-1', name: 'Al-Masjid' }] as any);

      const result = await controller.getNearbyMosques({ lat: 24.7, lng: 46.6, radius: 5 } as any);

      expect(service.getNearbyMosques).toHaveBeenCalledWith(24.7, 46.6, 5);
      expect(result).toHaveLength(1);
    });
  });

  // ── Zakat ──

  describe('calculateZakat', () => {
    it('should call islamicService.calculateZakat with query params', () => {
      service.calculateZakat.mockReturnValue({ totalZakat: 250, meetsNisab: true } as any);

      const result = controller.calculateZakat({ cash: 5000, gold: 50, silver: 200, investments: 10000, debts: 2000 } as any);

      expect(service.calculateZakat).toHaveBeenCalledWith({ cash: 5000, gold: 50, silver: 200, investments: 10000, debts: 2000 });
      expect(result).toEqual(expect.objectContaining({ meetsNisab: true }));
    });
  });

  // ── Ramadan ──

  describe('getRamadanInfo', () => {
    it('should call islamicService.getRamadanInfo with query params', async () => {
      service.getRamadanInfo.mockResolvedValue({ startDate: '2026-02-18' } as any);

      const result = await controller.getRamadanInfo({ year: 2026, lat: 24.7, lng: 46.6 } as any);

      expect(service.getRamadanInfo).toHaveBeenCalledWith({ year: 2026, lat: 24.7, lng: 46.6 });
      expect(result).toEqual(expect.objectContaining({ startDate: '2026-02-18' }));
    });
  });

  // ── Quran Plans ──

  describe('createReadingPlan', () => {
    it('should call islamicService.createReadingPlan with userId and dto', async () => {
      const dto = { name: '30-day plan', pagesPerDay: 20 };
      service.createReadingPlan.mockResolvedValue({ id: 'plan-1' } as any);

      const result = await controller.createReadingPlan(userId, dto as any);

      expect(service.createReadingPlan).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ id: 'plan-1' }));
    });
  });

  describe('deleteReadingPlan', () => {
    it('should call islamicService.deleteReadingPlan with userId and planId', async () => {
      service.deleteReadingPlan.mockResolvedValue({ deleted: true } as any);

      await controller.deleteReadingPlan(userId, 'plan-1');

      expect(service.deleteReadingPlan).toHaveBeenCalledWith(userId, 'plan-1');
    });
  });

  // ── Quran Text ──

  describe('getQuranChapters', () => {
    it('should call islamicService.getQuranChapters', () => {
      service.getQuranChapters.mockReturnValue([{ number: 1, name: 'Al-Fatihah' }] as any);

      const result = controller.getQuranChapters();

      expect(service.getQuranChapters).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('searchQuran', () => {
    it('should call islamicService.searchQuran with query, translation, and parsed limit', async () => {
      service.searchQuran.mockResolvedValue({ results: [] } as any);

      await controller.searchQuran('patience', 'en', '10');

      expect(service.searchQuran).toHaveBeenCalledWith('patience', 'en', 10);
    });
  });

  // ── Charity ──

  describe('createDonation', () => {
    it('should call islamicService.createDonation with userId and dto', async () => {
      const dto = { campaignId: 'c-1', amount: 100 };
      service.createDonation.mockResolvedValue({ id: 'don-1' } as any);

      const result = await controller.createDonation(userId, dto as any);

      expect(service.createDonation).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ id: 'don-1' }));
    });
  });

  // ── Hajj ──

  describe('getHajjGuide', () => {
    it('should call islamicService.getHajjGuide', async () => {
      service.getHajjGuide.mockResolvedValue({ steps: [] } as any);

      await controller.getHajjGuide();

      expect(service.getHajjGuide).toHaveBeenCalled();
    });
  });

  // ── Duas ──

  describe('getDuaById', () => {
    it('should return dua when found', async () => {
      service.getDuaById.mockReturnValue({ id: 'dua-1', title: 'Morning Dua' } as any);

      const result = await controller.getDuaById('dua-1');

      expect(service.getDuaById).toHaveBeenCalledWith('dua-1');
      expect(result).toEqual(expect.objectContaining({ title: 'Morning Dua' }));
    });

    it('should throw NotFoundException when dua not found', async () => {
      service.getDuaById.mockReturnValue(null as any);

      await expect(controller.getDuaById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('bookmarkDua', () => {
    it('should call islamicService.bookmarkDua with userId and duaId', async () => {
      service.bookmarkDua.mockResolvedValue({ bookmarked: true } as any);

      await controller.bookmarkDua(userId, 'dua-1');

      expect(service.bookmarkDua).toHaveBeenCalledWith(userId, 'dua-1');
    });
  });

  // ── Names of Allah ──

  describe('getNameByNumber', () => {
    it('should return name when found', async () => {
      service.getNameOfAllahByNumber.mockReturnValue({ number: 1, name: 'Ar-Rahman' } as any);

      const result = await controller.getNameByNumber(1);

      expect(service.getNameOfAllahByNumber).toHaveBeenCalledWith(1);
      expect(result).toEqual(expect.objectContaining({ name: 'Ar-Rahman' }));
    });

    it('should throw NotFoundException when name not found', async () => {
      service.getNameOfAllahByNumber.mockReturnValue(null as any);

      await expect(controller.getNameByNumber(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ── Hifz ──

  describe('updateHifzProgress', () => {
    it('should call islamicService.updateHifzProgress with userId, surahNum, and status', async () => {
      service.updateHifzProgress.mockResolvedValue({ surahNum: 1, status: 'memorized' } as any);

      await controller.updateHifzProgress(userId, 1, { status: 'memorized' });

      expect(service.updateHifzProgress).toHaveBeenCalledWith(userId, 1, 'memorized');
    });
  });

  // ── Daily Briefing ──

  describe('getDailyBriefing', () => {
    it('should call islamicService.getDailyBriefing with userId and parsed lat/lng', async () => {
      service.getDailyBriefing.mockResolvedValue({ prayerTimes: {}, hadith: {} } as any);

      await controller.getDailyBriefing(userId, '24.7', '46.6');

      expect(service.getDailyBriefing).toHaveBeenCalledWith(userId, 24.7, 46.6);
    });

    it('should pass undefined lat/lng when not provided', async () => {
      service.getDailyBriefing.mockResolvedValue({ prayerTimes: {} } as any);

      await controller.getDailyBriefing(userId);

      expect(service.getDailyBriefing).toHaveBeenCalledWith(userId, undefined, undefined);
    });
  });

  describe('completeDailyTask', () => {
    it('should call islamicService.completeDailyTask with userId and taskType', async () => {
      service.completeDailyTask.mockResolvedValue({ completed: true } as any);

      await controller.completeDailyTask(userId, { taskType: 'dhikr' });

      expect(service.completeDailyTask).toHaveBeenCalledWith(userId, 'dhikr');
    });
  });

  // ── Dhikr ──

  describe('contributeToChallenge', () => {
    it('should call islamicService.contributeToChallenge with userId, id, and count', async () => {
      service.contributeToChallenge.mockResolvedValue({ contributed: true } as any);

      await controller.contributeToChallenge(userId, 'ch-1', { count: 33 } as any);

      expect(service.contributeToChallenge).toHaveBeenCalledWith(userId, 'ch-1', 33);
    });
  });

  // ── Fasting ──

  describe('logFast', () => {
    it('should call islamicService.logFast with userId and body', async () => {
      const body = { date: '2026-03-01', isFasting: true, fastType: 'ramadan' };
      service.logFast.mockResolvedValue({ logged: true } as any);

      await controller.logFast(userId, body as any);

      expect(service.logFast).toHaveBeenCalledWith(userId, body);
    });
  });

  // ── Tafsir ──

  describe('getTafsir', () => {
    it('should call islamicService.getTafsir with parsed surah, verse, and source', async () => {
      service.getTafsir.mockResolvedValue({ text: 'Tafsir text' } as any);

      await controller.getTafsir('2', '255', 'ibn-kathir');

      expect(service.getTafsir).toHaveBeenCalledWith(2, 255, 'ibn-kathir');
    });
  });

  // ── Scholar Verification ──

  describe('applyScholarVerification', () => {
    it('should call islamicService.applyScholarVerification with userId and dto', async () => {
      const dto = { specialization: 'fiqh', institution: 'Al-Azhar' };
      service.applyScholarVerification.mockResolvedValue({ id: 'sv-1', status: 'PENDING' } as any);

      const result = await controller.applyScholarVerification(userId, dto as any);

      expect(service.applyScholarVerification).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ status: 'PENDING' }));
    });
  });
});
