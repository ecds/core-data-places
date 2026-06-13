import { getAtlasConfig } from '@atlas/server';
import { getI18n } from '@services/i18n';
import { buildTranslations, getTranslation } from '@i18n/utils';

/**
 * Returns the translation helper for the passed language, defaulting to the
 * current atlas's default locale.
 *
 * @param language
 */
export const getTranslations = async (language?: string) => {
  const locale = language || getAtlasConfig().i18n?.default_locale || 'en';
  const data = await getI18n(locale) || {};
  const translations = buildTranslations(data);

  const t = (key: string, values: { [key: string]: string | number } = {}) => getTranslation(key, translations, values);

  return { t, translations };
};