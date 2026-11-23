import _ from 'underscore';

/**
 * Server-side reads of an atlas's records from its search index, shared by
 * the sitemap and record addresses.
 */

// Detail-page route → the index's model_type.
export const MODEL_TYPES: Record<string, string> = {
  places: 'place',
  people: 'person',
  organizations: 'organization',
  events: 'event',
  works: 'work',
  items: 'item',
  instances: 'instance'
};

/**
 * The atlas's index: the first search that names one.
 */
export const indexName = (config: any): string | null => (
  _.find((config?.search || []).map((search: any) => search?.elasticsearch?.index_name), Boolean) || null
);

/**
 * The record models the atlas's searches cover (empty means all).
 */
export const searchModelIds = (config: any): string[] => (
  _.uniq(_.flatten((config?.search || []).map((search: any) => search?.elasticsearch?.model_ids || [])))
);

export const connection = () => ({
  host: (process.env.OG_ELASTICSEARCH_URL || process.env.ELASTICSEARCH_URL || '').replace(/\/+$/, ''),
  apiKey: process.env.OG_ELASTICSEARCH_API_KEY || process.env.ELASTICSEARCH_API_KEY
});

export const searchIndex = async (index: string, body: any, timeout = 20_000) => {
  const { host, apiKey } = connection();
  const response = await fetch(`${host}/${encodeURIComponent(index)}/_search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `ApiKey ${apiKey}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout)
  });

  if (!response.ok) {
    throw new Error(`Elasticsearch answered ${response.status}`);
  }

  return response.json();
};
