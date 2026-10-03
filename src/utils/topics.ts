import _ from 'underscore';
import { buildBaseFilters } from '@search/elasticsearch/filters';
import { parameterize } from './exclusions';

/**
 * Topics: the atlas's categories (the canonical Types, `types` in the index)
 * as pages of their own — a Topics page that lays them out as a tree, and a
 * page per category with its places. The tree is the curator's (Settings →
 * Topics), since categories are a flat list in the data:
 *
 *   topics: {
 *     enabled: true,
 *     title: 'Topics', intro: 'A few words above the tree',
 *     groups: [{ label: 'Religious', terms: ['Church'], groups: [{ label: 'Burial', terms: ['Cemetery'] }] }]
 *   }
 *
 * Categories in no group are listed after the tree. Counts and places come
 * from the index with the search handler's own tenant, model and
 * visibility filters.
 */

export interface TopicGroup {
  label: string;
  terms: string[];
  groups: TopicGroup[];
}

export interface TopicsConfig {
  enabled: boolean;
  title?: string;
  intro?: string;
  groups: TopicGroup[];
}

export interface Topic {
  name: string;
  slug: string;
  count: number;
}

export interface TopicNode {
  label: string;
  topics: Topic[];
  groups: TopicNode[];
}

const MAX_DEPTH = 3;

const cleanGroups = (groups: any, depth = 1): TopicGroup[] => (
  depth > MAX_DEPTH || !Array.isArray(groups) ? [] : _.compact(groups.map((group: any) => {
    if (!group || typeof group !== 'object' || typeof group.label !== 'string' || !group.label.trim()) return null;

    return {
      label: group.label.trim().slice(0, 100),
      terms: _.uniq(_.filter(Array.isArray(group.terms) ? group.terms : [], (term: any) => typeof term === 'string' && term.trim() !== '')),
      groups: cleanGroups(group.groups, depth + 1)
    };
  }))
);

export const getTopicsConfig = (config: any): TopicsConfig => {
  const topics = config?.topics;

  return {
    enabled: topics?.enabled === true,
    title: typeof topics?.title === 'string' && topics.title.trim() ? topics.title.trim() : undefined,
    intro: typeof topics?.intro === 'string' && topics.intro.trim() ? topics.intro.trim() : undefined,
    groups: cleanGroups(topics?.groups)
  };
};

export const topicSlug = (name: string): string => parameterize(name).replace(/_/g, '-');

/**
 * The tree to show: each group's topics that have places (in the order the
 * curator listed them), groups left empty dropped, and the topics in no
 * group, by name.
 */
export const buildTopicTree = (groups: TopicGroup[], topics: Topic[]): { tree: TopicNode[], ungrouped: Topic[] } => {
  const byName = _.indexBy(topics, 'name');
  const placed = new Set<string>();

  const walk = (list: TopicGroup[]): TopicNode[] => _.compact(list.map((group) => {
    const own = _.compact(group.terms.map((term) => byName[term]));
    own.forEach((topic) => placed.add(topic.name));
    const children = walk(group.groups);

    return own.length || children.length ? { label: group.label, topics: own, groups: children } : null;
  }));

  const tree = walk(groups);
  const ungrouped = _.sortBy(_.reject(topics, (topic) => placed.has(topic.name)), (topic) => topic.name.toLocaleLowerCase());

  return { tree, ungrouped };
};

/**
 * Where a topic sits in the tree: the labels of the groups above it.
 */
export const topicTrail = (groups: TopicGroup[], name: string, trail: string[] = []): string[] | null => {
  for (const group of groups) {
    if (group.terms.includes(name)) return [...trail, group.label];

    const found = topicTrail(group.groups, name, [...trail, group.label]);
    if (found) return found;
  }

  return null;
};

// --- the index ------------------------------------------------------------------

const scope = (config: any) => {
  const search = _.find(config?.search || [], (entry: any) => entry?.elasticsearch?.index_name);

  return {
    index: search?.elasticsearch?.index_name as string | undefined,
    filters: buildBaseFilters({
      projectIds: config?.core_data?.project_ids || [],
      modelIds: search?.elasticsearch?.model_ids || []
    })
  };
};

const search = async (index: string, body: any) => {
  const host = (process.env.OG_ELASTICSEARCH_URL || process.env.ELASTICSEARCH_URL || '').replace(/\/+$/, '');
  const apiKey = process.env.OG_ELASTICSEARCH_API_KEY || process.env.ELASTICSEARCH_API_KEY;
  if (!host) return null;

  const response = await fetch(`${host}/${encodeURIComponent(index)}/_search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `ApiKey ${apiKey}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) throw new Error(`Elasticsearch answered ${response.status}`);
  return response.json();
};

/**
 * Every category with places, and how many.
 */
export const fetchTopics = async (config: any): Promise<Topic[]> => {
  const { index, filters } = scope(config);
  if (!index) return [];

  const data = await search(index, { size: 0, query: { bool: { filter: filters } }, aggs: { topics: { terms: { field: 'types', size: 2000 } } } });
  const buckets = data?.aggregations?.topics?.buckets || [];

  return buckets.map((bucket: any) => ({ name: String(bucket.key), slug: topicSlug(String(bucket.key)), count: bucket.doc_count }));
};

export interface TopicPlace {
  uuid: string;
  name: string;
  point?: { lat: number, lon: number };
}

/**
 * A category's places, by name (at most `limit`).
 */
export const fetchTopicPlaces = async (config: any, name: string, limit = 500): Promise<TopicPlace[]> => {
  const { index, filters } = scope(config);
  if (!index) return [];

  const data = await search(index, {
    size: limit,
    _source: ['uuid', 'name', 'geo.point'],
    sort: [{ 'name.keyword': 'asc' }],
    query: { bool: { filter: [...filters, { term: { types: name } }] } }
  });

  return (data?.hits?.hits || []).map((hit: any) => ({
    uuid: hit._source?.uuid,
    name: hit._source?.name,
    point: hit._source?.geo?.point
  })).filter((place: TopicPlace) => place.uuid && place.name);
};

/**
 * The places as GeoJSON points for a map (those with a location).
 */
export const toFeatureCollection = (places: TopicPlace[]) => ({
  type: 'FeatureCollection',
  features: places.filter((place) => place.point && Number.isFinite(place.point.lat) && Number.isFinite(place.point.lon)).map((place) => ({
    type: 'Feature',
    properties: { uuid: place.uuid, name: place.name },
    geometry: { type: 'Point', coordinates: [place.point!.lon, place.point!.lat] }
  }))
});
