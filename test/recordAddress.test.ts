import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findSlugs, isUuid, recordPath, resolveRecordAddress } from '../src/utils/recordAddress';

const CONFIG = {
  core_data: { project_ids: [2] },
  search: [{ name: 'places', elasticsearch: { index_name: 'open_geographies_v1_project_2' } }]
};

const MIZPAH = { uuid: '3534e12b-f7e9-41fc-981a-6866f7db2bd2', slug: 'mizpah-methodist-effingham', slugs: ['mizpah-methodist', 'mizpah-methodist-effingham'], name: 'Mizpah Methodist' };
const ANTIOCH_A = { uuid: '11111111-1111-4111-8111-111111111111', slug: 'antioch-baptist-a', slugs: ['antioch-baptist', 'antioch-baptist-a'], name: 'Antioch Baptist' };
const ANTIOCH_B = { uuid: '22222222-2222-4222-8222-222222222222', slug: 'antioch-baptist-b', slugs: ['antioch-baptist', 'antioch-baptist-b'], name: 'Antioch Baptist' };
const TWIN_A = { uuid: '33333333-3333-4333-8333-333333333333', slug: 'twin', slugs: ['twin'], name: 'Twin A' };
const TWIN_B = { uuid: '44444444-4444-4444-8444-444444444444', slug: 'twin', slugs: ['twin'], name: 'Twin B' };

const DOCS = [MIZPAH, ANTIOCH_A, ANTIOCH_B, TWIN_A, TWIN_B];

/**
 * A stand-in for the index: answers the resolver's term queries from DOCS.
 */
const fakeSearch = vi.fn(async (_index: string, body: any) => {
  const should = body.query.bool.should;
  const hits = DOCS.filter((doc) => should.some((clause: any) => {
    const [field, value] = Object.entries(clause.term)[0] as [string, string];
    const actual = (doc as any)[field];
    return Array.isArray(actual) ? actual.includes(value) : actual === value;
  }));

  return { hits: { hits: hits.map((doc) => ({ _source: doc })) } };
});

beforeEach(() => {
  vi.stubEnv('OG_ELASTICSEARCH_URL', 'https://search.example');
  fakeSearch.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('recordPath', () => {
  it('uses the slug, and the UUID when there is none', () => {
    expect(recordPath('en', 'places', MIZPAH)).toBe('/en/places/mizpah-methodist-effingham');
    expect(recordPath('en', 'places', { uuid: MIZPAH.uuid })).toBe(`/en/places/${MIZPAH.uuid}`);
  });
});

describe('isUuid', () => {
  it('tells a UUID from a slug', () => {
    expect(isUuid(MIZPAH.uuid)).toBe(true);
    expect(isUuid('mizpah-methodist')).toBe(false);
  });
});

describe('resolveRecordAddress', () => {
  const resolve = (id: string, config: any = CONFIG) => resolveRecordAddress(config, 'places', id, fakeSearch);

  it('renders the record at its own slug', async () => {
    expect(await resolve('mizpah-methodist-effingham')).toEqual({ kind: 'record', uuid: MIZPAH.uuid });
  });

  it('redirects a UUID to the slug', async () => {
    expect(await resolve(MIZPAH.uuid)).toEqual({ kind: 'redirect', to: 'mizpah-methodist-effingham' });
  });

  it('redirects another of the record\'s slugs to its own', async () => {
    expect(await resolve('mizpah-methodist')).toEqual({ kind: 'redirect', to: 'mizpah-methodist-effingham' });
  });

  it('lists the records when another slug belongs to several', async () => {
    const address = await resolve('antioch-baptist');
    expect(address.kind).toBe('choose');
    expect((address as any).records.map((r: any) => r.uuid)).toEqual([ANTIOCH_A.uuid, ANTIOCH_B.uuid]);
  });

  it('lists the records when two share a slug, and keeps their UUID addresses', async () => {
    expect((await resolve('twin')).kind).toBe('choose');
    expect(await resolve(TWIN_A.uuid)).toEqual({ kind: 'record', uuid: TWIN_A.uuid });
  });

  it('is missing for an unknown slug, and falls back to Core Data for an unknown UUID', async () => {
    expect(await resolve('no-such-church')).toEqual({ kind: 'missing' });
    expect(await resolve('55555555-5555-4555-8555-555555555555')).toEqual({ kind: 'record', uuid: '55555555-5555-4555-8555-555555555555' });
  });

  it('keeps UUID addresses working when the index can\'t be read', async () => {
    const failing = vi.fn(async () => { throw new Error('down'); });
    expect(await resolveRecordAddress(CONFIG, 'places', MIZPAH.uuid, failing)).toEqual({ kind: 'record', uuid: MIZPAH.uuid });
    expect(await resolveRecordAddress(CONFIG, 'places', 'mizpah-methodist', failing)).toEqual({ kind: 'unavailable' });
  });

  it('only uses UUIDs for an atlas without a search index', async () => {
    const config = { core_data: { project_ids: [2] }, search: [] };
    expect(await resolve(MIZPAH.uuid, config)).toEqual({ kind: 'record', uuid: MIZPAH.uuid });
    expect(await resolve('mizpah-methodist', config)).toEqual({ kind: 'missing' });
    expect(fakeSearch).not.toHaveBeenCalled();
  });

  it('scopes every lookup to the atlas and the record type', async () => {
    await resolve('mizpah-methodist-effingham');
    const filter = fakeSearch.mock.calls[0][1].query.bool.filter;
    expect(filter).toContainEqual({ terms: { project_id: ['2'] } });
    expect(filter).toContainEqual({ term: { model_type: 'place' } });
  });
});

/**
 * Answers findSlugs' two queries: records by UUID, then how many hold each slug.
 */
const fakeBatch = vi.fn(async (_index: string, body: any) => {
  const filter = body.query.bool.filter;
  const terms = filter.find((clause: any) => clause.terms && (clause.terms.uuid || clause.terms.slug)).terms;

  if (terms.uuid) {
    return { hits: { hits: DOCS.filter((doc) => terms.uuid.includes(doc.uuid)).map((doc) => ({ _source: doc })) } };
  }

  const buckets = terms.slug.map((slug: string) => ({ key: slug, doc_count: DOCS.filter((doc) => doc.slug === slug).length }));
  return { hits: { hits: [] }, aggregations: { slugs: { buckets } } };
});

describe('findSlugs', () => {
  it('gives each record its slug, leaving out shared slugs and unknown records', async () => {
    const slugs = await findSlugs(CONFIG, 'places', [MIZPAH.uuid, TWIN_A.uuid, ANTIOCH_A.uuid, '99999999-9999-4999-8999-999999999999'], fakeBatch);
    expect(slugs).toEqual({ [MIZPAH.uuid]: MIZPAH.slug, [ANTIOCH_A.uuid]: ANTIOCH_A.slug });
  });

  it('asks nothing for no records, and gives nothing when the index fails', async () => {
    fakeBatch.mockClear();
    expect(await findSlugs(CONFIG, 'places', [], fakeBatch)).toEqual({});
    expect(fakeBatch).not.toHaveBeenCalled();
    expect(await findSlugs(CONFIG, 'places', [MIZPAH.uuid], async () => { throw new Error('down'); })).toEqual({});
  });
});
