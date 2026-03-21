import { api, qs } from './api';
import type {
  PrayerTimes,
  PrayerMethodInfo,
  Hadith,
  Mosque,
  ZakatCalculationInput,
  ZakatCalculationResult,
  RamadanInfo,
  QuranSurah,
  QuranVerse,
  PrayerNotificationSetting,
  QuranReadingPlan,
  CharityCampaign,
  CharityDonation,
  HajjStep,
  HajjProgress,
  TafsirEntry,
  ScholarVerification,
  ContentFilterSetting,
  DhikrStats,
  DhikrLeaderboardEntry,
  DhikrChallenge,
  DhikrChallengeDetail,
} from '@/types/islamic';
import type { PaginatedResponse } from '@/types';

export const islamicApi = {
  getPrayerTimes: (lat: number, lng: number, method?: string, date?: string) =>
    api.get<PrayerTimes>(`/islamic/prayer-times${qs({ lat, lng, method, date })}`),

  getPrayerMethods: () => api.get<PrayerMethodInfo[]>('/islamic/prayer-times/methods'),

  getDailyHadith: () => api.get<Hadith>('/islamic/hadith/daily'),

  getHadith: (id: string) => api.get<Hadith>(`/islamic/hadith/${id}`),

  listHadiths: (cursor?: string) =>
    api.get<PaginatedResponse<Hadith>>(`/islamic/hadith${qs({ cursor })}`),

  getMosques: (lat: number, lng: number, radius?: number) =>
    api.get<Mosque[]>(`/islamic/mosques${qs({ lat, lng, radius })}`),

  calculateZakat: (input: ZakatCalculationInput) =>
    api.get<ZakatCalculationResult>(`/islamic/zakat/calculate${qs(input as unknown as Record<string, string | number | undefined>)}`),

  getRamadanInfo: (year?: number, lat?: number, lng?: number) =>
    api.get<RamadanInfo>(`/islamic/ramadan${qs({ year, lat, lng })}`),

  listSurahs: () => api.get<QuranSurah[]>('/islamic/quran/surahs'),

  getVerse: (surahNumber: number, verseNumber: number, translation?: string) =>
    api.get<QuranVerse>(`/islamic/quran/surahs/${surahNumber}/verses/${verseNumber}${qs({ translation })}`),

  getSurahVerses: (surahNumber: number, translation?: string) =>
    api.get<QuranVerse[]>(`/islamic/quran/surahs/${surahNumber}/verses${qs({ translation })}`),

  getPrayerNotificationSettings: () =>
    api.get<PrayerNotificationSetting>('/islamic/prayer-notifications/settings'),

  updatePrayerNotificationSettings: (data: Partial<PrayerNotificationSetting>) =>
    api.patch<PrayerNotificationSetting>('/islamic/prayer-notifications/settings', data),

  createReadingPlan: (planType: string) =>
    api.post<QuranReadingPlan>('/islamic/quran-plans', { planType }),
  getActiveReadingPlan: () =>
    api.get<QuranReadingPlan | null>('/islamic/quran-plans/active'),
  getReadingPlanHistory: (cursor?: string) =>
    api.get<PaginatedResponse<QuranReadingPlan>>(`/islamic/quran-plans/history${cursor ? `?cursor=${cursor}` : ''}`),
  updateReadingPlan: (planId: string, data: { currentJuz?: number; currentPage?: number; isComplete?: boolean }) =>
    api.patch<QuranReadingPlan>(`/islamic/quran-plans/${planId}`, data),
  deleteReadingPlan: (planId: string) =>
    api.delete(`/islamic/quran-plans/${planId}`),

  // ── Charity / Sadaqah ──

  createCampaign: (data: { title: string; description?: string; goalAmount: number; imageUrl?: string }) =>
    api.post<CharityCampaign>('/islamic/charity/campaigns', data),
  listCampaigns: (cursor?: string) =>
    api.get<PaginatedResponse<CharityCampaign>>(`/islamic/charity/campaigns${cursor ? `?cursor=${cursor}` : ''}`),
  getCampaign: (id: string) => api.get<CharityCampaign>(`/islamic/charity/campaigns/${id}`),
  donate: (data: { campaignId?: string; amount: number; currency?: string }) =>
    api.post<CharityDonation>('/islamic/charity/donate', data),
  getMyDonations: (cursor?: string) =>
    api.get<PaginatedResponse<CharityDonation>>(`/islamic/charity/my-donations${cursor ? `?cursor=${cursor}` : ''}`),

  // ── Hajj & Umrah ──

  getHajjGuide: () => api.get<HajjStep[]>('/islamic/hajj/guide'),
  getHajjProgress: () => api.get<HajjProgress | null>('/islamic/hajj/progress'),
  createHajjProgress: (year: number) => api.post<HajjProgress>('/islamic/hajj/progress', { year }),
  updateHajjProgress: (id: string, data: { currentStep?: number; checklistJson?: string; notes?: string }) =>
    api.patch<HajjProgress>(`/islamic/hajj/progress/${id}`, data),

  // ── Tafsir ──

  getTafsir: (surah: number, verse: number, source?: string) =>
    api.get<TafsirEntry>(`/islamic/tafsir/${surah}/${verse}${source ? `?source=${source}` : ''}`),
  getTafsirSources: () =>
    api.get<Array<{ name: string }>>('/islamic/tafsir/sources'),

  // ── Scholar Verification ──

  applyScholarVerification: (data: { institution: string; specialization?: string; madhab?: string; documentUrls: string[] }) =>
    api.post<ScholarVerification>('/islamic/scholar-verification/apply', data),
  getScholarVerificationStatus: () =>
    api.get<ScholarVerification | null>('/islamic/scholar-verification/status'),

  // ── Content Filter ──

  getContentFilterSettings: () =>
    api.get<ContentFilterSetting>('/islamic/content-filter/settings'),
  updateContentFilterSettings: (data: Partial<ContentFilterSetting>) =>
    api.patch<ContentFilterSetting>('/islamic/content-filter/settings', data),

  // ── Dhikr Social ──

  saveDhikrSession: (data: { phrase: string; count: number; target?: number }) =>
    api.post('/islamic/dhikr/sessions', data),
  getDhikrStats: () => api.get<DhikrStats>('/islamic/dhikr/stats'),
  getDhikrLeaderboard: (period?: string) =>
    api.get<DhikrLeaderboardEntry[]>(`/islamic/dhikr/leaderboard${period ? `?period=${period}` : ''}`),
  createDhikrChallenge: (data: { title: string; phrase: string; targetTotal: number; expiresAt?: string }) =>
    api.post<DhikrChallenge>('/islamic/dhikr/challenges', data),
  listDhikrChallenges: (cursor?: string) =>
    api.get<PaginatedResponse<DhikrChallenge>>(`/islamic/dhikr/challenges${cursor ? `?cursor=${cursor}` : ''}`),
  getDhikrChallenge: (id: string) =>
    api.get<DhikrChallengeDetail>(`/islamic/dhikr/challenges/${id}`),
  joinDhikrChallenge: (id: string) =>
    api.post(`/islamic/dhikr/challenges/${id}/join`, {}),
  contributeToDhikrChallenge: (id: string, count: number) =>
    api.post(`/islamic/dhikr/challenges/${id}/contribute`, { count }),

  // ── Dua Collection ──

  getDuas: (category?: string) =>
    api.get(`/islamic/duas${category ? `?category=${category}` : ''}`),
  getDuaOfTheDay: () => api.get('/islamic/duas/daily'),
  getDuaCategories: () => api.get<string[]>('/islamic/duas/categories'),
  getDuaById: (id: string) => api.get(`/islamic/duas/${id}`),
  bookmarkDua: (duaId: string) => api.post(`/islamic/duas/${duaId}/bookmark`, {}),
  unbookmarkDua: (duaId: string) => api.delete(`/islamic/duas/${duaId}/bookmark`),
  getBookmarkedDuas: () => api.get('/islamic/duas/bookmarked'),

  // ── Fasting Tracker ──

  logFast: (data: { date: string; isFasting: boolean; fastType?: string; reason?: string }) =>
    api.post('/islamic/fasting/log', data),
  getFastingLog: (month: string) =>
    api.get(`/islamic/fasting/log?month=${month}`),
  getFastingStats: () => api.get('/islamic/fasting/stats'),

  // ── 99 Names of Allah ──

  getNamesOfAllah: () => api.get('/islamic/names-of-allah'),
  getDailyNameOfAllah: () => api.get('/islamic/names-of-allah/daily'),
  getNameOfAllah: (num: number) => api.get(`/islamic/names-of-allah/${num}`),

  // ── Hifz (Quran Memorization) Tracker ──

  getHifzProgress: () => api.get('/islamic/hifz/progress'),
  updateHifzProgress: (surahNum: number, status: string) =>
    api.patch(`/islamic/hifz/progress/${surahNum}`, { status }),
  getHifzStats: () => api.get('/islamic/hifz/stats'),
  getHifzReviewSchedule: () => api.get('/islamic/hifz/review-schedule'),

  // ── Daily Briefing ──

  getDailyBriefing: (lat?: number, lng?: number) =>
    api.get(`/islamic/daily-briefing${qs({ lat, lng })}`),
  completeDailyTask: (taskType: string) =>
    api.post('/islamic/daily-tasks/complete', { taskType }),
  getDailyTasksToday: () => api.get('/islamic/daily-tasks/today'),
};