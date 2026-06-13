import client from '@tina/databaseClient';
import { fetchOne, filterAll } from './i18n';

// Branding and navigation are console-owned: the publishing console emits them
// as JSON into the content tree at build (content/branding/branding.json and
// content/navbar/<locale>.json) and they are read directly here, not through
// TinaCMS. import.meta.glob bundles the files at build time and resolves in
// both `astro dev` and the static build; a missing file degrades gracefully
// (branding falls back to {} so the CSS defaults apply; navbar falls back to
// null so Header/Footer use getDefaultNavbar).
const brandings = import.meta.glob('../../../content/branding/*.json', { eager: true, import: 'default' }) as Record<string, any>;
const navbars = import.meta.glob('../../../content/navbar/*.json', { eager: true, import: 'default' }) as Record<string, any>;

export const fetchBranding = async (): Promise<any> => (
  brandings['../../../content/branding/branding.json'] ?? {}
);

export const fetchI18n = async (language: string) => {
  if (!client.queries.i18n) {
    return null;
  }

  const response = await client.queries.i18n({ relativePath: `${language}.json` });
  return response.data?.i18n;
};

export const fetchI18ns = async () => {
  if (!client.queries.i18nConnection) {
    return null;
  }

  const response = await client.queries.i18nConnection();
  return response.data?.i18nConnection?.edges?.map((item) => item?.node);
};

export const fetchNavbar = async (language: string): Promise<any> => (
  navbars[`../../../content/navbar/${language}.json`] ?? null
);

export const fetchPage = async (locale: string, slug: string) => {
  if (!client.queries.pages) {
    return null;
  }

  const response = await fetchOne(locale, slug, client.queries.pages);

  return response.data?.pages;
};

export const fetchPages = async (locale: string, params?: any) => {
  if (!client.queries.pagesConnection) {
    return null;
  }

  const response = await client.queries.pagesConnection(params);
  const pages = response.data?.pagesConnection?.edges?.map((item) => item?.node);

  return filterAll(locale, pages);
};

export const fetchPath = async (slug: string) => {
  if (!client.queries.path) {
    return null;
  }

  const response = await client.queries.path({ relativePath: `${slug}.mdx`});
  return response.data?.path;
};

export const fetchPathResponse = async (slug: string) => {
  if (!client.queries.path) {
    return null;
  }

  const response = await client.queries.path({ relativePath: `${slug}.mdx`});
  return response;
};

export const fetchPaths = async (params = {}) => {
  if (!client.queries.pathConnection) {
    return null;
  }

  const response = await client.queries.pathConnection(params);

  return {
    metadata: response.data?.pathConnection?.pageInfo,
    paths: response.data?.pathConnection?.edges?.map((item) => item?.node)
  }
};

export const fetchPost = async (slug: string) => {
  if (!client.queries.post) {
    return null;
  }

  const response = await client.queries.post({ relativePath: `${slug}.mdx`});
  return response.data?.post;
};

export const fetchPostResponse = async (slug: string) => {
  if (!client.queries.post) {
    return null;
  }

  const response = await client.queries.post({ relativePath: `${slug}.mdx`});
  return response;
}

export const fetchPosts = async (params = {}) => {
  if (!client.queries.postConnection) {
    return null;
  }

  const response = await client.queries.postConnection(params);

  return {
    metadata: response.data?.postConnection?.pageInfo,
    posts: response.data?.postConnection?.edges?.map((item) => item?.node)
  }
};

