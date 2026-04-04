import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

// English is always bundled — it's the fallback language.
import en from './en.json';

export type SupportedLanguage = 'en' | 'ar' | 'tr' | 'ur' | 'bn' | 'fr' | 'id' | 'ms';

// The shape of a language bundle (deeply nested namespace objects)
type LanguageBundle = typeof en;

const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  'en', 'ar', 'tr', 'ur', 'bn', 'fr', 'id', 'ms',
] as const;

// Track which language bundles have been loaded
const loadedLanguages = new Set<SupportedLanguage>(['en']);

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

/**
 * Synchronously load a language bundle via require().
 * Uses a switch statement so Metro can statically resolve each path.
 * Returns the JSON resource or null if the language is not supported.
 */
function requireLanguageBundle(lang: SupportedLanguage): LanguageBundle | null {
  switch (lang) {
    case 'ar': return require('./ar.json');
    case 'tr': return require('./tr.json');
    case 'ur': return require('./ur.json');
    case 'bn': return require('./bn.json');
    case 'fr': return require('./fr.json');
    case 'id': return require('./id.json');
    case 'ms': return require('./ms.json');
    case 'en': return null; // Already bundled statically
    default: return null;
  }
}

/**
 * Load a language bundle into i18next on demand.
 * Safe to call multiple times — only loads once per language.
 * Returns true if the bundle was loaded (or was already loaded).
 */
export function loadLanguageBundle(lang: SupportedLanguage): boolean {
  if (loadedLanguages.has(lang)) return true;

  const bundle = requireLanguageBundle(lang);
  if (!bundle) return false;

  i18next.addResourceBundle(lang, 'translation', bundle, true, true);
  loadedLanguages.add(lang);
  return true;
}

const userLang = resolveLanguage(deviceLocale);

// Load the device language synchronously at startup (if not English)
// so there's no flash of English text on non-English devices.
const startupResources: Record<string, { translation: LanguageBundle }> = {
  en: { translation: en },
};

if (userLang !== 'en') {
  const bundle = requireLanguageBundle(userLang);
  if (bundle) {
    startupResources[userLang] = { translation: bundle };
    loadedLanguages.add(userLang);
  }
}

// Configure i18next with only en + device language at startup
i18next
  .use(initReactI18next)
  .init({
    resources: startupResources,
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

export { SUPPORTED_LANGUAGES };
export default i18next;
