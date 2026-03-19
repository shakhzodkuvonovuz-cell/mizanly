import { gregorianToHijri } from '@/utils/hijri';

export type IslamicThemeName = 'ramadan' | 'eid' | 'dhulhijjah' | 'muharram' | 'jummah' | null;

export interface IslamicThemeOverride {
  name: IslamicThemeName;
  accentColor: string;
  headerTint?: string;
  iconTint?: string;
  showConfetti?: boolean;
  bannerText?: string;
  bannerTextKey?: string;
}

// Theme definitions
const THEMES: Record<string, IslamicThemeOverride> = {
  ramadan: {
    name: 'ramadan',
    accentColor: '#C8963E',  // Warm gold
    headerTint: 'rgba(200, 150, 62, 0.15)',
    iconTint: '#C8963E',
    bannerTextKey: 'themes.ramadanKareem',
  },
  eid: {
    name: 'eid',
    accentColor: '#C8963E',
    headerTint: 'rgba(200, 150, 62, 0.2)',
    iconTint: '#D4A94F',
    showConfetti: true,
    bannerTextKey: 'themes.eidMubarak',
  },
  dhulhijjah: {
    name: 'dhulhijjah',
    accentColor: '#8B6F47',  // Earth tones (Kaaba-inspired)
    headerTint: 'rgba(139, 111, 71, 0.12)',
    iconTint: '#8B6F47',
  },
  muharram: {
    name: 'muharram',
    accentColor: '#A0AEC0',  // Subdued silver
    headerTint: 'rgba(160, 174, 192, 0.08)',
    iconTint: '#A0AEC0',
  },
  jummah: {
    name: 'jummah',
    accentColor: '#C8963E',
    headerTint: 'rgba(200, 150, 62, 0.06)',
  },
};

/**
 * Determine which Islamic theme should be active based on the current date.
 * Returns null if no special theme applies.
 */
export function getActiveIslamicTheme(): IslamicThemeOverride | null {
  const now = new Date();
  const hijri = gregorianToHijri(now);
  const dayOfWeek = now.getDay(); // 0=Sun, 5=Fri

  // Ramadan: month 9
  if (hijri.month === 9) {
    return THEMES.ramadan;
  }

  // Eid al-Fitr: 1-3 Shawwal (month 10)
  if (hijri.month === 10 && hijri.day >= 1 && hijri.day <= 3) {
    return THEMES.eid;
  }

  // Eid al-Adha: 10 Dhul Hijjah (month 12)
  if (hijri.month === 12 && hijri.day === 10) {
    return THEMES.eid;
  }

  // Dhul Hijjah season: 1-13 (month 12)
  if (hijri.month === 12 && hijri.day >= 1 && hijri.day <= 13) {
    return THEMES.dhulhijjah;
  }

  // Muharram: 1st day (month 1, day 1)
  if (hijri.month === 1 && hijri.day === 1) {
    return THEMES.muharram;
  }

  // Every Friday: subtle Jummah tint
  if (dayOfWeek === 5) {
    return THEMES.jummah;
  }

  return null;
}

/**
 * Check if it's Eid today (for confetti animation)
 */
export function isEidToday(): boolean {
  const hijri = gregorianToHijri(new Date());
  // Eid al-Fitr: 1 Shawwal
  if (hijri.month === 10 && hijri.day === 1) return true;
  // Eid al-Adha: 10 Dhul Hijjah
  if (hijri.month === 12 && hijri.day === 10) return true;
  return false;
}
