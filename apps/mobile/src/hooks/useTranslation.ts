import { useTranslation as useI18nTranslation } from 'react-i18next';
import i18next from '@/i18n';

/**
 * A hook that provides translation functions and RTL information.
 * @returns { t, language, changeLanguage, isRTL }
 */
export type SupportedLanguage = 'en' | 'ar' | 'tr' | 'ur' | 'bn' | 'fr' | 'id' | 'ms';

export function useTranslation() {
  const { t, i18n } = useI18nTranslation();
  const language = i18n.language as SupportedLanguage;
  const isRTL = language === 'ar' || language === 'ur';

  const changeLanguage = (lang: SupportedLanguage) => {
    return i18n.changeLanguage(lang);
  };

  return {
    t,
    language,
    changeLanguage,
    isRTL,
  };
}

export default useTranslation;