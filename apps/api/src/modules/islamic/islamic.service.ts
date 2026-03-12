import { Injectable, NotFoundException } from '@nestjs/common';
import * as hadiths from './data/hadiths.json';

export interface PrayerTimesRequest {
  lat: number;
  lng: number;
  method?: string;
  date?: string; // YYYY-MM-DD
}

export interface PrayerTimesResponse {
  date: string;
  timings: {
    fajr: string;
    sunrise: string;
    dhuhr: string;
    asr: string;
    maghrib: string;
    isha: string;
  };
  method: string;
  location: {
    lat: number;
    lng: number;
  };
}

export interface CalculationMethod {
  id: string;
  name: string;
  description: string;
  parameters: {
    fajrAngle: number;
    ishaAngle: number;
    maghrib?: '1 min' | '0 min';
    asr?: 'Standard' | 'Hanafi';
  };
}

export interface Hadith {
  id: number;
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
  lat: number;
  lng: number;
  facilities: string[];
  distance?: number; // meters
}

export interface ZakatCalculationRequest {
  cash: number; // in base currency (USD)
  gold: number; // grams
  silver: number; // grams
  investments: number;
  debts: number;
}

export interface ZakatCalculationResponse {
  totalAssets: number;
  nisab: number; // threshold
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

export interface RamadanInfoRequest {
  year?: number;
  lat?: number;
  lng?: number;
}

export interface RamadanInfoResponse {
  year: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  currentDay?: number; // if within Ramadan
  iftarTime?: string; // local time HH:mm
  suhoorTime?: string; // local time HH:mm
  nextPrayer?: string; // next prayer name
  nextPrayerTime?: string;
}

@Injectable()
export class IslamicService {
  private readonly hadiths: Hadith[] = hadiths;
  private readonly prayerMethods: CalculationMethod[] = [
    {
      id: 'MWL',
      name: 'Muslim World League',
      description: 'Fajr 18°, Isha 17°',
      parameters: { fajrAngle: 18, ishaAngle: 17, asr: 'Standard' },
    },
    {
      id: 'ISNA',
      name: 'Islamic Society of North America',
      description: 'Fajr 15°, Isha 15°',
      parameters: { fajrAngle: 15, ishaAngle: 15, asr: 'Standard' },
    },
    {
      id: 'Egypt',
      name: 'Egyptian General Authority of Survey',
      description: 'Fajr 19.5°, Isha 17.5°',
      parameters: { fajrAngle: 19.5, ishaAngle: 17.5, asr: 'Standard' },
    },
    {
      id: 'Makkah',
      name: 'Umm al-Qura University, Makkah',
      description: 'Fajr 18.5°, Isha 90 min after Maghrib',
      parameters: { fajrAngle: 18.5, ishaAngle: 90, maghrib: '1 min', asr: 'Standard' },
    },
    {
      id: 'Karachi',
      name: 'University of Islamic Sciences, Karachi',
      description: 'Fajr 18°, Isha 18°',
      parameters: { fajrAngle: 18, ishaAngle: 18, asr: 'Hanafi' },
    },
  ];


  async getPrayerTimes(params: PrayerTimesRequest): Promise<PrayerTimesResponse> {
    const { lat, lng, method = 'MWL', date = new Date().toISOString().split('T')[0] } = params;
    // For simplicity, we'll compute approximate timings based on solar calculations.
    // This is a placeholder implementation; real implementation would use proper astronomy formulas.
    const methodObj = this.prayerMethods.find(m => m.id === method) || this.prayerMethods[0];
    const baseTime = new Date(`${date}T12:00:00Z`); // solar noon UTC

    // Mock timings (in reality, compute based on latitude, longitude, date, and method)
    const timings = {
      fajr: '05:30',
      sunrise: '06:45',
      dhuhr: '12:30',
      asr: '15:45',
      maghrib: '18:20',
      isha: '19:45',
    };

    return {
      date,
      timings,
      method: methodObj.name,
      location: { lat, lng },
    };
  }

  getPrayerMethods(): CalculationMethod[] {
    return this.prayerMethods;
  }

  getDailyHadith(): Hadith {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    const index = dayOfYear % this.hadiths.length;
    return this.hadiths[index];
  }

  getHadithById(id: number): Hadith {
    const hadith = this.hadiths.find(h => h.id === id);
    if (!hadith) {
      throw new NotFoundException(`Hadith with ID ${id} not found`);
    }
    return hadith;
  }

  getHadiths(cursor?: number, limit = 20): { data: Hadith[]; cursor?: number; hasMore: boolean } {
    const start = cursor ? this.hadiths.findIndex(h => h.id === cursor) + 1 : 0;
    const data = this.hadiths.slice(start, start + limit);
    const nextCursor = data.length > 0 ? data[data.length - 1].id : undefined;
    const hasMore = start + limit < this.hadiths.length;
    return { data, cursor: nextCursor, hasMore };
  }

