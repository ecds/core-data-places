/**
 * Two-tenant security slice for the Elasticsearch search handler.
 *
 * The shared index holds every atlas's documents; the only thing keeping one
 * atlas from reading another's is the server-side handler. These tests run the
 * real handler (src/pages/api/search.json.ts) against a real Elasticsearch,
 * with a hermetic index seeded with sentinel documents for two tenants:
 * published, hidden, and a document carrying an "internal" field that must
 * never reach a browser.
 *
 * Needs an Elasticsearch at OG_ELASTICSEARCH_URL (the demo stack's
 * http://localhost:9200); skipped when none is reachable, so the rest of the
 * suite stays green without Docker.
 */
import { runWithAtlas } from '@atlas/server';
import { POST } from '@root/src/pages/api/search.json';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const ES_URL = process.env.OG_ELASTICSEARCH_URL || process.env.ELASTICSEARCH_URL || 'http://localhost:9200';
const INDEX = 'og_tenancy_test';
const OTHER_INDEX = 'og_tenancy_test_other';

// The canonical mapping, as shipped in the schema package next to this repo;
// falls back to dynamic mapping if it isn't checked out.
const MAPPING_PATH = path.resolve(__dirname, '../../../og_schema/es_mapping.json');

const es = async (method: string, route: string, body?: any) => {
  const response = await fetch(`${ES_URL}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  return { status: response.status, body: await response.json().catch(() => null) };
};

const reachable = await fetch(ES_URL).then((r) => r.ok).catch(() => false);

/**
 * Sentinel documents. Tenant A (project 1) and tenant B (project 2) each have
 * a published place; A also has a hidden place, a taxonomy term (model 12, not
 * the places model), and a document with an internal field.
 */
const DOCS = [
  { id: 'a-pub', project_id: '1', model_id: '11', model_type: 'place', uuid: 'a-pub', name: 'Alpha Public', visibility: 'published', types: ['Church'], geo: { point: { lat: 32.08, lon: -81.09 } } },
  { id: 'a-hidden', project_id: '1', model_id: '11', model_type: 'place', uuid: 'a-hidden', name: 'Alpha Hidden', visibility: 'hidden', types: ['Church'] },
  { id: 'a-novis', project_id: '1', model_id: '11', model_type: 'place', uuid: 'a-novis', name: 'Alpha Unflagged', types: ['Church'] },
  { id: 'a-term', project_id: '1', model_id: '12', model_type: 'term', uuid: 'a-term', name: 'Alpha Term', visibility: 'published' },
  { id: 'a-secret', project_id: '1', model_id: '11', model_type: 'place', uuid: 'a-secret', name: 'Alpha Secret Holder', visibility: 'published', types: ['Cemetery'], internal_note: 'DO-NOT-LEAK', legacy_id: 'LEGACY-42' },
  { id: 'b-pub', project_id: '2', model_id: '21', model_type: 'place', uuid: 'b-pub', name: 'Bravo Public', visibility: 'published', types: ['Church'], geo: { point: { lat: 33.75, lon: -84.39 } } }
];

const searchEntry = (overrides: any = {}) => ({
  name: 'places',
  route: '/places',
  result_card: { title: 'name', attributes: [{ name: 'types' }] },
  elasticsearch: { index_name: INDEX, model_ids: ['11'], facet_attributes: ['types'] },
  ...overrides
});

const atlas = (projectIds: string[], search: any[] = [searchEntry()]) => ({
  slug: `tenant-${projectIds.join('-') || 'none'}`,
  config: { core_data: { project_ids: projectIds }, search },
  branding: {},
  navigation: null
});

const TENANT_A = atlas(['1']);
const TENANT_B = atlas(['2'], [searchEntry({ elasticsearch: { index_name: INDEX, model_ids: ['21'], facet_attributes: ['types'] } })]);

/**
 * Runs the handler as the given atlas with an InstantSearch request body.
 */
const search = async (bundle: any, requests: any, searchName = 'places') => {
  const url = `http://renderer.test/api/search.json?search=${encodeURIComponent(searchName)}`;
  const request = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof requests === 'string' ? requests : JSON.stringify(requests)
  });

  const response = await runWithAtlas(bundle, () => POST({ request, url: new URL(url) } as any));
  const body = await response.json().catch(() => null);

  return { status: response.status, body, result: body?.results?.[0] };
};

const names = (result: any) => (result?.hits || []).map((hit: any) => hit.name).sort();

const req = (params: any = {}, indexName = INDEX) => [{ indexName, params: { query: '', hitsPerPage: 50, facets: ['types'], ...params } }];

