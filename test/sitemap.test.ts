import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { countRecordUrls, indexXml, pageUrls, publicOrigin, recordUrls, urlsetXml } from '../src/utils/sitemap';

const config = {
  core_data: { project_ids: ['7'] },
  i18n: { locales: ['en', 'es'] },
  detail_pages: { models: { places: {} } },
  search: [{ name: 'places', elasticsearch: { index_name: 'og_test', model_ids: ['11'] } }]
};

// 12,000 place records, served 5,000 at a time in uuid order.
const RECORDS = Array.from({ length: 12_000 }, (_v, i) => ({ uuid: `u${String(i).padStart(5, '0')}`, model_type: 'place', date_modified: '2026-10-01T00:00:00Z' }));

describe('sitemap', () => {
  const bodies: any[] = [];

  beforeEach(() => {
    process.env.OG_ELASTICSEARCH_URL = 'http://es.test:9200';
    bodies.length = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      bodies.push(body);

      if (body.size === 0) {
        return new Response(JSON.stringify({ hits: { total: { value: RECORDS.length } } }));
      }

      const start = body.search_after ? RECORDS.findIndex((r) => r.uuid === body.search_after[0]) + 1 : 0;
      const hits = RECORDS.slice(start, start + body.size).map((r) => ({ _source: r, sort: [r.uuid] }));
      return new Response(JSON.stringify({ hits: { hits } }));
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  test('filters on the atlas, its models, published records and detail-page models', async () => {
    await countRecordUrls(config);
    const filters = bodies[0].query.bool.filter;

    expect(filters).toContainEqual({ terms: { project_id: ['7'] } });
    expect(filters).toContainEqual({ terms: { model_id: ['11'] } });
    expect(filters).toContainEqual({ term: { visibility: 'published' } });
    expect(filters).toContainEqual({ terms: { model_type: ['place'] } });
  });

  test('counts every record once per locale', async () => {
    expect(await countRecordUrls(config)).toBe(24_000);
  });

  test('pages through the index and skips into a later file', async () => {
    const first = await recordUrls('https://a.test', config, 0, 10);
    expect(first[0].loc).toBe('https://a.test/en/places/u00000');
    expect(first[1].loc).toBe('https://a.test/es/places/u00000');

    const later = await recordUrls('https://a.test', config, 20_000, 3);
    expect(later.map((u) => u.loc)).toEqual([
      'https://a.test/en/places/u10000',
      'https://a.test/es/places/u10000',
      'https://a.test/en/places/u10001'
    ]);
    expect(bodies.some((b) => b.search_after)).toBe(true);
  });

  test('lists nothing for an atlas without detail pages', async () => {
    expect(await recordUrls('https://a.test', { ...config, detail_pages: {} })).toEqual([]);
    expect(await countRecordUrls({ ...config, detail_pages: {} })).toBe(0);
  });

  test('lists home, pages and searches per locale, escaped', () => {
    const urls = pageUrls('https://a.test', config, { pages: [{ slug: 'about' }, { slug: 'r&d' }] });
    expect(urls.map((u) => u.loc)).toContain('https://a.test/es/pages/r%26d');
    expect(urlsetXml([{ loc: 'https://a.test/?a=1&b=2' }])).toContain('<loc>https://a.test/?a=1&amp;b=2</loc>');
    expect(indexXml(['https://a.test/sitemap/0.xml'])).toContain('<sitemapindex');
  });

  test('takes the address visitors use from a proxy', () => {
    const request = new Request('http://10.0.0.5:4321/sitemap.xml', { headers: { host: '10.0.0.5:4321', 'x-forwarded-host': 'hrcga.example.org', 'x-forwarded-proto': 'https' } });
    expect(publicOrigin(request)).toBe('https://hrcga.example.org');
  });
});
