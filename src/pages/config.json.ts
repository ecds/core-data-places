import { getAtlasConfig } from '@atlas/server';
import type { APIRoute } from 'astro';

/**
 * Serves the current request's atlas config at /config.json.
 *
 * Client islands (search, the detail-page map, posts, paths) read their config
 * at runtime via peripleo's `<RuntimeConfig path='/config.json'>`, so making
 * this a dynamic SSR route — resolved by slug per request (see middleware) —
 * is what makes those client islands multi-tenant without any island changes.
 * This replaces the old static public/config.json (now removed).
 *
 * Never cached: the same path serves a different document per atlas/host.
 */
export const GET: APIRoute = () => (
  new Response(JSON.stringify(getAtlasConfig()), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  })
);