describe.skipIf(!reachable)('two-tenant security slice', () => {
  beforeAll(async () => {
    process.env.OG_ELASTICSEARCH_URL = ES_URL;

    await es('DELETE', `/${INDEX}`);
    await es('DELETE', `/${OTHER_INDEX}`);

    const mapping = fs.existsSync(MAPPING_PATH) ? JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8')) : {};
    const created = await es('PUT', `/${INDEX}`, { mappings: mapping.mappings, settings: mapping.settings });
    expect(created.status, JSON.stringify(created.body)).toBe(200);

    await es('PUT', `/${OTHER_INDEX}`, {});

    for (const doc of DOCS) {
      const { id, ...source } = doc;
      const put = await es('PUT', `/${INDEX}/_doc/${id}?refresh=true`, source);
      expect(put.status, JSON.stringify(put.body)).toBeLessThan(300);
    }

    // The other index holds a copy of tenant A's public place — reachable only
    // if the handler lets a request pick its own index.
    await es('PUT', `/${OTHER_INDEX}/_doc/a-pub?refresh=true`, { ...DOCS[0], name: 'Alpha In Other Index' });
  }, 30_000);

  afterAll(async () => {
    await es('DELETE', `/${INDEX}`);
    await es('DELETE', `/${OTHER_INDEX}`);
  });

  describe('tenant filter', () => {
    test('each atlas sees only its own published places', async () => {
      const a = await search(TENANT_A, req());
      expect(a.status).toBe(200);
      expect(names(a.result)).toEqual(['Alpha Public', 'Alpha Secret Holder']);

      const b = await search(TENANT_B, req());
      expect(names(b.result)).toEqual(['Bravo Public']);
    });

    test('facet counts are scoped too', async () => {
      const a = await search(TENANT_A, req());
      expect(a.result.facets.types).toEqual({ Church: 1, Cemetery: 1 });
    });

    test('a request cannot widen the tenant with its own filters', async () => {
      // The tenant fields are not facet/filter attributes, so a hand-crafted
      // filter on them is refused outright (400) rather than reaching ES.
      const refused = [
        req({ filters: 'project_id:2' }),
        req({ filters: 'project_id:1 OR project_id:2' }),
        req({ facetFilters: [['project_id:2']] }),
        req({ facetFilters: ['project_id:2'] }),
        req({ numericFilters: ['project_id>0'] })
      ];

      for (const body of refused) {
        const { status, result } = await search(TENANT_A, body);
        expect(status, JSON.stringify(body)).toBe(400);
        expect(result, JSON.stringify(body)).toBeUndefined();
      }

      const { result } = await search(TENANT_A, req({ query: 'Bravo' }));
      expect(names(result)).toEqual([]);
    });

    test('even an atlas that declares the tenant fields as facets cannot widen them', async () => {
      // A misconfigured (or malicious) atlas config: project_id and visibility
      // exposed as facets. The base filters are ANDed on the server, so the
      // most a client can do is narrow.
      const leaky = atlas(['1'], [searchEntry({
        elasticsearch: { index_name: INDEX, model_ids: ['11'], facet_attributes: ['types', 'project_id', 'visibility'] }
      })]);

      const bodies = [
        req({ facetFilters: [['project_id:2']], facets: ['project_id'] }),
        req({ facetFilters: [['project_id:1', 'project_id:2']], facets: ['project_id'] }),
        req({ facetFilters: [['visibility:hidden']], facets: ['visibility'] }),
        req({ facetFilters: [['visibility:hidden', 'visibility:published']], facets: ['visibility'] })
      ];

      for (const body of bodies) {
        const { status, result } = await search(leaky, body);
        expect(status, JSON.stringify(body)).toBe(200);
        expect(names(result), JSON.stringify(body)).not.toContain('Bravo Public');
        expect(names(result), JSON.stringify(body)).not.toContain('Alpha Hidden');
        expect(result.facets.project_id || {}, JSON.stringify(body)).not.toHaveProperty('2');
        expect(result.facets.visibility || {}, JSON.stringify(body)).not.toHaveProperty('hidden');
      }
    });

    test('an atlas with no project ids fails closed', async () => {
      const { status, result } = await search(atlas([]), req());
      expect(status).toBe(200);
      expect(result.nbHits).toBe(0);
    });

    test('a request outside any atlas fails closed', async () => {
      const url = `http://renderer.test/api/search.json?search=places`;
      const request = new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req()) });
      const response = await POST({ request, url: new URL(url) } as any);
      // The fallback bundle declares no search on this index.
      expect(response.status).toBe(404);
    });
  });

  describe('visibility', () => {
    test('hidden and unflagged documents are never returned', async () => {
      const { result } = await search(TENANT_A, req({ query: 'Alpha' }));
      expect(names(result)).not.toContain('Alpha Hidden');
      expect(names(result)).not.toContain('Alpha Unflagged');
    });

    test('a request cannot re-include hidden documents', async () => {
      const bodies = [
        req({ filters: 'visibility:hidden' }),
        req({ facetFilters: [['visibility:hidden', 'visibility:published']] })
      ];

      for (const body of bodies) {
        const { status, result } = await search(TENANT_A, body);
        expect(status, JSON.stringify(body)).toBe(400);
        expect(result, JSON.stringify(body)).toBeUndefined();
      }
    });
  });

  describe('model scope', () => {
    test('a places search does not return the project\'s taxonomy terms', async () => {
      const { result } = await search(TENANT_A, req({ query: 'Alpha' }));
      expect(names(result)).not.toContain('Alpha Term');
    });
  });

  describe('internal fields', () => {
    test('only declared fields reach the browser', async () => {
      const { result } = await search(TENANT_A, req({ query: 'Secret' }));
      const hit = result.hits.find((h: any) => h.name === 'Alpha Secret Holder');

      expect(hit).toBeDefined();
      expect(hit).not.toHaveProperty('internal_note');
      expect(hit).not.toHaveProperty('legacy_id');
      expect(JSON.stringify(result)).not.toContain('DO-NOT-LEAK');
    });

    test('a request cannot ask for extra source fields', async () => {
      const bodies = [
        req({ attributesToRetrieve: ['*'] }),
        req({ attributesToRetrieve: ['internal_note', 'legacy_id'] }),
        req({ attributesToHighlight: ['internal_note'] })
      ];

      for (const body of bodies) {
        const { result } = await search(TENANT_A, body);
        expect(JSON.stringify(result), JSON.stringify(body)).not.toContain('DO-NOT-LEAK');
        expect(JSON.stringify(result), JSON.stringify(body)).not.toContain('LEGACY-42');
      }
    });
  });

  describe('mixed and malformed requests', () => {
    test('a request naming another index is refused', async () => {
      const { status } = await search(TENANT_A, req({}, OTHER_INDEX));
      expect(status).toBe(404);
    });

    test('a multi-search body cannot smuggle a second index', async () => {
      const body = [...req(), ...req({}, OTHER_INDEX)];
      const { status } = await search(TENANT_A, body);
      expect(status).toBe(400);
    });

    test('a sort suffix does not bypass index validation', async () => {
      const ok = await search(TENANT_A, req({}, `${INDEX}_sort_name_asc`));
      expect(ok.status).toBe(200);
      expect(names(ok.result)).toEqual(['Alpha Public', 'Alpha Secret Holder']);

      const other = await search(TENANT_A, req({}, `${OTHER_INDEX}_sort_name_asc`));
      expect(other.status).toBe(404);
    });

    test('an unknown search name is refused, even on a valid index', async () => {
      const { status } = await search(TENANT_A, req(), 'not-a-search');
      expect(status).toBe(404);
    });

    test('a search name from another atlas resolves against the caller\'s config only', async () => {
      // Tenant B has no search named 'places-b'; naming it gets nothing, not tenant A's.
      const { status } = await search(TENANT_B, req(), 'places-b');
      expect(status).toBe(404);
    });

    test('malformed bodies are refused without querying', async () => {
      expect((await search(TENANT_A, 'not json')).status).toBe(400);
      expect((await search(TENANT_A, {})).status).toBe(400);
      expect((await search(TENANT_A, [])).status).toBe(400);
      expect((await search(TENANT_A, [{ params: {} }])).status).toBe(400);
    });

    test('a search config without an index is not served', async () => {
      const broken = atlas(['1'], [searchEntry({ elasticsearch: { facet_attributes: ['types'] } })]);
      const { status } = await search(broken, req());
      expect(status).toBe(404);
    });
  });

  describe('request shapes the UI actually sends', () => {
    test('a disjunctive facet follow-up with a string facets param is accepted', async () => {
      const body = [
        { indexName: INDEX, params: { query: '', facets: ['types'], facetFilters: [['types:Church']], hitsPerPage: 50 } },
        { indexName: INDEX, params: { query: '', facets: 'types', hitsPerPage: 0, analytics: false } }
      ];

      const { status, body: response } = await search(TENANT_A, body);
      expect(status).toBe(200);
      expect(response.results).toHaveLength(2);
      expect(names(response.results[0])).toEqual(['Alpha Public']);
      expect(response.results[1].facets.types).toEqual({ Church: 1, Cemetery: 1 });
    });
  });
});
