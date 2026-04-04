import { SURAH_METADATA, TOTAL_AYAHS, getSurahAyahOffset, getJuzForSurah } from './quran-metadata';

describe('Quran Metadata', () => {
  describe('SURAH_METADATA', () => {
    it('should contain exactly 114 surahs', () => {
      expect(SURAH_METADATA).toHaveLength(114);
    });

    it('should have consecutive surah numbers from 1 to 114', () => {
      for (let i = 0; i < SURAH_METADATA.length; i++) {
        expect(SURAH_METADATA[i].number).toBe(i + 1);
      }
    });

    it('should have valid revelation types (Meccan or Medinan)', () => {
      for (const surah of SURAH_METADATA) {
        expect(['Meccan', 'Medinan']).toContain(surah.revelationType);
      }
    });

    it('should have positive ayah counts', () => {
      for (const surah of SURAH_METADATA) {
        expect(surah.ayahCount).toBeGreaterThan(0);
      }
    });

    it('should have juzStart between 1 and 30', () => {
      for (const surah of SURAH_METADATA) {
        expect(surah.juzStart).toBeGreaterThanOrEqual(1);
        expect(surah.juzStart).toBeLessThanOrEqual(30);
      }
    });

    it('should have non-empty Arabic, English, and transliteration names', () => {
      for (const surah of SURAH_METADATA) {
        expect(surah.nameArabic.length).toBeGreaterThan(0);
        expect(surah.nameEnglish.length).toBeGreaterThan(0);
        expect(surah.nameTransliteration.length).toBeGreaterThan(0);
      }
    });

    it('should have Al-Fatihah as surah 1 with 7 ayahs', () => {
      expect(SURAH_METADATA[0].number).toBe(1);
      expect(SURAH_METADATA[0].nameEnglish).toBe('The Opening');
      expect(SURAH_METADATA[0].ayahCount).toBe(7);
      expect(SURAH_METADATA[0].revelationType).toBe('Meccan');
    });

    it('should have Al-Baqarah as surah 2 with 286 ayahs', () => {
      expect(SURAH_METADATA[1].number).toBe(2);
      expect(SURAH_METADATA[1].nameEnglish).toBe('The Cow');
      expect(SURAH_METADATA[1].ayahCount).toBe(286);
      expect(SURAH_METADATA[1].revelationType).toBe('Medinan');
    });

    it('should have An-Nas as surah 114 with 6 ayahs', () => {
      expect(SURAH_METADATA[113].number).toBe(114);
      expect(SURAH_METADATA[113].nameEnglish).toBe('Mankind');
      expect(SURAH_METADATA[113].ayahCount).toBe(6);
    });

    it('should have juzStart in non-decreasing order', () => {
      for (let i = 1; i < SURAH_METADATA.length; i++) {
        expect(SURAH_METADATA[i].juzStart).toBeGreaterThanOrEqual(
          SURAH_METADATA[i - 1].juzStart,
        );
      }
    });
  });

  describe('TOTAL_AYAHS', () => {
    it('should be 6236', () => {
      expect(TOTAL_AYAHS).toBe(6236);
    });

    it('should equal the sum of all surah ayah counts', () => {
      const sum = SURAH_METADATA.reduce((acc, s) => acc + s.ayahCount, 0);
      expect(sum).toBe(TOTAL_AYAHS);
    });
  });

  describe('getSurahAyahOffset', () => {
    it('should return 0 for surah 1 (Al-Fatihah)', () => {
      expect(getSurahAyahOffset(1)).toBe(0);
    });

    it('should return 7 for surah 2 (after Al-Fatihah)', () => {
      expect(getSurahAyahOffset(2)).toBe(7);
    });

    it('should return 7 + 286 = 293 for surah 3', () => {
      expect(getSurahAyahOffset(3)).toBe(293);
    });

    it('should handle surah 114 correctly', () => {
      const offset = getSurahAyahOffset(114);
      // Should be TOTAL_AYAHS minus An-Nas ayah count
      expect(offset).toBe(TOTAL_AYAHS - 6);
    });

    it('should return 0 for surah number <= 0', () => {
      expect(getSurahAyahOffset(0)).toBe(0);
      expect(getSurahAyahOffset(-1)).toBe(0);
    });
  });

  describe('getJuzForSurah', () => {
    it('should return 1 for surah 1 (Al-Fatihah)', () => {
      expect(getJuzForSurah(1)).toBe(1);
    });

    it('should return 1 for surah 2 (Al-Baqarah)', () => {
      expect(getJuzForSurah(2)).toBe(1);
    });

    it('should return 30 for surah 78 (An-Naba)', () => {
      expect(getJuzForSurah(78)).toBe(30);
    });

    it('should return 30 for surah 114 (An-Nas)', () => {
      expect(getJuzForSurah(114)).toBe(30);
    });

    it('should return 1 for non-existent surah number', () => {
      expect(getJuzForSurah(999)).toBe(1);
      expect(getJuzForSurah(0)).toBe(1);
    });

    it('should return correct juz for middle surahs', () => {
      // Surah 18 (Al-Kahf) starts in juz 15
      expect(getJuzForSurah(18)).toBe(15);
      // Surah 36 (Ya-Sin) starts in juz 22
      expect(getJuzForSurah(36)).toBe(22);
    });
  });
});
