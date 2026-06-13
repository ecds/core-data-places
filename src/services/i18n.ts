import { getAtlasConfig } from '@atlas/server';
import { hasContentCollection } from '@root/src/content.config';
import { getEntry } from 'astro:content';

/**
 * Returns the i18n data for the passed locale.
 *
 * @param locale
 */
export const getI18n = async (locale) => {
  // Content-collection cache path (STATIC_BUILD / USE_CONTENT_CACHE).
  if (hasContentCollection(locale)) {
    return await getEntry('i18n', locale);
  }

  // Console-owned i18n strings, resolved per request from the atlas bundle:
  // `config.i18n.strings` is a map of locale -> flat `t_`-prefixed key/value
  // pairs (the shape buildTranslations expects). Replaces the former TinaCMS
  // i18n collection; any locale the console hasn't translated falls back to the
  // frontend defaults (i18n.json / search.json / userDefinedFields.json).
  const strings = getAtlasConfig().i18n?.strings;
  return (strings && strings[locale]) || null;
};