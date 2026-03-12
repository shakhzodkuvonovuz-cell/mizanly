import { api } from './api';
import type {
  PrayerTimes,
  PrayerMethodInfo,
  Hadith,
  Mosque,
  ZakatCalculationInput,
  ZakatCalculationResult,
  RamadanInfo,
} from '@/types/islamic';
import type { PaginatedResponse } from '@/types';

const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join('&');
  return s ? `?${s}` : '';
};

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
    api.get<ZakatCalculationResult>(`/islamic/zakat/calculate${qs(input)}`),

  getRamadanInfo: (year?: number, lat?: number, lng?: number) =>
    api.get<RamadanInfo>(`/islamic/ramadan${qs({ year, lat, lng })}`),
};