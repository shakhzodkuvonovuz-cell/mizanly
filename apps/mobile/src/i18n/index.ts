import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

// Always bundle English (fallback language) — ~164KB
import en from './en.json';

// Optimization: Only en + user's detected language are loaded/parsed at startup.
// Other language JSONs are still in the Metro bundle (require() is statically resolved)
// but they are NOT parsed or loaded into memory until the user switches language.
// This reduces cold start time and memory usage: ~300KB parsed vs ~1.3MB previously.

// Supported languages (besides English which is always loaded)
const SUPPORTED_LANGUAGES = ['ar', 'tr', 'ur', 'bn', 'fr', 'id', 'ms'] as const;
type NonEnglishLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export type SupportedLanguage = 'en' | NonEnglishLanguage;

// Track which language bundles have been loaded
const loadedLanguages = new Set<string>(['en']);

// Get locale from expo-localization
const deviceLocale = getLocales()[0]?.languageTag ?? 'en';

// Resolve the best matching language from device locale
function resolveLanguage(locale: string): SupportedLanguage {
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

// Synchronously load the user's detected language at startup (if not English).
// This prevents the "English flash" — the user sees their language immediately.
// Only ~300KB total at startup (en + user language) instead of ~1.3MB (all 8).
function loadLanguageSync(lang: NonEnglishLanguage): Record<string, unknown> {
  switch (lang) {
    case 'ar': return require('./ar.json');
    case 'tr': return require('./tr.json');
    case 'ur': return require('./ur.json');
    case 'bn': return require('./bn.json');
    case 'fr': return require('./fr.json');
    case 'id': return require('./id.json');
    case 'ms': return require('./ms.json');
  }
}

// Build initial resources: always en + user's detected language
const initialResources: Record<string, { translation: Record<string, unknown> }> = {
  en: { translation: en },
};

if (userLang !== 'en') {
  initialResources[userLang] = { translation: loadLanguageSync(userLang) };
  loadedLanguages.add(userLang);
}

/**
 * Lazily load a language bundle and add it to i18next.
 * Returns true if the language was loaded (or was already loaded).
 * Call this before i18next.changeLanguage() for non-preloaded languages.
 */
export async function loadLanguageBundle(lang: SupportedLanguage): Promise<boolean> {
  if (loadedLanguages.has(lang)) return true;
  if (lang === 'en') return true; // Always loaded

  try {
    // Metro resolves require() at bundle time, so we use a switch to ensure
    // each path is statically analyzable. The key difference from the old approach:
    // these modules are only loaded when this function is called, not at startup.
    const data = loadLanguageSync(lang as NonEnglishLanguage);
    i18next.addResourceBundle(lang, 'translation', data, true, true);
    loadedLanguages.add(lang);
    return true;
  } catch (err) {
    if (__DEV__) {
      console.warn(`[i18n] Failed to load language bundle: ${lang}`, err);
    }
    return false;
  }
}

/**
 * Check if a language bundle is already loaded.
 */
export function isLanguageLoaded(lang: SupportedLanguage): boolean {
  return loadedLanguages.has(lang);
}

// Configure i18next with only the initial languages (en + user's detected language).
// Other languages are loaded on demand via loadLanguageBundle().
i18next
  .use(initReactI18next)
  .init({
    resources: initialResources,
    lng: userLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    compatibilityJSON: 'v4',
    keySeparator: '.',
    returnNull: false,
    returnEmptyString: false,
  });

export default i18next;
