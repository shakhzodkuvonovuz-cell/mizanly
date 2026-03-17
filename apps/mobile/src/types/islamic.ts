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
  totalWealth: number;
  nisabGold: number;
  nisabSilver: number;
  nisabValue: number;
  isAboveNisab: boolean;
  zakatDue: number;
  breakdown: {
    cash: number;
    gold: number;
    silver: number;
    investments: number;
    debts: number;
  };
}

export interface RamadanInfo {
  year: number;
  startDate: string;
  endDate: string;
  currentDay?: number;
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
}