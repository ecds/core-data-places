/**
 * Time on the Elasticsearch path (src/search/elasticsearch/dates.ts): the
 * config expansion, the value parsing every display shares, and — against a
 * real Elasticsearch, through the real search handler — the computed year
 * fields, the overlap filter, the date sorts and the dates on hits.
 */
import { runWithAtlas } from '@atlas/server';
import { POST } from '@root/src/pages/api/search.json';
import {
  expandDates,
  formatDateValue,
  toDateRange,
  toHitDates,
  toOverlapFilters,
  toYears
} from '@search/elasticsearch/dates';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const fuzzy = (start: string, end: string, accuracy: number, range = false, description?: string) => ({
  label: 'Date listed', value: { start_date: start, end_date: end, accuracy, range, ...(description ? { description } : {}) }
});

describe('reading date values', () => {
  test('every stored shape gives its years', () => {
    expect(toYears(fuzzy('1983-03-01', '1983-03-31', 1))).toEqual([1983, 1983]);
    expect(toYears(fuzzy('1861-01-01', '1865-12-31', 0, true))).toEqual([1861, 1865]);
    expect(toYears({ label: 'Built', value: '1911-05-02' })).toEqual([1911, 1911]);
    expect(toYears({ label: 'Year', value: 1890 })).toEqual([1890, 1890]);
    expect(toYears({ label: 'Listed', value: '1983-03-' })).toEqual([1983, 1983]);
    expect(toYears({ label: 'Listed', value: 'c. 1890' })).toBeNull();
    expect(toYears(null)).toBeNull();
    // a canonical (promoted) field carries the fuzzy date bare
    expect(toYears({ start_date: '1700-01-01', end_date: '1700-12-31', accuracy: 0 })).toEqual([1700, 1700]);
  });

  test('a timestamp is the nearest day, in any time zone it was saved from', () => {
    expect(toDateRange('1983-01-01T05:00:00.000Z')?.start).toEqual({ year: 1983, month: 1, day: 1 });
    expect(toDateRange('1982-12-31T23:00:00.000Z')?.start).toEqual({ year: 1983, month: 1, day: 1 });
    // the UTC instant, as the script reads it; no offset reads as UTC
    expect(toYears('1983-01-01T00:00:00+14:00')).toEqual([1982, 1982]);
    expect(toYears('1983-01-01T05:00:00')).toEqual([1983, 1983]);
    // unreadable: the leading date
    expect(toYears('1983-03-15Tnoon')).toEqual([1983, 1983]);
  });

  test('only real months and days; out-of-range years are no date', () => {
    expect(toDateRange('1983-99-99')).toMatchObject({ start: { year: 1983 }, accuracy: 'year' });
    expect(formatDateValue('1983-02-29')).toBe('February 1983');
    expect(formatDateValue('1984-02-29')).toBe('February 29, 1984');
    expect(toYears({ value: 9999999999 })).toBeNull();
    expect(toYears({ value: '1000001' })).toBeNull();
  });

  test('a list of dates spans its earliest to its latest, as the script does', () => {
    expect(toYears({ value: ['1990', '1850'] })).toEqual([1850, 1990]);
    expect(formatDateValue({ value: ['1990', '1850'] })).toBe('1850–1990');
    expect(toYears({ value: [fuzzy('1861-01-01', '1865-12-31', 0, true).value, '1850'] })).toEqual([1850, 1865]);
  });

  test('years before the common era read with their era', () => {
    expect(formatDateValue('-0043-03-15')).toBe('March 15, 44 BC');
    expect(formatDateValue({ value: -43 })).toBe('44 BC');
    expect(formatDateValue({ value: 0 })).toBe('1 BC');
    expect(formatDateValue('0044-03-15')).toBe('March 15, 44');
  });

  test('labels read at the date\'s own precision', () => {
    expect(formatDateValue(fuzzy('1983-03-01', '1983-03-31', 1))).toBe('March 1983');
    expect(formatDateValue(fuzzy('1911-01-01', '1911-12-31', 0))).toBe('1911');
    expect(formatDateValue(fuzzy('1861-01-01', '1865-12-31', 0, true))).toBe('1861–1865');
    expect(formatDateValue(fuzzy('1890-01-01', '1899-12-31', 0, true, '1890s'))).toBe('1890s');
    expect(formatDateValue(fuzzy('1983-03-15', '1983-03-15', 2))).toBe('March 15, 1983');
    expect(formatDateValue('1983-03-15')).toBe('March 15, 1983');
    expect(formatDateValue('1983-03-')).toBe('March 1983');
    expect(formatDateValue('1983-03-15', 'es')).toBe('15 de marzo de 1983');
    expect(formatDateValue('not a date')).toBeNull();
  });

  test('hits get the timeline\'s shape: Unix seconds for the first and last day', () => {
    const dates = toHitDates(fuzzy('1983-03-01', '1983-03-31', 1));
    expect(new Date(dates.start_date![0] * 1000).toISOString()).toBe('1983-03-01T00:00:00.000Z');
    expect(new Date(dates.end_date![0] * 1000).toISOString()).toBe('1983-03-31T00:00:00.000Z');

    const year = toHitDates({ value: 1890 });
    expect(new Date(year.end_date![0] * 1000).toISOString()).toBe('1890-12-31T00:00:00.000Z');
    expect(toHitDates({ value: 'c. 1890' })).toEqual({});
  });
});

