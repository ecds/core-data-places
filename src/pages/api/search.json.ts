import Client from '@searchkit/api';
import type { APIRoute } from 'astro';
import _ from 'underscore';
import { getAtlasConfig } from '@atlas/server';
import { buildBaseFilters } from '@search/elasticsearch/filters';
import { buildSearchSettings, toIndexName } from '@search/elasticsearch/settings';
import { SEARCH_PARAM } from '@search/elasticsearch/client';

/**
 * The Elasticsearch search handler.
 *
 * Topology: the browser's InstantSearch UI posts here (via
 * `@searchkit/instantsearch-client`), this route queries Elasticsearch through
 * `@searchkit/api`, and the results go back. That indirection is the whole
 * point — it is what lets the renderer keep the "direct to the search engine"
 * ergonomics that make faceting easy, without the two costs of true
 * browser-to-engine search:
 *
 *   1. No Elasticsearch credential is ever shipped to the browser. The
 *      connection below is built from server-only environment variables.
 *   2. Tenant isolation is enforced here, not by a scoped key. The atlas is
 *      resolved per request from the middleware's async-local store, and its
 *      project id(s) are injected as a base filter (see `filters.ts`), which is
 *      what makes a single shared index safe without Elastic's paid
 *      document-level security.
 *
 * Because this runs inside the SSR server the renderer already needs, it adds
 * no new service to deploy.
 */

/**
 * Server-only Elasticsearch connection.
 *
 * Deliberately read from the environment rather than the atlas config: the
 * atlas config is served to the browser at /config.json, so it must never carry
 * a credential. Per-atlas values (index name, facets) live in the config; the
 * connection lives here.
 */
const getConnection = () => ({
  host: process.env.OG_ELASTICSEARCH_URL || process.env.ELASTICSEARCH_URL,
  apiKey: process.env.OG_ELASTICSEARCH_API_KEY || process.env.ELASTICSEARCH_API_KEY
});

/**
 * Finds the atlas search config a request is for, so one endpoint can serve
 * every search on the atlas (map, list, and any per-content-type searches)
 * without trusting the client to tell us which project it belongs to.
 *
 * The client names its search (`?search=<name>`); the match must also carry the
 * index the request targets. Every search on an atlas reads the same shared
 * index, so without the name the first search on that index would answer for
 * all of them with the wrong facets and model filter. A request with no name
 * falls back to that first match.
 *
 * @param config
 * @param indexName
 * @param searchName
 */
const findSearchConfig = (config: any, indexName: string, searchName?: string | null) => (
  _.find(config?.search || [], (search: any) => (
    search?.elasticsearch?.index_name === indexName && (!searchName || search.name === searchName)
  ))
);

/**
 * Normalizes the request body to the array of InstantSearch requests Searchkit
 * consumes. `@searchkit/instantsearch-client` posts the bare array; the
 * InstantSearch wire format wraps it as `{ requests: [...] }`.
 *
 * @param body
 */
const getRequests = (body: any): Array<any> => {
  if (Array.isArray(body)) {
    return body;
  }

  return Array.isArray(body?.requests) ? body.requests : [];
};

/**
 * Reads the distinct index names out of the InstantSearch requests, with any
 * sort suffix removed (the sort UI selects a sort by targeting `<index>_sort_<name>`).
 *
 * Every request is inspected, not just the first: a multi-search body could
 * otherwise smuggle a second, unauthorized index past validation.
 *
 * @param requests
 */
const getIndexNames = (requests: Array<any>) => (
  _.uniq(_.compact(_.pluck(requests, 'indexName')).map(toIndexName))
);

/**
 * Aligns Elasticsearch hits with the record shape the search UI was written
 * against. Every hit needs `id` (the record UUID, which the panels and detail
 * links address records by) and `record_id` (the map feature id). A v1 document
 * carries `uuid` and no `id`; Searchkit exposes the document `_id` as
 * `objectID`, which is the connector's numeric record id.
 *
 * @param results
 */
const normalizeResults = (results: any) => ({
  ...results,
  results: _.map(results?.results || [], (result: any) => ({
    ...result,
    hits: _.map(result?.hits || [], (hit: any) => ({
      ...hit,
      id: hit.id ?? hit.uuid,
      record_id: hit.record_id ?? hit.objectID
    }))
  }))
});

export const POST: APIRoute = async ({ request, url }) => {
  const connection = getConnection();

  if (!connection.host) {
    return new Response(JSON.stringify({ error: 'Search is not configured.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let body: any;

  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Malformed search request.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * The atlas for THIS request, resolved by the middleware from the slug
   * (header, query param, or subdomain) and held in async-local storage. This
   * is the multi-tenancy hook — the same running process serves every atlas.
   */
  const config = getAtlasConfig();
  const requests = getRequests(body);
  const indexNames = getIndexNames(requests);

  /**
   * Exactly one index per request, and it must belong to the resolved atlas.
   * A body naming zero, several, or an unconfigured index is refused rather
   * than queried — this is the check that stops one atlas reading another's
   * index by asking for it by name, and it also keeps the single
   * search_settings below honest (mixed indexes would silently be queried
   * with the wrong settings).
   */
  if (indexNames.length !== 1) {
    return new Response(JSON.stringify({ error: 'Search requests must target exactly one index.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const searchConfig = findSearchConfig(config, indexNames[0], url.searchParams.get(SEARCH_PARAM));

  if (!searchConfig) {
    return new Response(JSON.stringify({ error: 'Unknown search index for this atlas.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const apiClient = Client({
    connection,
    search_settings: buildSearchSettings(searchConfig)
  }, {
    debug: import.meta.env.DEV
  });

  const results = await apiClient.handleRequest(requests, {
    getBaseFilters: () => buildBaseFilters({
      projectIds: config?.core_data?.project_ids || [],
      modelIds: searchConfig.elasticsearch?.model_ids
    })
  });

  return new Response(JSON.stringify(normalizeResults(results)), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
};
