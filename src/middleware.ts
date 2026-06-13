import { defineMiddleware } from 'astro:middleware';
import { resolveAtlasBundle, runWithAtlas } from '@atlas/server';

/**
 * Hosts that are never an atlas subdomain (the apex / infra labels). Kept in
 * sync with the reserved-slug list the console rejects at atlas creation, so a
 * tenant can never claim an infra hostname (console/coredata/...).
 */
const RESERVED_SUBDOMAINS = new Set([
  'www', 'api', 'app', 'console', 'coredata', 'staging', 'assets', 'static',
  'cdn', 'localhost', '127', '0'
]);

/**
 * Derives an atlas slug from a Host header for the multi-tenant production
 * model (`<slug>.<base-domain>`), plus the local `<slug>.localhost`
 * convenience. Returns null when the host carries no atlas subdomain.
 */
const subdomainSlug = (host: string): string | null => {
  const hostname = host.split(':')[0].trim().toLowerCase();

  if (!hostname || hostname === 'localhost') {
    return null;
  }

  // `<slug>.localhost` — works in browsers without DNS/hosts changes.
  if (hostname.endsWith('.localhost')) {
    const label = hostname.slice(0, -'.localhost'.length);
    return label && !RESERVED_SUBDOMAINS.has(label) ? label : null;
  }

  // `<slug>.<OG_BASE_DOMAIN>` — strip the configured apex, the remainder
  // (single label) is the slug.
  const baseDomain = process.env.OG_BASE_DOMAIN?.trim().toLowerCase();
  if (baseDomain && hostname.endsWith(`.${baseDomain}`)) {
    const label = hostname.slice(0, -(baseDomain.length + 1));
    return label && !label.includes('.') && !RESERVED_SUBDOMAINS.has(label) ? label : null;
  }

  return null;
};

/**
 * Resolves the atlas slug for a request, in priority order:
 *   1. `X-Atlas-Slug` header   — explicit override (trusted proxy / testing).
 *   2. Host subdomain           — production multi-tenant + `<slug>.localhost`.
 *   3. `OG_SITE_SLUG` env       — single-tenant / local default.
 *
 * NB: there is intentionally NO `?atlas=` query param. It only set the top-level
 * page's atlas while the client islands (/config.json, /api/i18n) — fetched
 * without the param — fell back to Host/env, so the page showed one atlas's
 * chrome with another's data. For local multi-atlas testing use
 * `<slug>.localhost:<port>` (handled below) or the `X-Atlas-Slug` header.
 */
const resolveSlug = (request: Request, url: URL): string | null => {
  const header = request.headers.get('x-atlas-slug');
  if (header) {
    return header.trim().toLowerCase();
  }

  const host = request.headers.get('host') ?? url.host;
  const sub = subdomainSlug(host ?? '');
  if (sub) {
    return sub;
  }

  const env = process.env.OG_SITE_SLUG;
  if (env) {
    return env.trim().toLowerCase();
  }

  return null;
};

/**
 * Per-request atlas resolution. Runs for every request — including the
 * Header/Footer server-island sub-requests and the client /config.json fetch —
 * so each independently resolves the same slug (from Host or env) and renders
 * the right atlas. The resolved bundle is exposed on `Astro.locals.atlas` and,
 * for nested server code, via AsyncLocalStorage (see @atlas/server).
 */
export const onRequest = defineMiddleware(async (context, next) => {
  // Liveness probe: never depend on atlas resolution or the console, so a
  // load balancer's health check can't be knocked out by a console blip.
  if (context.url.pathname === '/health') {
    return next();
  }

  const slug = resolveSlug(context.request, context.url);
  const bundle = await resolveAtlasBundle(slug);

  context.locals.atlas = bundle;

  return runWithAtlas(bundle, () => next());
});