describe('config expansion', () => {
  const search = {
    name: 'places',
    facets: [{ name: 'types', type: 'list' }],
    elasticsearch: { index_name: 'x', facet_attributes: ['types'] }
  };

  test('no dates, no change', () => {
    expect(expandDates(search)).toBe(search);
    expect(expandDates({ ...search, dates: { field: 'bad field!' } }).facets).toEqual(search.facets);
  });

  test('a date field adds the year filter first, the date sorts, and the timeline when on', () => {
    const expanded = expandDates({ ...search, dates: { field: 'date_listed', label: 'Listed', timeline: true } });

    expect(expanded.facets[0]).toEqual({ name: 'years', type: 'range', label: 'Listed' });
    expect(expanded.elasticsearch.facet_attributes[0]).toEqual({ attribute: 'years', field: 'og_years', type: 'numeric' });
    expect(expanded.elasticsearch.sort_attributes.map((sort: any) => sort.name)).toEqual(['date_asc', 'date_desc']);
    expect(expanded.timeline).toEqual({ date_range_facet: 'years' });
    expect(expandDates({ ...search, dates: { field: 'date_listed' } }).timeline).toBeUndefined();
  });

  test('a curator-placed year facet keeps its place', () => {
    const placed = expandDates({ ...search, facets: [...search.facets, { name: 'years', type: 'range' }], dates: { field: 'd' } });
    expect(placed.facets.map((facet: any) => facet.name)).toEqual(['types', 'years']);
  });

  test('the year filter becomes an overlap test', () => {
    const body = { query: { bool: { filter: [{ range: { og_years: { gte: 1864 } } }, { range: { og_years: { lte: 1900 } } }, { term: { a: 1 } }] } } };

    expect(toOverlapFilters(body)).toEqual({
      query: { bool: { filter: [{ range: { og_year_end: { gte: 1864 } } }, { range: { og_year_start: { lte: 1900 } } }, { term: { a: 1 } }] } }
    });

    expect(toOverlapFilters({ range: { og_years: { gte: 1, lte: 2 } } })).toEqual({
      bool: { filter: [{ range: { og_year_end: { gte: 1 } } }, { range: { og_year_start: { lte: 2 } } }] }
    });
  });
});

const ES_URL = process.env.OG_ELASTICSEARCH_URL || process.env.ELASTICSEARCH_URL || 'http://localhost:9200';
const INDEX = 'og_dates_test';
const MAPPING_PATH = path.resolve(__dirname, '../../../og_schema/es_mapping.json');
const reachable = await fetch(ES_URL).then((r) => r.ok).catch(() => false);

