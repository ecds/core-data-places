import { AsyncLocalStorage } from 'node:async_hooks';
import defaultConfig from '@config';
import type { AtlasBundle } from './types';

/**
 * Server-side, per-request atlas resolution for the shared dynamic renderer.
 *
 * The renderer is multi-tenant: one Node SSR process serves ANY atlas, chosen
 * per request by slug (see middleware). The resolved bundle lives in an
 * AsyncLocalStorage store for the duration of the request, so deeply-nested
 * server code (services, loaders, layout components) can read the current
 * atlas's config/branding/navigation with `getAtlasConfig()` &c. — without
 * threading it through every call, and without the old baked
 * public/config.json.
 *
 * This module imports `node:async_hooks` and MUST stay server-only. Client
 * islands read the same config from the dynamic /config.json route
 * (see src/pages/config.json.ts) via peripleo's RuntimeConfig; they must NOT
 * import this file.
 */

// The fallback bundle: the committed defaults stand in when no atlas resolves
// (unknown slug, console unreachable, or a request with no slug context).
export const FALLBACK_BUNDLE: AtlasBundle = {
  slug: null,
  config: defaultConfig,
  branding: {},
  navigation: null
};

const atlasStore = new AsyncLocalStorage<AtlasBundle>();

/**
 * Runs `fn` with `bundle` as the active atlas for the current async context.
 * Middleware wraps each request's `next()` in this.
 */
export const runWithAtlas = <T>(bundle: AtlasBundle, fn: () => T): T => atlasStore.run(bundle, fn);

/**
 * The atlas bundle for the current request, or the fallback outside one.
 */
export const getAtlas = (): AtlasBundle => atlasStore.getStore() ?? FALLBACK_BUNDLE;

export const getAtlasConfig = (): any => getAtlas().config ?? FALLBACK_BUNDLE.config;

export const getAtlasBranding = (): any => getAtlas().branding ?? {};

export const getAtlasNavigation = (): any => getAtlas().navigation ?? null;

// ---------------------------------------------------------------------------
// Resolution (slug -> bundle), fetched from the console's public API.
// ---------------------------------------------------------------------------

// One page load fans out to the main document request plus the Header/Footer
// server-island sub-requests (and the client's /config.json fetch), each of
// which resolves the slug independently. A short in-memory TTL collapses those
// into a single console call per atlas.
const CACHE_TTL_MS = Number(process.env.OG_ATLAS_CACHE_TTL_MS ?? 30_000);
// On a transient console failure (5xx / network / timeout) we do NOT latch the
// fallback for the full TTL — we serve the last-known-good bundle if we have one,
// or retry after only this short negative window. So a brief console blip never
// blanks an atlas for the whole TTL on the shared renderer.
const ERROR_TTL_MS = Math.min(CACHE_TTL_MS, Number(process.env.OG_ATLAS_ERROR_TTL_MS ?? 5_000));
const FETCH_TIMEOUT_MS = Number(process.env.OG_ATLAS_FETCH_TIMEOUT_MS ?? 5_000);

interface CacheEntry {
  bundle: AtlasBundle;
  expires: number;
}

const cache = new Map<string, CacheEntry>();

const consoleBaseUrl = (): string =>
  process.env.OG_CONSOLE_URL || process.env.CORE_DATA_URL || 'http://localhost:3001';

/**
 * Resolves the atlas bundle for `slug` from the console's public by-slug
 * endpoint, with a short TTL cache. The renderer never throws on resolution; it
 * degrades. Three outcomes are handled distinctly:
 *   - 200 + config        → cache the real bundle for the full TTL.
 *   - 404 (unknown slug)  → cache the fallback for the full TTL (don't hammer).
 *   - error / non-OK 5xx  → serve the last-known-good bundle if cached, else the
 *                           fallback for a short ERROR_TTL so recovery is quick.
 */
export const resolveAtlasBundle = async (slug: string | null): Promise<AtlasBundle> => {
  if (!slug) {
    return FALLBACK_BUNDLE;
  }

  const cached = cache.get(slug);
  if (cached && cached.expires > Date.now()) {
    return cached.bundle;
  }

  try {
    const response = await fetch(`${consoleBaseUrl()}/core_data/public/v1/atlases/${encodeURIComponent(slug)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });

    if (response.ok) {
      const body = await response.json();
      const atlas = body?.atlas;

      if (atlas?.config) {
        const bundle: AtlasBundle = {
          slug: atlas.slug ?? slug,
          config: atlas.config,
          branding: atlas.branding ?? {},
          navigation: atlas.navigation ?? null
        };
        cache.set(slug, { bundle, expires: Date.now() + CACHE_TTL_MS });
        return bundle;
      }

      // 200 but no usable config — treat as unknown, like a 404.
      cache.set(slug, { bundle: FALLBACK_BUNDLE, expires: Date.now() + CACHE_TTL_MS });
      return FALLBACK_BUNDLE;
    }

    if (response.status === 404) {
      cache.set(slug, { bundle: FALLBACK_BUNDLE, expires: Date.now() + CACHE_TTL_MS });
      return FALLBACK_BUNDLE;
    }

    // eslint-disable-next-line no-console
    console.warn(`[atlas] console returned ${response.status} resolving slug "${slug}"`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`[atlas] failed to resolve slug "${slug}":`, error instanceof Error ? error.message : error);
  }

  // Transient failure: prefer the last-known-good bundle (don't blank a live
  // atlas because of a console blip); otherwise retry after a short window.
  if (cached && cached.bundle !== FALLBACK_BUNDLE) {
    cache.set(slug, { bundle: cached.bundle, expires: Date.now() + ERROR_TTL_MS });
    return cached.bundle;
  }

  cache.set(slug, { bundle: FALLBACK_BUNDLE, expires: Date.now() + ERROR_TTL_MS });
  return FALLBACK_BUNDLE;
};
