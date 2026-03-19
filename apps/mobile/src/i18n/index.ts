import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import en from './en.json';
import ar from './ar.json';
import tr from './tr.json';

// Get locale from expo-localization (locale was removed in newer versions; use getLocales())
const deviceLocale = getLocales()[0]?.languageTag ?? 'en';

// Resolve the best matching language from device locale
function resolveLanguage(locale: string): string {
  if (locale.startsWith('ar')) return 'ar';
  if (locale.startsWith('tr')) return 'tr';
  return 'en';
}

// Configure i18next
i18next
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
      tr: { translation: tr },
    },
    lng: resolveLanguage(deviceLocale),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    compatibilityJSON: 'v4',
    keySeparator: '.', // Use dot notation for nested keys
    returnNull: false,
    returnEmptyString: false,
  });

export default i18next;