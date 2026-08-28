import Client from '@searchkit/api';
import type { APIRoute } from 'astro';
import _ from 'underscore';
import { getAtlasConfig } from '@atlas/server';
import { buildBaseFilters } from '@search/elasticsearch/filters';
import { buildSearchSettings } from '@search/elasticsearch/settings';

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
 * Finds the atlas search config whose Elasticsearch index matches the index the
 * client asked for, so one endpoint can serve every search on the atlas (map,
 * list, and any per-content-type searches) without trusting the client to tell
 * us which project it belongs to.
 *
 * @param config
 * @param indexName
 */
const findSearchConfig = (config: any, indexName: string) => (
  _.find(config?.search || [], (search: any) => search?.elasticsearch?.index_name === indexName)
);

/**
 * Reads the distinct index names out of a Searchkit/InstantSearch request body.
 *
 * Every request in the body is inspected, not just the first: a multi-search
 * body could otherwise smuggle a second, unauthorized index past validation.
 *
 * @param body
 */
const getIndexNames = (body: any) => (
  _.uniq(_.compact(_.pluck(body?.requests || [], 'indexName')))
);

export const POST: APIRoute = async ({ request }) => {
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
  const indexNames = getIndexNames(body);

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

  const searchConfig = findSearchConfig(config, indexNames[0]);

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

  const results = await apiClient.handleRequest(body, {
    getBaseFilters: () => buildBaseFilters({
      projectIds: config?.core_data?.project_ids || [],
      geoField: searchConfig.elasticsearch?.geo?.field
      /**
       * TODO (map search): thread the viewport bbox through to here. The map
       * currently refines client-side against Typesense's geo filter; once the
       * geo mapping is fixed, `MapSearchContext` should send the bbox with the
       * request so it can be applied as a base filter above.
       */
    })
  });

  return new Response(JSON.stringify(results), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
};
