import createSearchkitClient from '@searchkit/instantsearch-client';

/**
 * The server route that proxies InstantSearch requests to Elasticsearch.
 *
 * @see src/pages/api/search.json.ts
 */
export const SEARCH_ENDPOINT = '/api/search.json';

/**
 * Builds the InstantSearch-compatible search client.
 *
 * Unlike the Typesense adapter — which is handed a host and a search-only key
 * and talks to the engine directly from the browser — this client only ever
 * talks to our own origin. Everything that needs a secret (the Elasticsearch
 * connection) or must not be client-controlled (the tenant filter) happens on
 * the far side of this URL.
 */
export const createSearchClient = () => createSearchkitClient({
  url: SEARCH_ENDPOINT
});
