import { useTranslation as useI18nTranslation } from 'react-i18next';
import i18next from '@/i18n';

/**
 * A hook that provides translation functions and RTL information.
 * @returns { t, language, changeLanguage, isRTL }
 */
export function useTranslation() {
  const { t, i18n } = useI18nTranslation();
  const language = i18n.language;
  const isRTL = language === 'ar';

  const changeLanguage = (lang: 'en' | 'ar') => {
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