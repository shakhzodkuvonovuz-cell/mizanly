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
            toggleHadithBookmark: jest.fn(),
            followMosque: jest.fn(),
            getFollowedMosqueTimes: jest.fn(),
            getCommunityDhikrTotal: jest.fn(),
            getGlossary: jest.fn(),
            classifyIslamicContent: jest.fn(),
            detectHadithGrade: jest.fn(),
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

      await controller.completeDailyTask(userId, { taskType: 'DHIKR' });

      expect(service.completeDailyTask).toHaveBeenCalledWith(userId, 'DHIKR');
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
      const body = { date: '2026-03-01', isFasting: true, fastType: 'RAMADAN' };
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

  // ── T11 rows 1-49: Missing controller delegation tests ──

  describe('getHadiths', () => {
    it('should call islamicService.getHadiths with parsed cursor', () => {
      service.getHadiths.mockReturnValue({ data: [], cursor: undefined, hasMore: false } as any);
      const result = controller.getHadiths('10');
      expect(service.getHadiths).toHaveBeenCalledWith(10);
      expect(result).toEqual(expect.objectContaining({ hasMore: false }));
    });

    it('should pass undefined cursor when not provided', () => {
      service.getHadiths.mockReturnValue({ data: [], hasMore: false } as any);
      controller.getHadiths();
      expect(service.getHadiths).toHaveBeenCalledWith(undefined);
    });
  });

  describe('bookmarkHadith', () => {
    it('should call islamicService.toggleHadithBookmark with userId and id', async () => {
      service.toggleHadithBookmark.mockResolvedValue({ bookmarked: true } as any);
      const result = await controller.bookmarkHadith(5, userId);
      expect(service.toggleHadithBookmark).toHaveBeenCalledWith(userId, 5);
      expect(result).toEqual({ bookmarked: true });
    });
  });

  describe('followMosque', () => {
    it('should call islamicService.followMosque with userId and body fields', async () => {
      service.followMosque.mockResolvedValue({ followed: true } as any);
      const result = await controller.followMosque(userId, { mosqueName: 'Al-Masjid', lat: 24.7, lng: 46.6 } as any);
      expect(service.followMosque).toHaveBeenCalledWith(userId, 'Al-Masjid', 24.7, 46.6);
      expect(result).toEqual({ followed: true });
    });
  });

  describe('getMyMosqueTimes', () => {
    it('should call islamicService.getFollowedMosqueTimes with userId', async () => {
      service.getFollowedMosqueTimes.mockResolvedValue({ fajr: '05:00' } as any);
      const result = await controller.getMyMosqueTimes(userId);
      expect(service.getFollowedMosqueTimes).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expect.objectContaining({ fajr: '05:00' }));
    });
  });

  describe('getPrayerNotificationSettings', () => {
    it('should call islamicService.getPrayerNotificationSettings with userId', async () => {
      service.getPrayerNotificationSettings.mockResolvedValue({ fajrEnabled: true } as any);
      const result = await controller.getPrayerNotificationSettings(userId);
      expect(service.getPrayerNotificationSettings).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expect.objectContaining({ fajrEnabled: true }));
    });
  });

  describe('updatePrayerNotificationSettings', () => {
    it('should call islamicService.updatePrayerNotificationSettings with userId and dto', async () => {
      const dto = { fajrEnabled: false };
      service.updatePrayerNotificationSettings.mockResolvedValue({ fajrEnabled: false } as any);
      const result = await controller.updatePrayerNotificationSettings(userId, dto as any);
      expect(service.updatePrayerNotificationSettings).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ fajrEnabled: false }));
    });
  });

  describe('getActiveReadingPlan', () => {
    it('should call islamicService.getActiveReadingPlan with userId', async () => {
      service.getActiveReadingPlan.mockResolvedValue({ id: 'plan-1', isComplete: false } as any);
      const result = await controller.getActiveReadingPlan(userId);
      expect(service.getActiveReadingPlan).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expect.objectContaining({ id: 'plan-1' }));
    });
  });

  describe('getReadingPlanHistory', () => {
    it('should call islamicService.getReadingPlanHistory with userId, cursor, and limit', async () => {
      service.getReadingPlanHistory.mockResolvedValue({ data: [], meta: { hasMore: false } } as any);
      const result = await controller.getReadingPlanHistory(userId, 'plan-0', 10);
      expect(service.getReadingPlanHistory).toHaveBeenCalledWith(userId, 'plan-0', 10);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('updateReadingPlan', () => {
    it('should call islamicService.updateReadingPlan with userId, planId, and dto', async () => {
      const dto = { currentPage: 50 };
      service.updateReadingPlan.mockResolvedValue({ id: 'plan-1', currentPage: 50 } as any);
      const result = await controller.updateReadingPlan(userId, 'plan-1', dto as any);
      expect(service.updateReadingPlan).toHaveBeenCalledWith(userId, 'plan-1', dto);
      expect(result).toEqual(expect.objectContaining({ currentPage: 50 }));
    });
  });

  describe('getQuranVerses', () => {
    it('should call islamicService.getQuranVerses with surahNumber and translation', async () => {
      service.getQuranVerses.mockResolvedValue([{ ayah: 1, text: 'Bismillah' }] as any);
      const result = await controller.getQuranVerses(1, 'en');
      expect(service.getQuranVerses).toHaveBeenCalledWith(1, 'en');
      expect(result).toHaveLength(1);
    });
  });

  describe('getQuranVerse', () => {
    it('should call islamicService.getQuranVerse with surahNumber, ayahNumber, translation', async () => {
      service.getQuranVerse.mockResolvedValue({ surah: 2, ayah: 255, text: 'Ayat al-Kursi' } as any);
      const result = await controller.getQuranVerse(2, 255, 'en');
      expect(service.getQuranVerse).toHaveBeenCalledWith(2, 255, 'en');
      expect(result).toEqual(expect.objectContaining({ surah: 2, ayah: 255 }));
    });
  });

  describe('getQuranJuz', () => {
    it('should call islamicService.getQuranJuz with juzNumber and translation', async () => {
      service.getQuranJuz.mockResolvedValue([{ surah: 78, ayah: 1 }] as any);
      const result = await controller.getQuranJuz(30, 'en');
      expect(service.getQuranJuz).toHaveBeenCalledWith(30, 'en');
      expect(result).toHaveLength(1);
    });
  });

  describe('getRandomAyah', () => {
    it('should call islamicService.getRandomAyah with translation', async () => {
      service.getRandomAyah.mockResolvedValue({ surah: 36, ayah: 1 } as any);
      const result = await controller.getRandomAyah('en');
      expect(service.getRandomAyah).toHaveBeenCalledWith('en');
      expect(result).toEqual(expect.objectContaining({ surah: 36 }));
    });
  });

  describe('createCampaign', () => {
    it('should call islamicService.createCampaign with userId and dto', async () => {
      const dto = { title: 'Gaza Relief', goalAmount: 10000 };
      service.createCampaign.mockResolvedValue({ id: 'c-1', title: 'Gaza Relief' } as any);
      const result = await controller.createCampaign(userId, dto as any);
      expect(service.createCampaign).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ title: 'Gaza Relief' }));
    });
  });

  describe('listCampaigns', () => {
    it('should call islamicService.listCampaigns with cursor and limit', async () => {
      service.listCampaigns.mockResolvedValue({ data: [], meta: { hasMore: false } } as any);
      const result = await controller.listCampaigns('c-0', 10);
      expect(service.listCampaigns).toHaveBeenCalledWith('c-0', 10);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('getCampaign', () => {
    it('should call islamicService.getCampaign with id', async () => {
      service.getCampaign.mockResolvedValue({ id: 'c-1', title: 'Gaza Relief' } as any);
      const result = await controller.getCampaign('c-1');
      expect(service.getCampaign).toHaveBeenCalledWith('c-1');
      expect(result).toEqual(expect.objectContaining({ id: 'c-1' }));
    });
  });

  describe('getMyDonations', () => {
    it('should call islamicService.getMyDonations with userId and cursor', async () => {
      service.getMyDonations.mockResolvedValue({ data: [], meta: { hasMore: false } } as any);
      const result = await controller.getMyDonations(userId, 'd-0');
      expect(service.getMyDonations).toHaveBeenCalledWith(userId, 'd-0');
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('getHajjProgress', () => {
    it('should call islamicService.getHajjProgress with userId', async () => {
      service.getHajjProgress.mockResolvedValue({ year: 2026, completedSteps: 3 } as any);
      const result = await controller.getHajjProgress(userId);
      expect(service.getHajjProgress).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expect.objectContaining({ year: 2026 }));
    });
  });

  describe('createHajjProgress', () => {
    it('should call islamicService.createHajjProgress with userId and dto', async () => {
      const dto = { year: 2026 };
      service.createHajjProgress.mockResolvedValue({ id: 'hp-1', year: 2026 } as any);
      const result = await controller.createHajjProgress(userId, dto as any);
      expect(service.createHajjProgress).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ year: 2026 }));
    });
  });

  describe('updateHajjProgress', () => {
    it('should call islamicService.updateHajjProgress with userId, id, and dto', async () => {
      const dto = { step: 'tawaf', completed: true };
      service.updateHajjProgress.mockResolvedValue({ updated: true } as any);
      const result = await controller.updateHajjProgress(userId, 'hp-1', dto as any);
      expect(service.updateHajjProgress).toHaveBeenCalledWith(userId, 'hp-1', dto);
      expect(result).toEqual({ updated: true });
    });
  });

  describe('getTafsirSources', () => {
    it('should call islamicService.getTafsirSources', async () => {
      service.getTafsirSources.mockResolvedValue([{ name: 'Ibn Kathir' }] as any);
      const result = await controller.getTafsirSources();
      expect(service.getTafsirSources).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('getScholarVerificationStatus', () => {
    it('should call islamicService.getScholarVerificationStatus with userId', async () => {
      service.getScholarVerificationStatus.mockResolvedValue({ status: 'PENDING' } as any);
      const result = await controller.getScholarVerificationStatus(userId);
      expect(service.getScholarVerificationStatus).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expect.objectContaining({ status: 'PENDING' }));
    });
  });

  describe('getContentFilterSettings', () => {
    it('should call islamicService.getContentFilterSettings with userId', async () => {
      service.getContentFilterSettings.mockResolvedValue({ strictness: 'MODERATE' } as any);
      const result = await controller.getContentFilterSettings(userId);
      expect(service.getContentFilterSettings).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expect.objectContaining({ strictness: 'MODERATE' }));
    });
  });

  describe('updateContentFilterSettings', () => {
    it('should call islamicService.updateContentFilterSettings with userId and dto', async () => {
      const dto = { strictness: 'STRICT' };
      service.updateContentFilterSettings.mockResolvedValue({ strictness: 'STRICT' } as any);
      const result = await controller.updateContentFilterSettings(userId, dto as any);
      expect(service.updateContentFilterSettings).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ strictness: 'STRICT' }));
    });
  });

  describe('saveDhikrSession', () => {
    it('should call islamicService.saveDhikrSession with userId and dto', async () => {
      const dto = { dhikrType: 'SubhanAllah', count: 33 };
      service.saveDhikrSession.mockResolvedValue({ id: 'ds-1' } as any);
      const result = await controller.saveDhikrSession(userId, dto as any);
      expect(service.saveDhikrSession).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ id: 'ds-1' }));
    });
  });

  describe('getCommunityDhikrTotal', () => {
    it('should call islamicService.getCommunityDhikrTotal', async () => {
      service.getCommunityDhikrTotal.mockResolvedValue({ allTime: 1000000, today: 5000 } as any);
      const result = await controller.getCommunityDhikrTotal();
      expect(service.getCommunityDhikrTotal).toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({ allTime: 1000000 }));
    });
  });

  describe('getDhikrStats', () => {
    it('should call islamicService.getDhikrStats with userId', async () => {
      service.getDhikrStats.mockResolvedValue({ totalCount: 9900 } as any);
      const result = await controller.getDhikrStats(userId);
      expect(service.getDhikrStats).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expect.objectContaining({ totalCount: 9900 }));
    });
  });

  describe('getDhikrLeaderboard', () => {
    it('should call islamicService.getDhikrLeaderboard with period', async () => {
      service.getDhikrLeaderboard.mockResolvedValue([{ userId: 'u-1', count: 100 }] as any);
      const result = await controller.getDhikrLeaderboard('weekly');
      expect(service.getDhikrLeaderboard).toHaveBeenCalledWith('weekly');
      expect(result).toHaveLength(1);
    });
  });

  describe('createDhikrChallenge', () => {
    it('should call islamicService.createDhikrChallenge with userId and dto', async () => {
      const dto = { name: '10K SubhanAllah', targetCount: 10000 };
      service.createDhikrChallenge.mockResolvedValue({ id: 'dc-1' } as any);
      const result = await controller.createDhikrChallenge(userId, dto as any);
      expect(service.createDhikrChallenge).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ id: 'dc-1' }));
    });
  });

  describe('listActiveChallenges', () => {
    it('should call islamicService.listActiveChallenges with cursor', async () => {
      service.listActiveChallenges.mockResolvedValue([{ id: 'dc-1' }] as any);
      const result = await controller.listActiveChallenges('dc-0');
      expect(service.listActiveChallenges).toHaveBeenCalledWith('dc-0');
      expect(result).toHaveLength(1);
    });
  });

  describe('getChallengeDetail', () => {
    it('should call islamicService.getChallengeDetail with id', async () => {
      service.getChallengeDetail.mockResolvedValue({ id: 'dc-1', name: '10K Challenge' } as any);
      const result = await controller.getChallengeDetail('dc-1');
      expect(service.getChallengeDetail).toHaveBeenCalledWith('dc-1');
      expect(result).toEqual(expect.objectContaining({ name: '10K Challenge' }));
    });
  });

  describe('joinChallenge', () => {
    it('should call islamicService.joinChallenge with userId and id', async () => {
      service.joinChallenge.mockResolvedValue({ joined: true } as any);
      const result = await controller.joinChallenge(userId, 'dc-1');
      expect(service.joinChallenge).toHaveBeenCalledWith(userId, 'dc-1');
      expect(result).toEqual({ joined: true });
    });
  });

  describe('getCurrentPrayerWindow', () => {
    it('should call islamicService.getCurrentPrayerWindow with times', async () => {
      service.getCurrentPrayerWindow.mockReturnValue({ currentPrayer: 'dhuhr', nextPrayer: 'asr', minutesUntilNext: 120 } as any);
      const result = await controller.getCurrentPrayerWindow('05:00', '12:00', '15:30', '18:00', '19:30');
      expect(service.getCurrentPrayerWindow).toHaveBeenCalledWith({ fajr: '05:00', dhuhr: '12:00', asr: '15:30', maghrib: '18:00', isha: '19:30' });
      expect(result).toEqual(expect.objectContaining({ currentPrayer: 'dhuhr' }));
    });

    it('should throw NotFoundException for invalid time format', async () => {
      await expect(controller.getCurrentPrayerWindow('invalid', '12:00', '15:30', '18:00', '19:30')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getFastingLog', () => {
    it('should call islamicService.getFastingLog with userId and month', async () => {
      service.getFastingLog.mockResolvedValue([{ date: '2026-03-01', isFasting: true }] as any);
      const result = await controller.getFastingLog(userId, '2026-03');
      expect(service.getFastingLog).toHaveBeenCalledWith(userId, '2026-03');
      expect(result).toHaveLength(1);
    });
  });

  describe('getFastingStats', () => {
    it('should call islamicService.getFastingStats with userId', async () => {
      service.getFastingStats.mockResolvedValue({ totalFasts: 25, streak: 5 } as any);
      const result = await controller.getFastingStats(userId);
      expect(service.getFastingStats).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expect.objectContaining({ totalFasts: 25 }));
    });
  });

  describe('getDuas', () => {
    it('should call islamicService.getDuasByCategory with category', async () => {
      service.getDuasByCategory.mockReturnValue([{ id: 'dua-1' }] as any);
      const result = await controller.getDuas('morning');
      expect(service.getDuasByCategory).toHaveBeenCalledWith('morning');
      expect(result).toHaveLength(1);
    });
  });

  describe('getDuaOfTheDay', () => {
    it('should call islamicService.getDuaOfTheDay', async () => {
      service.getDuaOfTheDay.mockReturnValue({ id: 'dua-1', title: 'Morning Dua' } as any);
      const result = await controller.getDuaOfTheDay();
      expect(service.getDuaOfTheDay).toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({ title: 'Morning Dua' }));
    });
  });

  describe('getDuaCategories', () => {
    it('should call islamicService.getDuaCategories', async () => {
      service.getDuaCategories.mockReturnValue(['morning', 'evening', 'travel'] as any);
      const result = await controller.getDuaCategories();
      expect(service.getDuaCategories).toHaveBeenCalled();
      expect(result).toHaveLength(3);
    });
  });

  describe('getBookmarkedDuas', () => {
    it('should call islamicService.getBookmarkedDuas with userId', async () => {
      service.getBookmarkedDuas.mockResolvedValue([{ id: 'dua-1' }] as any);
      const result = await controller.getBookmarkedDuas(userId);
      expect(service.getBookmarkedDuas).toHaveBeenCalledWith(userId);
      expect(result).toHaveLength(1);
    });
  });

  describe('unbookmarkDua', () => {
    it('should call islamicService.unbookmarkDua with userId and duaId', async () => {
      service.unbookmarkDua.mockResolvedValue({ unbookmarked: true } as any);
      const result = await controller.unbookmarkDua(userId, 'dua-1');
      expect(service.unbookmarkDua).toHaveBeenCalledWith(userId, 'dua-1');
      expect(result).toEqual({ unbookmarked: true });
    });
  });

  describe('getAllNames', () => {
    it('should call islamicService.getAllNamesOfAllah', async () => {
      service.getAllNamesOfAllah.mockReturnValue([{ number: 1, name: 'Ar-Rahman' }] as any);
      const result = await controller.getAllNames();
      expect(service.getAllNamesOfAllah).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('getDailyName', () => {
    it('should call islamicService.getDailyNameOfAllah', async () => {
      service.getDailyNameOfAllah.mockReturnValue({ number: 1, name: 'Ar-Rahman' } as any);
      const result = await controller.getDailyName();
      expect(service.getDailyNameOfAllah).toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({ number: 1 }));
    });
  });

  describe('getHifzProgress', () => {
    it('should call islamicService.getHifzProgress with userId', async () => {
      service.getHifzProgress.mockResolvedValue([{ surahNum: 1, status: 'MEMORIZED' }] as any);
      const result = await controller.getHifzProgress(userId);
      expect(service.getHifzProgress).toHaveBeenCalledWith(userId);
      expect(result).toHaveLength(1);
    });
  });

  describe('getHifzStats', () => {
    it('should call islamicService.getHifzStats with userId', async () => {
      service.getHifzStats.mockResolvedValue({ memorized: 10, inProgress: 5 } as any);
      const result = await controller.getHifzStats(userId);
      expect(service.getHifzStats).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expect.objectContaining({ memorized: 10 }));
    });
  });

  describe('getHifzReviewSchedule', () => {
    it('should call islamicService.getHifzReviewSchedule with userId', async () => {
      service.getHifzReviewSchedule.mockResolvedValue([{ surahNum: 36, nextReview: '2026-04-10' }] as any);
      const result = await controller.getHifzReviewSchedule(userId);
      expect(service.getHifzReviewSchedule).toHaveBeenCalledWith(userId);
      expect(result).toHaveLength(1);
    });
  });

  describe('getDailyTasksToday', () => {
    it('should call islamicService.getDailyTasksToday with userId', async () => {
      service.getDailyTasksToday.mockResolvedValue({ dhikr: true, quran: false } as any);
      const result = await controller.getDailyTasksToday(userId);
      expect(service.getDailyTasksToday).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expect.objectContaining({ dhikr: true }));
    });
  });

  describe('getGlossary', () => {
    it('should call islamicService.getGlossary with query', () => {
      service.getGlossary.mockReturnValue([{ term: 'Salah', definition: 'Prayer' }] as any);
      const result = controller.getGlossary('salah');
      expect(service.getGlossary).toHaveBeenCalledWith('salah');
      expect(result).toHaveLength(1);
    });

    it('should call getGlossary without query', () => {
      service.getGlossary.mockReturnValue([{ term: 'Salah' }] as any);
      controller.getGlossary();
      expect(service.getGlossary).toHaveBeenCalledWith(undefined);
    });
  });

  describe('classifyContent', () => {
    it('should call islamicService.classifyIslamicContent with content', () => {
      service.classifyIslamicContent.mockReturnValue({ category: 'quran', confidence: 0.95, tags: ['quran'] } as any);
      const result = controller.classifyContent({ content: 'Bismillah ar-Rahman ar-Raheem' } as any);
      expect(service.classifyIslamicContent).toHaveBeenCalledWith('Bismillah ar-Rahman ar-Raheem');
      expect(result).toEqual(expect.objectContaining({ category: 'quran', confidence: 0.95 }));
    });
  });

  describe('detectHadithGrade', () => {
    it('should call islamicService.detectHadithGrade with content', () => {
      service.detectHadithGrade.mockReturnValue({ grade: 'sahih', collection: 'Bukhari' } as any);
      const result = controller.detectHadithGrade({ content: 'The Prophet said...' } as any);
      expect(service.detectHadithGrade).toHaveBeenCalledWith('The Prophet said...');
      expect(result).toEqual(expect.objectContaining({ grade: 'sahih', collection: 'Bukhari' }));
    });
  });
});
