import { calculatePrayerTimes, getRamadanDatesForYear } from './prayer-calculator';

describe('PrayerTimeCalculator', () => {
  describe('calculatePrayerTimes', () => {
    it('should calculate valid prayer times for New York', () => {
      const result = calculatePrayerTimes(new Date('2026-03-13'), 40.7128, -74.006, 'MWL');

      expect(result.fajr).toMatch(/^\d{2}:\d{2}$/);
      expect(result.sunrise).toMatch(/^\d{2}:\d{2}$/);
      expect(result.dhuhr).toMatch(/^\d{2}:\d{2}$/);
      expect(result.asr).toMatch(/^\d{2}:\d{2}$/);
      expect(result.maghrib).toMatch(/^\d{2}:\d{2}$/);
      expect(result.isha).toMatch(/^\d{2}:\d{2}$/);
      expect(result.imsak).toMatch(/^\d{2}:\d{2}$/);
      expect(result.midnight).toMatch(/^\d{2}:\d{2}$/);
    });

    it('should produce different times for different locations', () => {
      const ny = calculatePrayerTimes(new Date('2026-06-21'), 40.7128, -74.006, 3);
      const sydney = calculatePrayerTimes(new Date('2026-06-21'), -33.8688, 151.2093, 3);

      expect(ny.fajr).not.toBe(sydney.fajr);
      expect(ny.dhuhr).not.toBe(sydney.dhuhr);
      expect(ny.maghrib).not.toBe(sydney.maghrib);
    });

    it('should produce different Fajr for different methods (MWL vs ISNA)', () => {
      const mwl = calculatePrayerTimes(new Date('2026-03-13'), 40.7128, -74.006, 'MWL');
      const isna = calculatePrayerTimes(new Date('2026-03-13'), 40.7128, -74.006, 'ISNA');

      // MWL uses fajr 18°, ISNA uses 15° — ISNA fajr should be later
      expect(mwl.fajr).not.toBe(isna.fajr);
    });

    it('should calculate times for equatorial locations', () => {
      const result = calculatePrayerTimes(new Date('2026-03-20'), 0, 0, 3);

      expect(result.fajr).toMatch(/^\d{2}:\d{2}$/);
      expect(result.dhuhr).toMatch(/^\d{2}:\d{2}$/);
    });

    it('should handle high latitude locations', () => {
      const result = calculatePrayerTimes(new Date('2026-06-21'), 64, 25, 3);

      expect(result.fajr).toMatch(/^\d{2}:\d{2}$/);
      expect(result.dhuhr).toMatch(/^\d{2}:\d{2}$/);
    });

    it('should have Fajr before Sunrise before Dhuhr before Asr before Maghrib before Isha', () => {
      const result = calculatePrayerTimes(new Date('2026-03-20'), 30, 30, 3);

      const toMin = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };

      expect(toMin(result.fajr)).toBeLessThan(toMin(result.sunrise));
      expect(toMin(result.sunrise)).toBeLessThan(toMin(result.dhuhr));
      expect(toMin(result.dhuhr)).toBeLessThan(toMin(result.asr));
      expect(toMin(result.asr)).toBeLessThan(toMin(result.maghrib));
      expect(toMin(result.maghrib)).toBeLessThan(toMin(result.isha));
    });

    it('should default to MWL (method 3) for unknown method', () => {
      const result = calculatePrayerTimes(new Date('2026-03-13'), 40.7128, -74.006, 'UNKNOWN');
      const mwl = calculatePrayerTimes(new Date('2026-03-13'), 40.7128, -74.006, 3);

      expect(result.fajr).toBe(mwl.fajr);
      expect(result.isha).toBe(mwl.isha);
    });
  });

  describe('getRamadanDatesForYear', () => {
    it('should return valid Ramadan dates for 2026', () => {
      const result = getRamadanDatesForYear(2026);

      expect(result.startDate).toMatch(/^2026-\d{2}-\d{2}$/);
      expect(result.endDate).toMatch(/^2026-\d{2}-\d{2}$/);

      const start = new Date(result.startDate);
      const end = new Date(result.endDate);
      expect(end.getTime()).toBeGreaterThan(start.getTime());

      // Ramadan is 29 or 30 days
      const daysDiff = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
      expect(daysDiff).toBeGreaterThanOrEqual(29);
      expect(daysDiff).toBeLessThanOrEqual(30);
    });

    it('should return different dates for different years', () => {
      const r2025 = getRamadanDatesForYear(2025);
      const r2026 = getRamadanDatesForYear(2026);
      const r2027 = getRamadanDatesForYear(2027);

      // Islamic calendar shifts ~11 days per year
      expect(r2025.startDate).not.toBe(r2026.startDate);
      expect(r2026.startDate).not.toBe(r2027.startDate);
    });

    it('should approximate Ramadan 2026 around February-March', () => {
      const result = getRamadanDatesForYear(2026);
      const start = new Date(result.startDate);

      // Ramadan 1447 AH is expected around Feb-Mar 2026
      expect(start.getMonth()).toBeGreaterThanOrEqual(0); // Jan or later
      expect(start.getMonth()).toBeLessThanOrEqual(3);     // Apr or earlier
    });
  });
});
