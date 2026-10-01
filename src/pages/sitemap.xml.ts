import { getAtlasConfig, getAtlasContent, isAtlasPreview } from '@atlas/server';
import {
  countRecordUrls,
  indexXml,
  pageUrls,
  publicOrigin,
  recordUrls,
  URLS_PER_FILE,
  urlsetXml
} from '@utils/sitemap';
import type { APIRoute } from 'astro';

export const prerender = false;

const XML_HEADERS = { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' };

/**
 * The atlas's sitemap: one file when it fits, else an index of
 * /sitemap/<n>.xml files (see sitemap/[n].xml.ts). Never for a draft.
 */
export const GET: APIRoute = async ({ request }) => {
  if (isAtlasPreview()) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  }

  const config = getAtlasConfig();
  const origin = publicOrigin(request);
  const pages = pageUrls(origin, config, getAtlasContent());

  try {
    const records = await countRecordUrls(config);

    if (pages.length + records <= URLS_PER_FILE) {
      return new Response(urlsetXml([...pages, ...await recordUrls(origin, config)]), { headers: XML_HEADERS });
    }

    const files = 1 + Math.ceil(records / URLS_PER_FILE);
    return new Response(indexXml(Array.from({ length: files }, (_v, n) => `${origin}/sitemap/${n}.xml`)), { headers: XML_HEADERS });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[sitemap] records unavailable:', error instanceof Error ? error.message : error);
    return new Response(urlsetXml(pages), { headers: { ...XML_HEADERS, 'Cache-Control': 'public, max-age=300' } });
  }
};
