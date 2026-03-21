import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

// Bundle all languages synchronously to prevent English flash on non-English devices.
// JSON imports are resolved at bundle time — no runtime async loading needed.
import en from './en.json';
import ar from './ar.json';
import tr from './tr.json';
import ur from './ur.json';
import bn from './bn.json';
import fr from './fr.json';
import id from './id.json';
import ms from './ms.json';

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

// Configure i18next with ALL languages bundled — no async flash
i18next
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
      tr: { translation: tr },
      ur: { translation: ur },
      bn: { translation: bn },
      fr: { translation: fr },
      id: { translation: id },
      ms: { translation: ms },
    },
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
