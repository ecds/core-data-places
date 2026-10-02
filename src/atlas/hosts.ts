/**
 * Which atlas an address is: the Host header of a request to the shared
 * renderer, read without asking the console.
 *
 * - `<slug>.<OG_BASE_DOMAIN>` — an atlas's platform address;
 * - `<slug>.localhost` — the same on a development machine (browsers resolve
 *   any *.localhost name to the machine, no DNS or hosts file);
 * - any other domain name — perhaps an atlas's own domain
 *   (atlas.example.org), looked up by domain. In development that includes
 *   names like `atlas.test.localhost` (two or more labels before .localhost).
 *
 * The apex itself, IP addresses, `localhost` and infra labels are no atlas.
 */

/**
 * Hosts that are never an atlas subdomain (the apex / infra labels). Kept in
 * sync with the reserved-slug list the console rejects at atlas creation, so a
 * tenant can never claim an infra hostname (console/coredata/...).
 */
export const RESERVED_SUBDOMAINS = new Set([
  'www', 'api', 'app', 'console', 'coredata', 'staging', 'assets', 'static',
  'cdn', 'localhost', '127', '0'
]);

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
// The console's slug format (lowercase letters, digits, hyphens; ≤63).
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

export type HostAddress =
  | { kind: 'subdomain'; slug: string }
  | { kind: 'domain'; domain: string };

/**
 * The lower-case hostname of a Host header value, without port or trailing
 * dot; null for an IPv6 literal.
 */
export const hostnameOf = (host: string): string | null => {
  const value = host.trim().toLowerCase();

  if (!value || value.startsWith('[')) {
    return null;
  }

  return value.split(':')[0].replace(/\.+$/, '') || null;
};

/**
 * The port of a Host header value ("example.org:4321" → "4321"), or null.
 */
export const portOf = (host: string): string | null => {
  const value = host.trim();
  const match = value.startsWith('[') ? value.match(/\]:(\d+)$/) : value.match(/:(\d+)$/);

  return match ? match[1] : null;
};

const isDomainName = (labels: string[]) => (
  labels.length >= 2
    && labels.join('.').length <= 253
    && labels.every((label) => LABEL.test(label))
    && !/^\d+$/.test(labels[labels.length - 1])
);

const slugLabel = (label: string): HostAddress | null => (
  SLUG.test(label) && !RESERVED_SUBDOMAINS.has(label) ? { kind: 'subdomain', slug: label } : null
);

/**
 * What `host` addresses: an atlas's platform address (by slug), a domain to
 * look up, or nothing.
 */
export const classifyHost = (host: string, baseDomain?: string | null): HostAddress | null => {
  const hostname = hostnameOf(host);

  if (!hostname || hostname === 'localhost') {
    return null;
  }

  const labels = hostname.split('.');

  if (hostname.endsWith('.localhost')) {
    const inner = labels.slice(0, -1);

    if (inner.length === 1) {
      return slugLabel(inner[0]);
    }

    return isDomainName(labels) ? { kind: 'domain', domain: hostname } : null;
  }

  const base = baseDomain?.trim().toLowerCase().replace(/\.+$/, '');
  if (base) {
    if (hostname === base) {
      return null;
    }

    if (hostname.endsWith(`.${base}`)) {
      const label = hostname.slice(0, -(base.length + 1));
      // Deeper names under the base are never an atlas: the console doesn't
      // connect them as domains.
      return label.includes('.') ? null : slugLabel(label);
    }
  }

  return isDomainName(labels) ? { kind: 'domain', domain: hostname } : null;
};

/**
 * The address `url` has on the atlas's own `domain`: same path and query,
 * the request's scheme (from X-Forwarded-Proto behind a proxy), and the
 * Host's port when it isn't the scheme's default (a development server on
 * :4321). Not X-Forwarded-Host: the redirect is cacheable, and a port from
 * a header the client chose would be cached for everyone.
 * `previewToken` rides along as ?preview= so the domain can set its own
 * preview cookie.
 */
export const domainUrl = (domain: string, request: Request, url: URL, previewToken?: string | null): string => {
  const host = request.headers.get('host') || url.host;
  const proto = (request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '')).split(',')[0].trim().toLowerCase();
  const port = portOf(host);
  const defaultPort = proto === 'https' ? '443' : '80';

  const target = new URL(`${proto === 'https' ? 'https' : 'http'}://${domain}${port && port !== defaultPort ? `:${port}` : ''}`);
  target.pathname = url.pathname;
  target.search = url.search;

  if (previewToken) {
    target.searchParams.set('preview', previewToken);
  }

  return target.toString();
};
