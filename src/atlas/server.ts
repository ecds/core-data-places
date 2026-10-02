import { AsyncLocalStorage } from 'node:async_hooks';
import defaultConfig from '@config';
import type { AtlasImages } from '@utils/images';
import type { AtlasBundle, AtlasContent, AtlasPage } from './types';

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
  preview: false,
  config: defaultConfig,
  branding: {},
  navigation: null,
  content: null,
  images: null
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

export const getAtlasContent = (): AtlasContent => ({
  home: getAtlas().content?.home ?? null,
  pages: getAtlas().content?.pages ?? []
});

/**
 * The sizes and web-sized copies of the atlas's uploaded images, by key.
 */
export const getAtlasImages = (): AtlasImages | null => getAtlas().images ?? null;

/**
 * True when the current request is a preview of an unpublished atlas.
 */
export const isAtlasPreview = (): boolean => getAtlas().preview === true;

/**
 * The console-owned page with `slug`, or undefined.
 */
export const getAtlasPage = (slug: string | undefined): AtlasPage | undefined => (
  slug ? getAtlasContent().pages.find((page) => page.slug === slug) : undefined
);

/**
 * The browser-facing console URL that uploaded images (stored as
 * `/core_data/public/v1/assets/...` paths) are served from. Unlike
 * getCoreDataUrl, never the internal override: the browser fetches these.
 */
export const getAssetBase = (): string => (getAtlasConfig()?.core_data?.url || '').replace(/\/+$/, '');

/**
 * The Core Data base URL for server-side calls. The atlas config's
 * `core_data.url` is the browser-facing address (the console serves it to
 * client islands via /config.json); when the renderer runs where that address
 * doesn't resolve — a container beside the host, reaching it by service name
 * — `OG_CORE_DATA_INTERNAL_URL` overrides it for the server's own fetches.
 */
export const getCoreDataUrl = (): string => (
  (process.env.OG_CORE_DATA_INTERNAL_URL || getAtlasConfig()?.core_data?.url || '').replace(/\/+$/, '')
);

// ---------------------------------------------------------------------------
// Resolution (slug or domain -> bundle), fetched from the console's public API.
// ---------------------------------------------------------------------------

// One page load fans out to the main document request plus the Header/Footer
// server-island sub-requests (and the client's /config.json fetch), each of
// which resolves the atlas independently. A short in-memory TTL collapses
// those into a single console call per atlas.
const CACHE_TTL_MS = Number(process.env.OG_ATLAS_CACHE_TTL_MS ?? 30_000);
// On a transient console failure (5xx / network / timeout) we do NOT latch the
// fallback for the full TTL — we serve the last-known-good bundle if we have one,
// or retry after only this short negative window. So a brief console blip never
// blanks an atlas for the whole TTL on the shared renderer.
const ERROR_TTL_MS = Math.min(CACHE_TTL_MS, Number(process.env.OG_ATLAS_ERROR_TTL_MS ?? 5_000));
const FETCH_TIMEOUT_MS = Number(process.env.OG_ATLAS_FETCH_TIMEOUT_MS ?? 5_000);
// The cache holds an entry per address asked about, including unknown ones
// (any Host header a client sends), so it's capped: past this many entries
// the least recently stored go first.
const CACHE_MAX_ENTRIES = Math.max(1, Number(process.env.OG_ATLAS_CACHE_MAX_ENTRIES ?? 1_000));

interface CacheEntry {
  bundle: AtlasBundle;
  expires: number;
}

const cache = new Map<string, CacheEntry>();

const remember = (key: string, bundle: AtlasBundle, ttl: number) => {
  cache.delete(key);
  cache.set(key, { bundle, expires: Date.now() + ttl });

  while (cache.size > CACHE_MAX_ENTRIES) {
    cache.delete(cache.keys().next().value as string);
  }
};

/**
 * Number of cached addresses (for tests).
 */
export const atlasCacheSize = (): number => cache.size;

// The fallback for an address with no atlas behind it (unknown slug or
// domain, or a draft without its preview token), as opposed to a console
// failure.
const MISSING_BUNDLE: AtlasBundle = { ...FALLBACK_BUNDLE, missing: true };

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
export const resolveAtlasBundle = async (slug: string | null, previewToken: string | null = null): Promise<AtlasBundle> => {
  if (!slug) {
    return FALLBACK_BUNDLE;
  }

  return resolve(`slug\u0000${slug}`, `/core_data/public/v1/atlases/${encodeURIComponent(slug)}`, previewToken, `slug "${slug}"`);
};

/**
 * Resolves the atlas whose own domain is `domain` (the request's Host), the
 * same way. Only a domain the console has connected resolves.
 */
export const resolveAtlasBundleByDomain = async (domain: string | null, previewToken: string | null = null): Promise<AtlasBundle> => {
  if (!domain) {
    return MISSING_BUNDLE;
  }

  return resolve(`domain\u0000${domain}`, `/core_data/public/v1/atlases/by_domain?domain=${encodeURIComponent(domain)}`, previewToken, `domain "${domain}"`);
};

const resolve = async (address: string, path: string, previewToken: string | null, label: string): Promise<AtlasBundle> => {
  // A preview link sees the draft; everyone else gets the public answer.
  // Cached apart, so a draft never leaks into the public cache entry.
  const key = previewToken ? `${address}\u0000${previewToken}` : address;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.bundle;
  }

  try {
    const response = await fetch(`${consoleBaseUrl()}${path}`, {
      headers: { Accept: 'application/json', ...(previewToken ? { 'X-OG-Preview': previewToken } : {}) },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });

    if (response.ok) {
      const body = await response.json();
      const atlas = body?.atlas;

      if (atlas?.config) {
        const bundle: AtlasBundle = {
          slug: atlas.slug ?? null,
          preview: atlas.preview === true,
          domain: atlas.domain ?? null,
          config: atlas.config,
          branding: atlas.branding ?? {},
          navigation: atlas.navigation ?? null,
          content: atlas.content ?? null,
          images: atlas.images ?? null
        };
        remember(key, bundle, CACHE_TTL_MS);
        return bundle;
      }

      // 200 but no usable config — treat as unknown, like a 404.
      remember(key, MISSING_BUNDLE, CACHE_TTL_MS);
      return MISSING_BUNDLE;
    }

    if (response.status === 404) {
      remember(key, MISSING_BUNDLE, CACHE_TTL_MS);
      return MISSING_BUNDLE;
    }

    // eslint-disable-next-line no-console
    console.warn(`[atlas] console returned ${response.status} resolving ${label}`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`[atlas] failed to resolve ${label}:`, error instanceof Error ? error.message : error);
  }

  // Transient failure: prefer the last-known-good bundle (don't blank a live
  // atlas because of a console blip); otherwise retry after a short window.
  if (cached && cached.bundle !== FALLBACK_BUNDLE && cached.bundle !== MISSING_BUNDLE) {
    remember(key, cached.bundle, ERROR_TTL_MS);
    return cached.bundle;
  }

  remember(key, FALLBACK_BUNDLE, ERROR_TTL_MS);
  return FALLBACK_BUNDLE;
};
