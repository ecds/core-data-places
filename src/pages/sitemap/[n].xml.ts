import { getAtlasConfig, getAtlasContent, isAtlasPreview } from '@atlas/server';
import { pageUrls, publicOrigin, recordUrls, topicUrls, URLS_PER_FILE, urlsetXml } from '@utils/sitemap';
import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * One file of a large atlas's sitemap index: 0 is its pages and searches,
 * 1… its records, URLS_PER_FILE at a time.
 */
export const GET: APIRoute = async ({ params, request }) => {
  const n = Number(params.n);

  if (isAtlasPreview() || !Number.isInteger(n) || n < 0) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  }

  const config = getAtlasConfig();
  const origin = publicOrigin(request);
  const urls = n === 0
    ? [...pageUrls(origin, config, getAtlasContent()), ...await topicUrls(origin, config)]
    : await recordUrls(origin, config, (n - 1) * URLS_PER_FILE, URLS_PER_FILE);

  if (n > 0 && urls.length === 0) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(urlsetXml(urls), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
};
