import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * WordPress REST helper.
 *
 * Longform (standalone pages/essays + per-record detail content) comes from the
 * user's own WordPress, fetched via the public WP REST API
 * (`/wp-json/wp/v2/{pages|posts}`). WordPress is the user's instance, not part
 * of our tier; the atlas config carries the host
 * (`config.wordpress.host` site-wide, or `config.detail_pages.models.<m>.wordpress`
 * per detail model). This helper is the single fetch used by both the standalone
 * page route (Page.astro) and the detail-page integration (WordPressContent.astro).
 *
 * SECURITY: `host` (and the per-model `resource`) are TENANT-controlled via the
 * console, and this runs server-side on the shared renderer, so the fetch is an
 * SSRF surface. fetches are therefore guarded — scheme allowlist, private/
 * loopback/link-local/metadata address blocking (literal IPs and resolved DNS),
 * re-validated manual redirects, a timeout, and a response-size cap — and the
 * tenant `resource` is restricted to a safe path segment. This module imports
 * `node:dns`/`node:net` and MUST stay server-only (it is imported only by
 * server-rendered .astro components).
 */

export interface WordPressDocument {
  title: string | null;
  content: string | null;
}

interface FetchArgs {
  host?: string | null;
  resource?: string;
  /** A numeric WordPress id, or a slug. */
  value?: string | number | null;
}

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);
// `resource` is interpolated into the URL path, so it must be a single safe
// segment — no slashes, no `..` traversal. WP core + custom post types match.
const ALLOWED_RESOURCE = /^[A-Za-z0-9_-]+$/;
const FETCH_TIMEOUT_MS = Number(process.env.OG_WORDPRESS_TIMEOUT_MS ?? 5_000);
const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

// --- SSRF guards -----------------------------------------------------------

const ipv4Parts = (ip: string): number[] | null => {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!match) {
    return null;
  }
  const parts = match.slice(1).map(Number);
  return parts.every((n) => n >= 0 && n <= 255) ? parts : null;
};

const isPrivateIPv4 = (ip: string): boolean => {
  const parts = ipv4Parts(ip);
  if (!parts) {
    return false;
  }
  const [a, b, c] = parts;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local (cloud metadata 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 IETF protocol
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // multicast / reserved / broadcast
  return false;
};

const isPrivateIPv6 = (ip: string): boolean => {
  const addr = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (addr === '::1' || addr === '::') return true; // loopback / unspecified
  if (/^fe[89ab]/.test(addr)) return true; // fe80::/10 link-local
  if (/^f[cd]/.test(addr)) return true; // fc00::/7 unique-local
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(addr); // IPv4-mapped
  if (mapped) {
    return isPrivateIPv4(mapped[1]);
  }
  return false;
};

// Hostnames that must never be fetched, independent of DNS.
const isBlockedHostname = (hostname: string): boolean => {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host === 'metadata' || host === 'metadata.google.internal') return true;
  if (net.isIPv4(host)) return isPrivateIPv4(host);
  if (net.isIPv6(host)) return isPrivateIPv6(host);
  return false;
};

// Resolves the hostname and rejects it if ANY address is private/reserved (so a
// public name with an internal A/AAAA record can't be used to reach the VPC).
// NB: not fully DNS-rebinding-proof (fetch re-resolves); prod should additionally
// restrict the renderer's egress. A literal IP was already range-checked above.
const resolvesToPublicOnly = async (hostname: string): Promise<boolean> => {
  if (net.isIP(hostname)) {
    return true;
  }
  try {
    const records = await dns.lookup(hostname, { all: true });
    return records.length > 0 && records.every(({ address, family }) => (
      family === 4 ? !isPrivateIPv4(address) : !isPrivateIPv6(address)
    ));
  } catch {
    return false; // unresolvable → unsafe
  }
};

// Parses + validates a target URL (scheme, literal-IP range, resolved address).
// Returns the URL when safe to fetch, otherwise null.
const safeTarget = async (rawUrl: string): Promise<URL | null> => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (!ALLOWED_SCHEMES.has(url.protocol)) return null;
  if (isBlockedHostname(url.hostname)) return null;
  if (!(await resolvesToPublicOnly(url.hostname))) return null;

  return url;
};

// Reads a response body up to maxBytes, returning null if the cap is exceeded.
const readCapped = async (response: Response, maxBytes: number): Promise<string | null> => {
  const body = response.body;
  if (!body) {
    const text = await response.text();
    return text.length > maxBytes ? null : text;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks).toString('utf-8');
};

// fetch with scheme/host validation, re-validated manual redirects, a timeout,
// and a response-size cap. Returns the body text, or null when anything is unsafe
// or fails — callers degrade rather than throw.
const guardedFetch = async (rawUrl: string): Promise<string | null> => {
  let next: string | null = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS && next; hop++) {
    const url = await safeTarget(next);
    if (!url) {
      return null;
    }

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      next = location ? new URL(location, url).toString() : null;
      continue;
    }

    if (!response.ok) {
      return null;
    }

    return readCapped(response, MAX_RESPONSE_BYTES);
  }

  return null; // redirect limit exceeded
};

/**
 * Fetches a WordPress document by id (numeric) or slug and returns its rendered
 * title + content. Returns null for a missing/invalid host or value, a blocked
 * (SSRF-guarded) target, a non-OK response, no match, or any network error —
 * callers degrade (404 / render nothing) rather than fail the page. An
 * unreachable or malicious WordPress host never takes down the renderer.
 */
export const fetchWordPressDocument = async ({ host, resource = 'posts', value }: FetchArgs): Promise<WordPressDocument | null> => {
  const trimmedValue = value == null ? '' : `${value}`.trim();

  if (!host || !trimmedValue) {
    return null;
  }

  // Reject a tenant `resource` that isn't a plain path segment (prevents the
  // `../` path-traversal that would otherwise escape `/wp-json/`).
  if (!ALLOWED_RESOURCE.test(resource)) {
    return null;
  }

  // Tolerate a scheme-less host from the console (default to https), then the
  // guard re-validates the full URL.
  const withScheme = /^https?:\/\//i.test(host) ? host : `https://${host}`;
  const base = withScheme.replace(/\/$/, '');

  // Numeric values are treated as WordPress ids, anything else as a slug.
  const url = /^\d+$/.test(trimmedValue)
    ? `${base}/wp-json/wp/v2/${resource}/${trimmedValue}`
    : `${base}/wp-json/wp/v2/${resource}/?slug=${encodeURIComponent(trimmedValue)}`;

  try {
    const text = await guardedFetch(url);
    if (text == null) {
      return null;
    }

    const data = JSON.parse(text);
    const post = Array.isArray(data) ? data[0] : data;

    if (!post) {
      return null;
    }

    return {
      title: post.title?.rendered ?? null,
      content: post.content?.rendered ?? null
    };
  } catch {
    return null;
  }
};
