export type PrayerMethod = 'MWL' | 'ISNA' | 'Egypt' | 'Makkah' | 'Karachi' | 'Tehran' | 'Jafari';

export interface PrayerTimes {
  date: string;
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
  method: PrayerMethod;
  latitude: number;
  longitude: number;
}

export interface PrayerMethodInfo {
  id: PrayerMethod;
  name: string;
  description: string;
  region: string;
}

export interface Hadith {
  id: string;
  arabic: string;
  english: string;
  source: string;
  narrator: string;
  chapter: string;
}

export interface Mosque {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  facilities: string[];
  prayerTimes?: PrayerTimes;
}

export interface ZakatCalculationInput {
  cash: number;
  gold: number; // grams
  silver: number; // grams
  investments: number;
  debts: number;
  currency?: string;
}

export interface ZakatCalculationResult {
  totalAssets: number;
  nisab: number;
  nisabMet: boolean;
  zakatDue: number;
  breakdown: {
    cash: number;
    goldValue: number;
    silverValue: number;
    investments: number;
    debts: number;
  };
  goldPricePerGram: number;
  silverPricePerGram: number;
}

export interface RamadanInfo {
  year: number;
  startDate: string;
  endDate: string;
  currentDay?: number;
  totalDays?: number;
  daysFasted?: number;
  daysRemaining?: number;
  iftarTime?: string;
  suhoorTime?: string;
  prayerTimes?: PrayerTimes;
}

export interface IslamicCalendarDay {
  hijriDate: string;
  gregorianDate: string;
  islamicMonth: string;
  islamicDay: number;
  events?: string[];
}

export interface QuranSurah {
  number: number;
  name: string;
  arabicName: string;
  verses: number;
  revelationType: 'meccan' | 'medinan';
}

export interface QuranVerse {
  surahNumber: number;
  verseNumber: number;
  arabic: string;
  translation: string;
  transliteration?: string;
  /** Audio URL from cdn.islamic.network — returned by backend getQuranVerse */
  audioUrl?: string;
}

export interface QuranRoomState {
  hostId: string;
  currentSurah: number;
  currentVerse: number;
  reciterId: string | null;
  participantCount: number;
}

export interface PrayerNotificationSetting {
  id: string;
  userId: string;
  dndDuringPrayer: boolean;
  adhanEnabled: boolean;
  adhanStyle: string;
  reminderMinutes: number;
}

export interface QuranReadingPlan {
  id: string;
  userId: string;
  planType: string;
  startDate: string;
  endDate: string;
  currentJuz: number;
  currentPage: number;
  isComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CharityCampaign {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  goalAmount: number;
  raisedAmount: number;
  donorCount: number;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CharityDonation {
  id: string;
  userId: string;
  campaignId: string | null;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

export interface HajjStep {
  step: number;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  duas: Array<{ arabic: string; transliteration: string; english: string }>;
  checklist: string[];
}

export interface HajjProgress {
  id: string;
  userId: string;
  year: number;
  currentStep: number;
  checklistJson: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TafsirSource {
  name: string;
  madhab: string;
  textEn: string;
  textAr: string;
}

export interface TafsirEntry {
  surahNumber: number;
  verseNumber: number;
  verse: string;
  tafsirSources: TafsirSource[];
}

export interface ScholarVerification {
  id: string;
  userId: string;
  institution: string;
  specialization: string | null;
  madhab: string | null;
  status: string;
  verifiedAt: string | null;
  createdAt: string;
}

export interface ContentFilterSetting {
  id: string;
  userId: string;
  strictnessLevel: string;
  blurHaram: boolean;
  hideMusic: boolean;
  hideMixedGender: boolean;
}

export interface DhikrStats {
  totalCount: number;
  todayCount: number;
  streak: number;
  setsCompleted: number;
}

export interface DhikrLeaderboardEntry {
  userId: string;
  totalCount: number;
  user: { id: string; displayName: string | null; avatarUrl: string | null } | null;
}

export interface DhikrChallenge {
  id: string;
  userId: string;
  title: string;
  phrase: string;
  targetTotal: number;
  currentTotal: number;
  participantCount: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface DhikrChallengeDetail extends DhikrChallenge {
  topContributors: Array<{
    userId: string;
    contributed: number;
    user: { id: string; displayName: string | null; avatarUrl: string | null } | null;
  }>;
}