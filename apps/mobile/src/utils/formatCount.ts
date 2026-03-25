import i18next from 'i18next';

const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/**
 * Convert Western digits to Arabic-Indic numerals when locale is Arabic.
 */
function localizeDigits(str: string): string {
  const lang = i18next.language || 'en';
  if (lang === 'ar') {
    return str.replace(/[0-9]/g, (d) => ARABIC_DIGITS[parseInt(d, 10)]);
  }
  return str;
}

/**
 * Format large numbers for social media display.
 * Instagram/TikTok style: 999 → "999", 1200 → "1.2K", 15000 → "15K", 1500000 → "1.5M"
 * Arabic locale: 999 → "٩٩٩", 1200 → "١٫٢K", etc.
 *
 * Rules:
 * - Under 1000: show raw number
 * - 1000-999999: divide by 1000, one decimal, "K" suffix (drop .0)
 * - 1000000+: divide by 1000000, one decimal, "M" suffix (drop .0)
 * - Negative numbers: return "0"
 * - NaN/undefined: return "0"
 */
export function formatCount(n: number | undefined | null): string {
  if (n == null || isNaN(n) || n < 0) return localizeDigits('0');
  if (n < 1_000) return localizeDigits(n.toString());
  if (n < 1_000_000) {
    const val = (n / 1_000).toFixed(1);
    const formatted = val.endsWith('.0') ? val.slice(0, -2) + 'K' : val + 'K';
    return localizeDigits(formatted);
  }
  const val = (n / 1_000_000).toFixed(1);
  const formatted = val.endsWith('.0') ? val.slice(0, -2) + 'M' : val + 'M';
  return localizeDigits(formatted);
}

/**
 * Convert a number to Arabic-Indic numerals (standalone utility).
 * Usage: toArabicNumerals(345) → "٣٤٥"
 */
export function toArabicNumerals(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => ARABIC_DIGITS[parseInt(d, 10)]);
}
