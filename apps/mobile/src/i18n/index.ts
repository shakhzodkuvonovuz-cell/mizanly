import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import en from './en.json';
import ar from './ar.json';

// Get locale from expo-localization (locale was removed in newer versions; use getLocales())
const deviceLocale = getLocales()[0]?.languageTag ?? 'en';

// Configure i18next
i18next
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
    },
    lng: deviceLocale.startsWith('ar') ? 'ar' : 'en',
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