import { isAtlasPreview } from '@atlas/server';
import { publicOrigin } from '@utils/sitemap';
import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * Crawlers may index a published atlas (not its API), and are pointed at
 * its sitemap. A draft seen through its preview link says no to everything
 * (crawlers never carry the link's cookie, and get a 404 without it).
 */
export const GET: APIRoute = ({ request }) => {
  const body = isAtlasPreview()
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${publicOrigin(request)}/sitemap.xml\n`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': isAtlasPreview() ? 'private, no-store' : 'public, max-age=3600'
    }
  });
};
