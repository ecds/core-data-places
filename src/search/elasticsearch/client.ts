import createSearchkitClient from '@searchkit/instantsearch-client';

/**
 * The server route that proxies InstantSearch requests to Elasticsearch.
 *
 * @see src/pages/api/search.json.ts
 */
export const SEARCH_ENDPOINT = '/api/search.json';

/**
 * The query parameter naming the atlas search (`search[].name`) a request is
 * for. Every search on an atlas reads the same shared index, so the index name
 * alone cannot tell the handler which search's settings (facets, sorts, models)
 * to apply.
 */
export const SEARCH_PARAM = 'search';

/**
 * Builds the InstantSearch-compatible search client for the named atlas search.
 *
 * Unlike the Typesense adapter — which is handed a host and a search-only key
 * and talks to the engine directly from the browser — this client only ever
 * talks to our own origin. Everything that needs a secret (the Elasticsearch
 * connection) or must not be client-controlled (the tenant filter) happens on
 * the far side of this URL. The search name is a hint, not a grant: the handler
 * resolves it against the atlas's own config.
 *
 * @param name
 */
export const createSearchClient = (name: string) => createSearchkitClient({
  url: `${SEARCH_ENDPOINT}?${SEARCH_PARAM}=${encodeURIComponent(name)}`
});
