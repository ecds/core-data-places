import { defineMiddleware } from 'astro:middleware';
import { classifyHost, domainUrl } from '@atlas/hosts';
import { resolveAtlasBundle, resolveAtlasBundleByDomain, runWithAtlas } from '@atlas/server';

type AtlasAddress =
  | { kind: 'header' | 'subdomain' | 'env'; slug: string }
  | { kind: 'domain'; domain: string };

/**
 * Resolves which atlas a request is for, in priority order:
 *   1. `X-Atlas-Slug` header   — explicit override, honoured only when
 *                                `OG_TRUST_ATLAS_SLUG_HEADER=true` (a proxy
 *                                that sets it and strips the client's). A
 *                                header any client can send would let one
 *                                atlas's page be cached under another's
 *                                address by a CDN keyed on Host and path.
 *   2. Host                    — an atlas's platform address
 *                                (`<slug>.<OG_BASE_DOMAIN>`, `<slug>.localhost`)
 *                                or its own domain (see @atlas/hosts). The
 *                                proxy in front must pass the original Host.
 *   3. `OG_SITE_SLUG` env       — single-tenant / local default.
 *
 * A request that resolves to none of these gets the not-found page.
 *
 * NB: there is intentionally NO `?atlas=` query param. It only set the top-level
 * page's atlas while the client islands (/config.json, /api/i18n) — fetched
 * without the param — fell back to Host/env, so the page showed one atlas's
 * chrome with another's data. For local multi-atlas testing use
 * `<slug>.localhost:<port>`.
 */
const resolveAddress = (request: Request, url: URL): AtlasAddress | null => {
  const header = process.env.OG_TRUST_ATLAS_SLUG_HEADER === 'true' ? request.headers.get('x-atlas-slug') : null;
  if (header) {
    return { kind: 'header', slug: header.trim().toLowerCase() };
  }

  const host = classifyHost(request.headers.get('host') ?? url.host ?? '', process.env.OG_BASE_DOMAIN);
  if (host) {
    return host.kind === 'domain' ? host : { kind: 'subdomain', slug: host.slug };
  }

  const env = process.env.OG_SITE_SLUG;
  if (env) {
    return { kind: 'env', slug: env.trim().toLowerCase() };
  }

  return null;
};

const resolveBundle = (address: AtlasAddress, previewToken: string | null) => (
  address.kind === 'domain'
    ? resolveAtlasBundleByDomain(address.domain, previewToken)
    : resolveAtlasBundle(address.slug, previewToken)
);

// --- Drafts and preview links ----------------------------------------------
//
// An unpublished atlas is served only to its preview link,
// `https://<atlas>/?preview=<token>` (the console hands it out). The token
// moves into a cookie on first use and the browser is sent to the same
// address without it, so it doesn't stay in the address bar, history or
// Referer headers; every later request — pages, server islands, the client's
// /config.json, /api/search.json — carries the cookie and is resolved as the
// draft. Preview responses are never cached or indexed.

const PREVIEW_PARAM = 'preview';
const PREVIEW_COOKIE = 'og_preview';
const PREVIEW_MAX_AGE = 60 * 60 * 24 * 30;
const TOKEN_FORMAT = /^[A-Za-z0-9]{24,64}$/;

const readPreviewToken = (request: Request): string | null => {
  const cookies = request.headers.get('cookie') || '';
  const match = cookies.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${PREVIEW_COOKIE}=`));
  const token = match ? decodeURIComponent(match.slice(PREVIEW_COOKIE.length + 1)) : null;

  return token && TOKEN_FORMAT.test(token) ? token : null;
};

const previewCookie = (token: string, secure: boolean) => [
  `${PREVIEW_COOKIE}=${encodeURIComponent(token)}`,
  'Path=/',
  `Max-Age=${PREVIEW_MAX_AGE}`,
  'HttpOnly',
  'SameSite=Lax',
  secure ? 'Secure' : null
].filter(Boolean).join('; ');

const NO_STORE = 'private, no-store';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * The answer for an address with no atlas behind it (an unknown subdomain,
 * or a draft without its preview link): a real 404, not an empty atlas.
 * Never cached by browsers or a CDN, so a newly published atlas appears as
 * soon as the renderer's own bundle cache (30 s) refreshes.
 */
const notFound = (url: URL, hadPreview: boolean): Response => {
  if (url.pathname.startsWith('/api/') || url.pathname.endsWith('.json')) {
    return new Response(JSON.stringify({ error: 'No atlas at this address.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': NO_STORE }
    });
  }

  const note = hadPreview
    ? '<p>If you were sent a preview link, it may have been replaced by a newer one. Ask the atlas’s curator for the current link.</p>'
    : '';

  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>No atlas here</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:15vh 24px;color:#111827;background:#fff}main{max-width:36rem;margin:0 auto}h1{font-size:1.75rem;margin:0 0 1rem}p{line-height:1.6;color:#374151}</style>
</head><body><main><h1>There’s no atlas at this address</h1><p>${escapeHtml(url.host)} doesn’t have a published atlas. Check the address, or the atlas may not be published yet.</p>${note}</main></body></html>`;

  return new Response(body, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': NO_STORE } });
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

  const { request, url } = context;
  const readOnly = request.method === 'GET' || request.method === 'HEAD';

  const offered = url.searchParams.get(PREVIEW_PARAM);
  const offeredToken = offered && TOKEN_FORMAT.test(offered) && readOnly ? offered : null;
  const cookieToken = readPreviewToken(request);

  const address = resolveAddress(request, url);
  if (!address) {
    return notFound(url, false);
  }

  const bundle = await resolveBundle(address, offeredToken ?? cookieToken);

  // An atlas with its own domain: its platform address sends visitors there,
  // path and query kept. A preview (link or cookie) carries its token along,
  // so the domain sets its own cookie; that redirect is temporary and never
  // cached. The public one is permanent but cached for an hour only, so
  // removing the domain isn't undone by stale browser caches for long.
  if (address.kind === 'subdomain' && bundle.domain && !bundle.missing && readOnly) {
    const token = offeredToken ?? (bundle.preview ? cookieToken : null);
    const preview = !!token;

    return new Response(null, {
      status: preview ? 302 : 301,
      headers: {
        Location: domainUrl(bundle.domain, request, url, token),
        'Cache-Control': preview ? NO_STORE : 'public, max-age=3600',
        ...(preview ? { 'Referrer-Policy': 'no-referrer' } : {})
      }
    });
  }

  // A preview link: keep the token in a cookie and drop it from the address.
  if (offeredToken) {
    const clean = new URL(url);
    clean.searchParams.delete(PREVIEW_PARAM);
    const secure = url.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';

    return new Response(null, {
      status: 303,
      headers: {
        Location: `${clean.pathname}${clean.search}${clean.hash}`,
        'Set-Cookie': previewCookie(offeredToken, secure),
        'Cache-Control': NO_STORE,
        'Referrer-Policy': 'no-referrer'
      }
    });
  }

  if (bundle.missing) {
    return notFound(url, !!cookieToken);
  }

  context.locals.atlas = bundle;

  const response = await runWithAtlas(bundle, () => next());

  if (!bundle.preview) {
    return response;
  }

  // Some responses (redirects) carry immutable headers; copy those.
  const preview = (() => {
    try {
      response.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return response;
    } catch {
      return new Response(response.body, response);
    }
  })();

  preview.headers.set('Cache-Control', NO_STORE);
  preview.headers.delete('Netlify-CDN-Cache-Control');
  preview.headers.set('X-Robots-Tag', 'noindex, nofollow');

  return preview;
});
