import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import en from './en.json';
import ar from './ar.json';

// Configure i18next
i18next
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
    },
    lng: Localization.locale.startsWith('ar') ? 'ar' : 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    compatibilityJSON: 'v3', // For older React Native versions
    nsSeparator: false, // Disable namespace separator (we use flat keys)
    keySeparator: '.', // Use dot notation for nested keys
    returnNull: false,
    returnEmptyString: false,
    returnObjects: true,
    parseMissingKeyHandler: (key: string) => {
      console.warn(`Missing translation key: ${key}`);
      return key;
    },
  });

export default i18next;