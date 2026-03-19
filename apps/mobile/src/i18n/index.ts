import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

// Always bundle English (fallback language)
import en from './en.json';

// Get locale from expo-localization
const deviceLocale = getLocales()[0]?.languageTag ?? 'en';

// Resolve the best matching language from device locale
function resolveLanguage(locale: string): string {
  if (locale.startsWith('ar')) return 'ar';
  if (locale.startsWith('tr')) return 'tr';
  if (locale.startsWith('ur')) return 'ur';
  if (locale.startsWith('id')) return 'id';
  if (locale.startsWith('bn')) return 'bn';
  if (locale.startsWith('fr')) return 'fr';
  if (locale.startsWith('ms')) return 'ms';
  return 'en';
}

const userLang = resolveLanguage(deviceLocale);

/**
 * Lazy-load the user's language file. Only English is bundled by default.
 * Other languages are loaded on demand to reduce initial bundle size.
 */
async function loadUserLanguage(): Promise<Record<string, unknown> | null> {
  if (userLang === 'en') return null; // Already bundled

  try {
    switch (userLang) {
      case 'ar': return (await import('./ar.json')).default;
      case 'tr': return (await import('./tr.json')).default;
      case 'ur': return (await import('./ur.json')).default;
      case 'id': return (await import('./id.json')).default;
      case 'bn': return (await import('./bn.json')).default;
      case 'fr': return (await import('./fr.json')).default;
      case 'ms': return (await import('./ms.json')).default;
      default: return null;
    }
  } catch {
    return null;
  }
}

// Configure i18next with English only initially
i18next
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    lng: userLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    compatibilityJSON: 'v4',
    keySeparator: '.', // Use dot notation for nested keys
    returnNull: false,
    returnEmptyString: false,
  });

// Load user's language asynchronously (falls back to English until loaded)
if (userLang !== 'en') {
  loadUserLanguage().then((langData) => {
    if (langData) {
      i18next.addResourceBundle(userLang, 'translation', langData, true, true);
      i18next.changeLanguage(userLang);
    }
  });
}

export default i18next;