const es = async (method: string, route: string, body?: any) => {
  const response = await fetch(`${ES_URL}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  return { status: response.status, body: await response.json().catch(() => null) };
};

const place = (id: string, name: string, date?: any) => ({
  id, project_id: '1', model_id: '11', model_type: 'place', uuid: id, name, visibility: 'published', types: ['Church'],
  ...(date === undefined ? {} : { date_listed: date })
});

const DOCS = [
  place('month', 'Listed in March 1983', fuzzy('1983-03-01', '1983-03-31', 1)),
  place('war', 'Built 1861–1865', fuzzy('1861-01-01', '1865-12-31', 0, true)),
  place('day', 'A day in 1911', { label: 'Date listed', value: '1911-05-02' }),
  place('year', 'The year 1890', { label: 'Date listed', value: 1890 }),
  place('century', 'Across the 1800s', fuzzy('1800-01-01', '1899-12-31', 0, true)),
  place('undated', 'Not dated'),
  place('circa', 'Circa text', { label: 'Date listed', value: 'c. 1890' })
];

const atlas = {
  slug: 'dates-test',
  config: {
    core_data: { project_ids: ['1'] },
    i18n: { default_locale: 'en' },
    search: [{
      name: 'places',
      route: '/places',
      result_card: { title: 'name' },
      facets: [{ name: 'types', type: 'list' }],
      dates: { field: 'date_listed', label: 'Listed', timeline: true },
      elasticsearch: { index_name: INDEX, model_ids: ['11'], facet_attributes: ['types'] }
    }]
  },
  branding: {},
  navigation: null
};

const search = async (params: any, indexName = INDEX) => {
  const url = 'http://renderer.test/api/search.json?search=places';
  const request = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{ indexName, params: { query: '', hitsPerPage: 50, ...params } }])
  });

  const response = await runWithAtlas(atlas, () => POST({ request, url: new URL(url) } as any));
  return { status: response.status, result: (await response.json())?.results?.[0] };
};

const ids = (result: any) => (result?.hits || []).map((hit: any) => hit.uuid);

describe.skipIf(!reachable)('a dated search, through the handler', () => {
  beforeAll(async () => {
    process.env.OG_ELASTICSEARCH_URL = ES_URL;
    await es('DELETE', `/${INDEX}`);

    // Every value shape in one field: a real field holds one kind, and the
    // mapping would refuse the rest (the first shape fixes the type), so the
    // field is left unmapped here — as the proposed mapping leaves objects
    // below the top level. The years are read from _source either way.
    const mapping = fs.existsSync(MAPPING_PATH) ? JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8')) : { mappings: {} };
    const mappings = { ...mapping.mappings, properties: { ...mapping.mappings?.properties, date_listed: { type: 'object', enabled: false } } };
    const created = await es('PUT', `/${INDEX}`, { mappings, settings: mapping.settings });
    expect(created.status, JSON.stringify(created.body)).toBe(200);

    for (const { id, ...source } of DOCS) {
      const put = await es('PUT', `/${INDEX}/_doc/${id}?refresh=true`, source);
      expect(put.status, JSON.stringify(put.body)).toBeLessThan(300);
    }
  }, 30_000);

  afterAll(async () => {
    await es('DELETE', `/${INDEX}`);
  });

  test('the year filter\'s bounds are the earliest and latest years', async () => {
    const { status, result } = await search({ facets: ['years', 'types'] });
    expect(status).toBe(200);
    expect(result.facets_stats.years).toMatchObject({ min: 1800, max: 1983 });
  });

  test('a year range matches every record whose dates overlap it', async () => {
    const { status, result } = await search({ numericFilters: ['years>=1864', 'years<=1870'] });
    expect(status).toBe(200);
    expect(ids(result).sort()).toEqual(['century', 'war']);

    const later = await search({ numericFilters: ['years>=1900'] });
    expect(ids(later.result).sort()).toEqual(['day', 'month']);
  });

  test('date sorts: oldest and newest first, undated last', async () => {
    const oldest = await search({}, `${INDEX}_sort_date_asc`);
    expect(ids(oldest.result).slice(0, 5)).toEqual(['century', 'war', 'year', 'day', 'month']);

    const newest = await search({}, `${INDEX}_sort_date_desc`);
    expect(ids(newest.result)[0]).toBe('month');
  });

  test('hits carry the timeline\'s dates', async () => {
    const { result } = await search({ query: 'March' });
    const hit = result.hits.find((h: any) => h.uuid === 'month');
    expect(new Date(hit.start_date[0] * 1000).toISOString()).toBe('1983-03-01T00:00:00.000Z');
    expect(hit.date_label).toBeUndefined();

    const undated = (await search({ query: 'Circa' })).result.hits[0];
    expect(undated.start_date).toBeUndefined();
  });

  test('no stored value can break the search: bad timestamps, offsets, overflow, BCE, lists', async () => {
    const odd = [
      place('nozone', 'No zone', { label: 'Date listed', value: '1983-03-15T05:00:00' }),
      place('garbled', 'Garbled', { label: 'Date listed', value: '1983-03-15Tnoon' }),
      place('offset', 'Offset', { label: 'Date listed', value: '1983-01-01T00:00:00+14:00' }),
      place('overflow', 'Overflow', { label: 'Date listed', value: [0, 2147483647] }),
      place('huge', 'Huge', { label: 'Date listed', value: 9999999999 }),
      place('bce', 'Ides', { label: 'Date listed', value: '-0043-03-15' }),
      place('list', 'Listed twice', { label: 'Date listed', value: ['1990', '1850'] })
    ];

    for (const { id, ...source } of odd) {
      await es('PUT', `/${INDEX}/_doc/${id}?refresh=true`, source);
    }

    try {
      const stats = await search({ facets: ['years'] });
      expect(stats.status).toBe(200);
      expect(stats.result.facets_stats.years).toMatchObject({ min: -43, max: 1990 });

      const filtered = await search({ numericFilters: ['years>=1982', 'years<=1983'] });
      expect(filtered.status).toBe(200);
      // 'list' spans 1850–1990, so it covers these years too
      expect(ids(filtered.result).sort()).toEqual(['garbled', 'list', 'month', 'nozone', 'offset']);

      const span = await search({ numericFilters: ['years>=1900', 'years<=1910'] });
      expect(ids(span.result)).toContain('list');

      const sorted = await search({}, `${INDEX}_sort_date_asc`);
      expect(sorted.status).toBe(200);
      expect(ids(sorted.result)[0]).toBe('bce');
    } finally {
      for (const { id } of odd) {
        await es('DELETE', `/${INDEX}/_doc/${id}?refresh=true`);
      }
    }
  });

  test('a curator facet named "years" keeps its name; the date filter becomes og_years', async () => {
    const expanded = expandDates({ ...atlas.config.search[0], elasticsearch: { ...atlas.config.search[0].elasticsearch, facet_attributes: ['years', 'types'] } });
    expect(expanded.elasticsearch.facet_attributes[0]).toEqual({ attribute: 'og_years', field: 'og_years', type: 'numeric' });
    expect(expanded.facets[0]).toMatchObject({ name: 'og_years', type: 'range' });
    expect(expanded.timeline.date_range_facet).toBe('og_years');
    expect(expandDates(expanded)).toEqual(expanded);
  });

  test('the year attribute is declared only on a dated search', async () => {
    const undatedAtlas = { ...atlas, config: { ...atlas.config, search: [{ ...atlas.config.search[0], dates: undefined }] } };
    const url = 'http://renderer.test/api/search.json?search=places';
    const request = new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ indexName: INDEX, params: { numericFilters: ['years>=1900'] } }])
    });

    const response = await runWithAtlas(undatedAtlas, () => POST({ request, url: new URL(url) } as any));
    expect(response.status).toBe(400);
  });
});
