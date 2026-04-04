import i18next from 'i18next';

/**
 * Locale-aware formatting utilities.
 * Respects user's language for date/number/currency formatting.
 */

/**
 * Format a number with locale-appropriate separators.
 * e.g., 1000000 → "1,000,000" (en) or "١٬٠٠٠٬٠٠٠" (ar)
 */
export function formatNumber(value: number): string {
  const locale = i18next.language || 'en';
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch {
    return value.toLocaleString();
  }
}

/**
 * Format a compact number (1K, 1M, etc.).
 */
export function formatCompactNumber(value: number): string {
  const locale = i18next.language || 'en';
  try {
    return new Intl.NumberFormat(locale, { notation: 'compact' }).format(value);
  } catch {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toString();
  }
}

/**
 * Format a date with locale-appropriate format.
 */
export function formatDate(date: Date | string, style: 'short' | 'medium' | 'long' = 'medium'): string {
  const locale = i18next.language || 'en';
  const d = typeof date === 'string' ? new Date(date) : date;

  const optionsMap: Record<string, Intl.DateTimeFormatOptions> = {
    short: { month: 'short', day: 'numeric' },
    medium: { year: 'numeric', month: 'short', day: 'numeric' },
    long: { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' },
  };
  const options = optionsMap[style];

  try {
    return new Intl.DateTimeFormat(locale, options).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

/**
 * Format a date+time with locale-appropriate format.
 * e.g., "April 5, 2026, 3:30 PM" (en) or "٥ أبريل ٢٠٢٦ ٣:٣٠ م" (ar)
 */
export function formatDateTime(date: Date | string): string {
  const locale = i18next.language || 'en';
  const d = typeof date === 'string' ? new Date(date) : date;
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

/**
 * Format a relative time (e.g., "2 hours ago", "in 3 days").
 */
export function formatRelativeTime(date: Date | string): string {
  const locale = i18next.language || 'en';
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  try {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

    if (Math.abs(diffSec) < 60) return rtf.format(-diffSec, 'second');
    if (Math.abs(diffSec) < 3600) return rtf.format(-Math.floor(diffSec / 60), 'minute');
    if (Math.abs(diffSec) < 86400) return rtf.format(-Math.floor(diffSec / 3600), 'hour');
    if (Math.abs(diffSec) < 604800) return rtf.format(-Math.floor(diffSec / 86400), 'day');
    return formatDate(d, 'short');
  } catch {
    // Fallback — use i18n keys for translatable relative time
    const t = i18next.t.bind(i18next);
    if (diffSec < 60) return t('time.justNow', 'just now');
    if (diffSec < 3600) return t('time.minutesAgo', { count: Math.floor(diffSec / 60), defaultValue: '{{count}}m ago' });
    if (diffSec < 86400) return t('time.hoursAgo', { count: Math.floor(diffSec / 3600), defaultValue: '{{count}}h ago' });
    return t('time.daysAgo', { count: Math.floor(diffSec / 86400), defaultValue: '{{count}}d ago' });
  }
}

/**
 * Format currency with locale and currency code.
 */
export function formatCurrency(amount: number, currency = 'USD'): string {
  const locale = i18next.language || 'en';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

/**
 * Get the date-fns locale for the current language.
 * Lazy-loads the locale module to avoid bundling all locales.
 */
export function getDateFnsLocale(): Locale | undefined {
  const lang = i18next.language || 'en';
  // date-fns locale objects — dynamically required to avoid bundle bloat
  // These are lightweight (2-5KB each)
  const localeMap: Record<string, () => Locale> = {
    ar: () => require('date-fns/locale/ar').default ?? require('date-fns/locale/ar'),
    tr: () => require('date-fns/locale/tr').default ?? require('date-fns/locale/tr'),
    fr: () => require('date-fns/locale/fr').default ?? require('date-fns/locale/fr'),
    id: () => require('date-fns/locale/id').default ?? require('date-fns/locale/id'),
    ms: () => require('date-fns/locale/ms').default ?? require('date-fns/locale/ms'),
    bn: () => require('date-fns/locale/bn').default ?? require('date-fns/locale/bn'),
  };
  // Urdu falls back to Arabic for date formatting (closest available)
  if (lang === 'ur') return localeMap.ar?.();
  try { return localeMap[lang]?.(); } catch { return undefined; }
}

// Re-export Locale type for consumers
type Locale = import('date-fns').Locale;
