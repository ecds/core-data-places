import { buildBaseFilters } from '@search/elasticsearch/filters';
import { connection, indexName, MODEL_TYPES, searchIndex, searchModelIds } from '@utils/recordIndex';
import _ from 'underscore';

export { recordPath } from '@utils/recordPath';

/**
 * Record pages live at their slug (`/en/places/mizpah-methodist-effingham`),
 * the friendly address the indexing engine gives every record. A record's
 * UUID, or one of its other slugs (`slugs`: its other names, or the slug
 * before a county was added), still reaches it, through a redirect to the
 * slug.
 *
 * Slugs come only from the search index (Core Data's API has none), so a
 * page looks its record up there. The engine doesn't promise a slug is
 * unique, so a slug two records share leads to a short list of both, and
 * links to those records keep their UUIDs.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string) => UUID_PATTERN.test(value);

export interface RecordRef {
  uuid: string;
  slug?: string;
  name?: string;
}

export type RecordAddress =
  // Render the record with this UUID here.
  | { kind: 'record', uuid: string }
  // Send the visitor to this address segment (a slug, or a UUID).
  | { kind: 'redirect', to: string }
  // Several records answer to this slug: let the visitor pick.
  | { kind: 'choose', records: RecordRef[] }
  // The index can't be read, and the address isn't a UUID to fall back on.
  | { kind: 'unavailable' }
  | { kind: 'missing' };

type Search = (index: string, body: any) => Promise<any>;

const MAX_MATCHES = 20;

/**
 * The slug each of these records' pages lives at, by UUID, for linking to
 * them directly (Core Data's records, which most links start from, carry no
 * slug). A record whose slug another record shares, or that the index
 * doesn't have, is left out, so its link keeps its UUID. Empty when the index
 * can't be read: links then fall back to UUIDs, which still redirect.
 */
export const findSlugs = async (
  config: any,
  model: string,
  uuids: string[],
  search: Search = (index, body) => searchIndex(index, body, 5_000)
): Promise<Record<string, string>> => {
  const modelType = MODEL_TYPES[model];
  const index = indexName(config);
  const wanted = _.uniq(_.compact(uuids));

  if (!modelType || !index || !connection().host || !wanted.length) {
    return {};
  }

  const filters = [
    ...buildBaseFilters({ projectIds: config?.core_data?.project_ids || [], modelIds: searchModelIds(config) }),
    { term: { model_type: modelType } }
  ];

  try {
    const data = await search(index, {
      size: wanted.length,
      _source: ['uuid', 'slug'],
      query: { bool: { filter: [...filters, { terms: { uuid: wanted } }] } }
    });

    const docs = (data?.hits?.hits || []).map((hit: any) => hit._source || {}).filter((doc: any) => doc.uuid && doc.slug);
    const slugs = _.uniq(_.pluck(docs, 'slug'));

    if (!slugs.length) {
      return {};
    }

    // How many records hold each slug, across the whole atlas.
    const counts = await search(index, {
      size: 0,
      query: { bool: { filter: [...filters, { terms: { slug: slugs } }] } },
      aggs: { slugs: { terms: { field: 'slug', size: slugs.length } } }
    });

    const holders: Record<string, number> = {};
    (counts?.aggregations?.slugs?.buckets || []).forEach((bucket: any) => { holders[bucket.key] = bucket.doc_count; });

    return _.object(docs.filter((doc: any) => holders[doc.slug] === 1).map((doc: any) => [doc.uuid, doc.slug]));
  } catch {
    return {};
  }
};

/**
 * Works out what the address segment `id` of a `model` record page means for
 * this atlas. `search` is replaceable for tests.
 */
export const resolveRecordAddress = async (
  config: any,
  model: string,
  id: string,
  search: Search = (index, body) => searchIndex(index, body, 5_000)
): Promise<RecordAddress> => {
  const modelType = MODEL_TYPES[model];
  const index = indexName(config);
  const fallback: RecordAddress = isUuid(id) ? { kind: 'record', uuid: id } : { kind: 'missing' };

  // An atlas without a search index (or a renderer without one) keeps UUID
  // addresses only, as before.
  if (!modelType || !index || !connection().host) {
    return fallback;
  }

  const filters = [
    ...buildBaseFilters({ projectIds: config?.core_data?.project_ids || [], modelIds: searchModelIds(config) }),
    { term: { model_type: modelType } }
  ];

  const find = async (should: any[]): Promise<Array<Required<Pick<RecordRef, 'uuid'>> & { slug?: string, slugs?: string[], name?: string }>> => {
    const data = await search(index, {
      size: MAX_MATCHES,
      _source: ['uuid', 'slug', 'slugs', 'name'],
      sort: [{ uuid: 'asc' }],
      query: { bool: { filter: filters, should, minimum_should_match: 1 } }
    });

    return (data?.hits?.hits || []).map((hit: any) => hit._source || {}).filter((doc: any) => doc.uuid);
  };

  let matches;

  try {
    matches = await find([
      { term: { uuid: id } },
      { term: { slug: id } },
      { term: { slugs: id } }
    ]);
  } catch {
    return isUuid(id) ? fallback : { kind: 'unavailable' };
  }

  // The slug a record's page lives at, when no other record has it.
  const ownSlug = async (doc: { uuid: string, slug?: string }) => {
    if (!doc.slug) return null;

    try {
      const holders = await find([{ term: { slug: doc.slug } }]);
      return holders.length === 1 ? doc.slug : null;
    } catch {
      return null;
    }
  };

  const toRef = (doc: any): RecordRef => ({ uuid: doc.uuid, slug: doc.slug, name: doc.name });

  const byUuid = _.find(matches, (doc) => doc.uuid === id);

  if (byUuid) {
    const slug = await ownSlug(byUuid);
    return slug ? { kind: 'redirect', to: slug } : { kind: 'record', uuid: byUuid.uuid };
  }

  const bySlug = _.filter(matches, (doc) => doc.slug === id);

  if (bySlug.length === 1) {
    return { kind: 'record', uuid: bySlug[0].uuid };
  }

  if (bySlug.length > 1) {
    return { kind: 'choose', records: bySlug.map(toRef) };
  }

  const byOtherSlug = _.filter(matches, (doc) => _.contains(doc.slugs || [], id));

  if (byOtherSlug.length === 1) {
    const slug = await ownSlug(byOtherSlug[0]);
    return { kind: 'redirect', to: slug || byOtherSlug[0].uuid };
  }

  if (byOtherSlug.length > 1) {
    return { kind: 'choose', records: byOtherSlug.map(toRef) };
  }

  // A UUID the index doesn't have (a record type it doesn't cover, say)
  // still gets its page from Core Data, as before.
  return fallback;
};
