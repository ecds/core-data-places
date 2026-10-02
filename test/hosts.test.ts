import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { classifyHost, domainUrl, hostnameOf, portOf } from '../src/atlas/hosts';
import { atlasCacheSize, resolveAtlasBundle, resolveAtlasBundleByDomain } from '../src/atlas/server';

describe('classifyHost', () => {
  const base = 'atlas.example.edu';

  test('an atlas subdomain of the base domain is its slug', () => {
    expect(classifyHost('savannah.atlas.example.edu', base)).toEqual({ kind: 'subdomain', slug: 'savannah' });
    expect(classifyHost('Savannah.Atlas.Example.edu.:443', base)).toEqual({ kind: 'subdomain', slug: 'savannah' });
  });

  test('the base itself, infra labels and deeper names under it are no atlas', () => {
    expect(classifyHost('atlas.example.edu', base)).toBeNull();
    expect(classifyHost('www.atlas.example.edu', base)).toBeNull();
    expect(classifyHost('console.atlas.example.edu', base)).toBeNull();
    expect(classifyHost('a.b.atlas.example.edu', base)).toBeNull();
  });

  test('a one-label .localhost name is a slug; deeper ones are domains', () => {
    expect(classifyHost('hrcga3.localhost:4321')).toEqual({ kind: 'subdomain', slug: 'hrcga3' });
    expect(classifyHost('savannah.test.localhost:4321')).toEqual({ kind: 'domain', domain: 'savannah.test.localhost' });
    expect(classifyHost('www.localhost')).toBeNull();
  });

  test('any other domain name is looked up as an atlas domain', () => {
    expect(classifyHost('Atlas.Example.org', base)).toEqual({ kind: 'domain', domain: 'atlas.example.org' });
    expect(classifyHost('example.org')).toEqual({ kind: 'domain', domain: 'example.org' });
  });

  test('addresses that are no domain name are no atlas', () => {
    expect(classifyHost('localhost:4321')).toBeNull();
    expect(classifyHost('127.0.0.1:4321')).toBeNull();
    expect(classifyHost('[::1]:4321')).toBeNull();
    expect(classifyHost('renderer:4321')).toBeNull();
    expect(classifyHost('bad_name.example.org')).toBeNull();
    expect(classifyHost('-x.example.org')).toBeNull();
    expect(classifyHost('')).toBeNull();
  });

  test('host and port parsing', () => {
    expect(hostnameOf('Example.org.:8080')).toBe('example.org');
    expect(portOf('example.org:8080')).toBe('8080');
    expect(portOf('[::1]:4321')).toBe('4321');
    expect(portOf('example.org')).toBeNull();
  });
});

describe('domainUrl', () => {
  const request = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

  test('keeps path and query, and a development port', () => {
    const url = new URL('http://savannah.localhost:4321/en/search/places?q=church#map');
    const req = request(url.toString(), { host: 'savannah.localhost:4321' });

    expect(domainUrl('savannah.test.localhost', req, url)).toBe('http://savannah.test.localhost:4321/en/search/places?q=church');
  });

  test('uses the forwarded scheme and drops default ports', () => {
    const url = new URL('http://savannah.atlas.example.edu/en/');
    const req = request(url.toString(), { host: 'savannah.atlas.example.edu', 'x-forwarded-proto': 'https' });

    expect(domainUrl('atlas.example.org', req, url)).toBe('https://atlas.example.org/en/');

    // A port in a client's X-Forwarded-Host isn't carried into the (cacheable) redirect.
    const forged = request(url.toString(), { host: 'savannah.atlas.example.edu', 'x-forwarded-host': 'savannah.atlas.example.edu:8443', 'x-forwarded-proto': 'https' });
    expect(domainUrl('atlas.example.org', forged, url)).toBe('https://atlas.example.org/en/');

    const req443 = request(url.toString(), { host: 'savannah.atlas.example.edu:443', 'x-forwarded-proto': 'https' });
    expect(domainUrl('atlas.example.org', req443, url)).toBe('https://atlas.example.org/en/');
  });

  test('carries a preview token, replacing one already in the query', () => {
    const url = new URL('http://savannah.localhost:4321/en/?preview=old&x=1');
    const req = request(url.toString(), { host: 'savannah.localhost:4321' });

    expect(domainUrl('savannah.test.localhost', req, url, 'a'.repeat(32))).toBe(`http://savannah.test.localhost:4321/en/?preview=${'a'.repeat(32)}&x=1`);
  });
});

describe('resolving an atlas by domain', () => {
  const calls: string[] = [];

  beforeEach(() => {
    process.env.OG_CONSOLE_URL = 'http://console.test';
    calls.length = 0;

    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      calls.push(`${url} ${init?.headers?.['X-OG-Preview'] ?? ''}`.trim());

      if (url.endsWith('/atlases/by_domain?domain=atlas.example.org')) {
        return new Response(JSON.stringify({ atlas: { slug: 'savannah', domain: 'atlas.example.org', config: { search: [] } } }));
      }

      return new Response(null, { status: 404 });
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  test('asks the console by domain, and carries the domain on the bundle', async () => {
    const bundle = await resolveAtlasBundleByDomain('atlas.example.org');

    expect(calls).toEqual(['http://console.test/core_data/public/v1/atlases/by_domain?domain=atlas.example.org']);
    expect(bundle.slug).toBe('savannah');
    expect(bundle.domain).toBe('atlas.example.org');
    expect(bundle.missing).toBeFalsy();
  });

  test('an unknown domain is missing, and a slug lookup is cached apart from a domain lookup', async () => {
    expect((await resolveAtlasBundleByDomain('nobody.example.org')).missing).toBe(true);
    expect((await resolveAtlasBundle('atlas.example.org')).missing).toBe(true);
    expect(calls).toEqual([
      'http://console.test/core_data/public/v1/atlases/by_domain?domain=nobody.example.org',
      'http://console.test/core_data/public/v1/atlases/atlas.example.org'
    ]);
  });

  test('the cache stays bounded however many hosts are asked about', async () => {
    for (let i = 0; i < 1_100; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await resolveAtlasBundleByDomain(`random-${i}.example.org`);
    }

    expect(atlasCacheSize()).toBeLessThanOrEqual(1_000);
  });
});
