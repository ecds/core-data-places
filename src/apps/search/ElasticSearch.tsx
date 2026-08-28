import { FacetStateContext } from '@performant-software/core-data';
import { useMemo, type ReactNode } from 'react';
import { InstantSearch } from 'react-instantsearch';
import { useSearchConfig } from '@apps/search/SearchConfigContext';
import { createSearchClient } from '@search/elasticsearch/client';

/**
 * The Elasticsearch counterpart to `TypesenseSearch`.
 *
 * Deliberately the same shape as the Typesense provider — an `<InstantSearch>`
 * wrapper plus a facet-state context around the children — so every component
 * below it (facets, map, list, sort, result cards) is untouched by the engine
 * swap. The search UI is engine-agnostic; only the client underneath changes.
 */
const ElasticSearch = (props: { children: ReactNode }) => {
  const config = useSearchConfig();
  const { elasticsearch } = config;

  const searchClient = useMemo(() => createSearchClient(), []);

  /**
   * Facet state.
   *
   * The Typesense provider builds this by querying Typesense directly from the
   * browser for the collection's schema. There is no browser-side engine
   * connection here by design, so the facet list instead comes from the atlas
   * config — which is where per-atlas facets are declared anyway (the canonical
   * schema fixes the structural core; facets vary per atlas).
   *
   * `Facets.tsx` consumes `FacetStateContext` unchanged.
   */
  const facetState = useMemo(() => {
    const facets = elasticsearch?.facet_attributes || [];

    const attributes = facets
      .filter((facet: any) => (typeof facet === 'string' || (facet.type || 'string') === 'string'))
      .map((facet: any) => (typeof facet === 'string' ? facet : facet.attribute));

    const rangeAttributes = facets
      .filter((facet: any) => typeof facet !== 'string' && (facet.type === 'numeric' || facet.type === 'date'))
      .map((facet: any) => facet.attribute);

    return { attributes, rangeAttributes };
  }, [elasticsearch]);

  return (
    <InstantSearch
      indexName={elasticsearch.index_name}
      searchClient={searchClient}
      future={{
        preserveSharedStateOnUnmount: true
      }}
    >
      { /**
         * TODO (routing): the Typesense provider installs `createRouting` so
         * refinements are reflected in the URL. Searchkit has no equivalent
         * helper, so this needs an InstantSearch `routing` object written
         * against the ES attribute names once they are fixed.
         */ }
      <FacetStateContext.Provider
        value={facetState}
      >
        { props.children }
      </FacetStateContext.Provider>
    </InstantSearch>
  );
};

export default ElasticSearch;
