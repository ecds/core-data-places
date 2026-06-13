import { getAtlasConfig } from '@atlas/server';
import { Navbar, NavbarItem } from '@types';
import { STATIC_BUILD } from 'astro:env/client';
import { getRelativeLocaleUrl } from 'astro:i18n';
import _ from 'underscore';

/**
 * Returns the first page flagged as "home_page".
 *
 * Standalone pages move to the user's WordPress / console (migration step 2),
 * so there is no Tina home page to resolve yet. Returns undefined until then.
 *
 * @param locale
 */
export const getHomepage = async (_locale: string) => undefined;

/**
 * Returns the set of all non-homepage pages.
 *
 * Pages are no longer sourced from TinaCMS (which hangs the SSR runtime without
 * a datalayer); they become console/WordPress-owned in migration step 2. Until
 * then this is empty, and the navbar comes from the console navigation bundle.
 */
export const getPages = async (_locale: string): Promise<any[]> => [];

/**
 * Transforms the custom navbar into an array of nav items.
 *
 * @param navbar
 * @param locale
 * @param pathname
 */
export const getCustomNavbar = (navbar: Navbar, locale: string, pathname: string) => {
  return _.map(navbar.items, (item: NavbarItem) => ({
    ...item,
    active: isActive(item.href, pathname, locale),
    options: item.options && _.map(item.options, (option: NavbarItem) => ({
      ...option,
      active: isActive(option.href, pathname, locale)
    }))
  }));
};

/**
 * Returns the default navbar items.
 *
 * @param pages
 * @param locale
 * @param pathname
 * @param t
 */
export const getDefaultNavbar = (pages: any, locale: string, pathname: string, t: any) => {
  const config = getAtlasConfig();

  const NavKeys = {
    gallery: 'gallery',
    search: 'search',
    pages: 'pages',
    paths: 'paths',
    posts: 'posts'
  };

  // Build the list of options for the "Explore" dropdown
  const searchOptions = _.map(config.search, (search) => ({
    active: pathname.includes(`/${NavKeys.search}/${search.name}`),
    name: search.name,
    label: t(`index_${search.name}`),
    href: getRelativeLocaleUrl(locale, `/${NavKeys.search}/${search.name}`)
  }));

  // Add the "Saved Searches" option in "server" mode
  if (!STATIC_BUILD) {
    searchOptions.push({
      active: pathname.includes('/sessions/search'),
      name: 'search_session',
      label: t('savedSearches'),
      href: getRelativeLocaleUrl(locale, '/sessions/search')
    });
  }

  const NavConfig = {
    [NavKeys.search]: {
      label: t('explore'),
      options: searchOptions
    },
    [NavKeys.pages]: {
      label: t('pages'),
      options: _.map(pages, (page) => ({
        active: pathname.includes(`/${NavKeys.pages}/${page._sys.filename}`),
        name: page.id,
        label: page.title,
        href: getRelativeLocaleUrl(locale, `/${NavKeys.pages}/${page._sys.filename}`)
      }))
    },
    [NavKeys.paths]: {
      active: isActive('/paths', pathname, locale),
      label: t('paths'),
      href: getRelativeLocaleUrl(locale, NavKeys.paths)
    },
    [NavKeys.posts]: {
      active: isActive('/posts', pathname, locale),
      label: t('posts'),
      href: getRelativeLocaleUrl(locale, NavKeys.posts)
    },
    [NavKeys.gallery]: {
      active: isActive('/gallery', pathname, locale),
      label: t('gallery'),
      href: getRelativeLocaleUrl(locale, NavKeys.gallery)
    }
  };

  const result = [
    NavConfig.search,
    ..._.map(config.content?.collections, (key) => NavConfig[key?.toLowerCase()]),
  ];

  if (!_.isEmpty(NavConfig.pages.options)) {
    result.push(NavConfig.pages);
  }

  if (config.gallery) {
    result.push(NavConfig.gallery);
  }

  return result;
};

/**
 * Returns true if the passed URL matches the passed current path.
 *
 * @param url
 * @param pathname
 * @param locale
 */
const isActive = (url: string, pathname: string, locale: string) => {
  if (url === '/' || url === `/${locale}`) {
    return pathname === url;
  }

  return pathname.includes(url);
};