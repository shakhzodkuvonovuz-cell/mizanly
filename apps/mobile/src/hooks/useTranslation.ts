import { useTranslation as useI18nTranslation } from 'react-i18next';
import i18next, { loadLanguageBundle, type SupportedLanguage } from '@/i18n';

/**
 * A hook that provides translation functions and RTL information.
 * @returns { t, language, changeLanguage, isRTL }
 */
export type { SupportedLanguage };

export function useTranslation() {
  const { t, i18n } = useI18nTranslation();
  const language = i18n.language as SupportedLanguage;
  const isRTL = language === 'ar' || language === 'ur';

  const changeLanguage = (lang: SupportedLanguage) => {
    // Ensure the language bundle is loaded before switching
    loadLanguageBundle(lang);
    return i18n.changeLanguage(lang);
  };

  /**
   * Gender-aware translation for Arabic (Finding #211).
   * Usage: tg('profile.welcomeBack', 'male') -> looks up 'profile.welcomeBack_male' in ar.json
   * Falls back to base key if gendered variant doesn't exist.
   * i18next natively supports this via the `context` option.
   */
  const tg = (key: string, gender: 'male' | 'female', options?: Record<string, unknown>) => {
    return t(key, { ...options, context: gender });
  };

  return {
    t,
    tg,
    language,
    changeLanguage,
    isRTL,
  };
}

export default useTranslation;
