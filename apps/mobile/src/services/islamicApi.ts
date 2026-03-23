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

  getCurrentPrayerWindow: (times: Record<string, string>) =>
    api.get<{ currentPrayer: string; nextPrayer: string; timeUntilNext: number }>(`/islamic/prayer-times/current-window${qs(times)}`),

  getDailyHadith: () => api.get<Hadith>('/islamic/hadith/daily'),

  getHadith: (id: string) => api.get<Hadith>(`/islamic/hadith/${id}`),

  listHadiths: (cursor?: string) =>
    api.get<PaginatedResponse<Hadith>>(`/islamic/hadith${qs({ cursor })}`),

  getMosques: (lat: number, lng: number, radius?: number) =>
    api.get<Mosque[]>(`/islamic/mosques${qs({ lat, lng, radius })}`),

  calculateZakat: (input: ZakatCalculationInput) => {
    const params: Record<string, string | number | undefined> = {};
    for (const [k, v] of Object.entries(input)) {
      if (v !== undefined && v !== null) params[k] = v as string | number;
    }
    return api.get<ZakatCalculationResult>(`/islamic/zakat/calculate${qs(params)}`);
  },

  getRamadanInfo: (year?: number, lat?: number, lng?: number) =>
    api.get<RamadanInfo>(`/islamic/ramadan${qs({ year, lat, lng })}`),

  listSurahs: () => api.get<QuranSurah[]>('/islamic/quran/chapters'),

  getSurah: (surahNumber: number) =>
    api.get<QuranSurah>(`/islamic/quran/chapters/${surahNumber}`),

  getVerse: (surahNumber: number, verseNumber: number, translation?: string) =>
    api.get<QuranVerse>(`/islamic/quran/chapters/${surahNumber}/verses/${verseNumber}${qs({ translation })}`),

  getSurahVerses: (surahNumber: number, translation?: string) =>
    api.get<QuranVerse[]>(`/islamic/quran/chapters/${surahNumber}/verses${qs({ translation })}`),

  searchQuran: (query: string) =>
    api.get<{ verses: QuranVerse[] }>(`/islamic/quran/search${qs({ q: query })}`),

  getJuz: (juzNumber: number) =>
    api.get<{ juz: number; verses: QuranVerse[] }>(`/islamic/quran/juz/${juzNumber}`),

  getRandomAyah: () =>
    api.get<QuranVerse>('/islamic/quran/random-ayah'),

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
    api.post<{ id: string }>('/islamic/dhikr/sessions', data),
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
    api.post<{ success: boolean }>(`/islamic/dhikr/challenges/${id}/join`, {}),
  contributeToDhikrChallenge: (id: string, count: number) =>
    api.post<{ success: boolean }>(`/islamic/dhikr/challenges/${id}/contribute`, { count }),

  // ── Dua Collection ──

  getDuas: (category?: string) =>
    api.get<Array<{ id: string; arabic: string; transliteration: string; translation: string; category: string }>>(`/islamic/duas${category ? `?category=${category}` : ''}`),
  getDuaOfTheDay: () => api.get<{ id: string; arabic: string; transliteration: string; translation: string }>('/islamic/duas/daily'),
  getDuaCategories: () => api.get<string[]>('/islamic/duas/categories'),
  getDuaById: (id: string) => api.get<{ id: string; arabic: string; transliteration: string; translation: string; category: string; reference: string }>(`/islamic/duas/${id}`),
  bookmarkDua: (duaId: string) => api.post<{ success: boolean }>(`/islamic/duas/${duaId}/bookmark`, {}),
  unbookmarkDua: (duaId: string) => api.delete<{ success: boolean }>(`/islamic/duas/${duaId}/bookmark`),
  getBookmarkedDuas: () => api.get<Array<{ id: string; arabic: string; translation: string }>>('/islamic/duas/bookmarked'),

  // ── Fasting Tracker ──

  logFast: (data: { date: string; isFasting: boolean; fastType?: string; reason?: string }) =>
    api.post<{ id: string }>('/islamic/fasting/log', data),
  getFastingLog: (month: string) =>
    api.get<Array<{ date: string; isFasting: boolean; fastType?: string }>>(`/islamic/fasting/log?month=${month}`),
  getFastingStats: () => api.get<{ totalDays: number; currentStreak: number }>('/islamic/fasting/stats'),

  // ── 99 Names of Allah ──

  getNamesOfAllah: () => api.get<Array<{ number: number; arabic: string; transliteration: string; meaning: string }>>('/islamic/names-of-allah'),
  getDailyNameOfAllah: () => api.get<{ number: number; arabic: string; transliteration: string; meaning: string }>('/islamic/names-of-allah/daily'),
  getNameOfAllah: (num: number) => api.get<{ number: number; arabic: string; transliteration: string; meaning: string; description: string }>(`/islamic/names-of-allah/${num}`),

  // ── Hifz (Quran Memorization) Tracker ──

  getHifzProgress: () => api.get<Array<{ surahNumber: number; status: string; lastReviewed?: string }>>('/islamic/hifz/progress'),
  updateHifzProgress: (surahNum: number, status: string) =>
    api.patch<{ surahNumber: number; status: string }>(`/islamic/hifz/progress/${surahNum}`, { status }),
  getHifzStats: () => api.get<{ memorized: number; inProgress: number; notStarted: number }>('/islamic/hifz/stats'),
  getHifzReviewSchedule: () => api.get<Array<{ surahNumber: number; nextReviewDate: string }>>('/islamic/hifz/review-schedule'),

  // ── Daily Briefing ──

  getDailyBriefing: (lat?: number, lng?: number) =>
    api.get<{ greeting: string; date: string; hijriDate: string; prayerTimes?: Record<string, string>; dailyVerse?: { arabic: string; translation: string }; tasks: Array<{ type: string; completed: boolean }> }>(`/islamic/daily-briefing${qs({ lat, lng })}`),
  completeDailyTask: (taskType: string) =>
    api.post<{ success: boolean }>('/islamic/daily-tasks/complete', { taskType }),
  getDailyTasksToday: () => api.get<Array<{ type: string; label: string; completed: boolean; xpReward: number }>>('/islamic/daily-tasks/today'),
  bookmarkHadith: (hadithId: string) => api.post<{ success: boolean }>(`/islamic/hadiths/${hadithId}/bookmark`, {}),
};