  getNearbyMosques(lat: number, lng: number, radiusKm = 10): Mosque[] {
    // Mock data for 8 mosques
    const mockMosques: Mosque[] = [
      {
        id: '1',
        name: 'Masjid al-Haram',
        address: 'Mecca, Saudi Arabia',
        lat: 21.4225,
        lng: 39.8262,
        facilities: ['Prayer Hall', 'Ablution', 'Library', 'Cafeteria'],
      },
      {
        id: '2',
        name: 'Masjid an-Nabawi',
        address: 'Medina, Saudi Arabia',
        lat: 24.4672,
        lng: 39.6111,
        facilities: ['Prayer Hall', 'Ablution', 'Library', 'Hospital'],
      },
      {
        id: '3',
        name: 'Al-Aqsa Mosque',
        address: 'Jerusalem, Palestine',
        lat: 31.7761,
        lng: 35.2358,
        facilities: ['Prayer Hall', 'Ablution', 'Historical Site'],
      },
      {
        id: '4',
        name: 'Sultan Ahmed Mosque',
        address: 'Istanbul, Turkey',
        lat: 41.0054,
        lng: 28.9768,
        facilities: ['Prayer Hall', 'Ablution', 'Tourist Guide'],
      },
      {
        id: '5',
        name: 'Sheikh Zayed Grand Mosque',
        address: 'Abu Dhabi, UAE',
        lat: 24.4129,
        lng: 54.4740,
        facilities: ['Prayer Hall', 'Ablution', 'Library', 'Cafeteria', 'Guided Tours'],
      },
      {
        id: '6',
        name: 'Islamic Center of Washington',
        address: 'Washington D.C., USA',
        lat: 38.9186,
        lng: -77.0600,
        facilities: ['Prayer Hall', 'Ablution', 'Library', 'Community Center'],
      },
      {
        id: '7',
        name: 'East London Mosque',
        address: 'London, UK',
        lat: 51.5187,
        lng: -0.0656,
        facilities: ['Prayer Hall', 'Ablution', 'School', 'Clinic'],
      },
      {
        id: '8',
        name: 'Sydney Islamic Centre',
        address: 'Sydney, Australia',
        lat: -33.8688,
        lng: 151.2093,
        facilities: ['Prayer Hall', 'Ablution', 'Sports Hall', 'Cafeteria'],
      },
    ];

    // Filter by distance (simplified)
    const filtered = mockMosques.map(mosque => ({
      ...mosque,
      distance: this.calculateDistance(lat, lng, mosque.lat, mosque.lng),
    })).filter(m => m.distance <= radiusKm * 1000); // convert km to meters

    // Sort by distance
    filtered.sort((a, b) => a.distance - b.distance);
    return filtered;
  }

  calculateZakat(params: ZakatCalculationRequest): ZakatCalculationResponse {
    const goldPricePerGram = 68; // USD per gram
    const silverPricePerGram = 0.82; // USD per gram
    const goldValue = params.gold * goldPricePerGram;
    const silverValue = params.silver * silverPricePerGram;
    const totalAssets = params.cash + goldValue + silverValue + params.investments;
    const nisabGold = 85 * goldPricePerGram; // 85g of gold
    const nisabSilver = 595 * silverPricePerGram; // 595g of silver
    const nisab = Math.min(nisabGold, nisabSilver); // use the lower threshold
    const nisabMet = totalAssets - params.debts >= nisab;
    const zakatDue = nisabMet ? (totalAssets - params.debts) * 0.025 : 0;

    return {
      totalAssets,
      nisab,
      nisabMet,
      zakatDue,
      breakdown: {
        cash: params.cash,
        goldValue,
        silverValue,
        investments: params.investments,
        debts: params.debts,
      },
      goldPricePerGram,
      silverPricePerGram,
    };
  }

  getRamadanInfo(params: RamadanInfoRequest): RamadanInfoResponse {
    const year = params.year || new Date().getFullYear();
    // Simple approximation: Ramadan start = first day of lunar month 9 (approximated)
    // This is a placeholder; real calculation requires Hijri calendar conversion.
    const startDate = `${year}-03-10`; // dummy
    const endDate = `${year}-04-09`; // dummy
    const today = new Date();
    const ramadanStart = new Date(startDate);
    const ramadanEnd = new Date(endDate);
    let currentDay: number | undefined;
    if (today >= ramadanStart && today <= ramadanEnd) {
      currentDay = Math.floor((today.getTime() - ramadanStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }
    // Mock iftar/suhoor times based on location (simplified)
    const iftarTime = '18:45';
    const suhoorTime = '04:30';

    return {
      year,
      startDate,
      endDate,
      currentDay,
      iftarTime,
      suhoorTime,
      nextPrayer: 'Maghrib',
      nextPrayerTime: iftarTime,
    };
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}