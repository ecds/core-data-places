import { FacetStateContext } from '@performant-software/core-data';
import { useMemo, type ReactNode } from 'react';
import { InstantSearch } from 'react-instantsearch';
import { useSearchConfig } from '@apps/search/SearchConfigContext';
import { createSearchClient } from '@search/elasticsearch/client';

/**
 * The search provider: an `<InstantSearch>` wrapper over the server-side
 * Elasticsearch handler, plus the facet-state context the facet components read.
 */
const ElasticSearch = (props: { children: ReactNode }) => {
  const config = useSearchConfig();
  const { elasticsearch } = config;

  const searchClient = useMemo(() => createSearchClient(config.name), [config.name]);

  /**
   * Facet state.
   *
   * There is no browser-side engine connection by design, so the facet list
   * comes from the atlas config in declared order — which is where per-atlas
   * facets are declared anyway (the canonical schema fixes the structural core;
   * facets vary per atlas). `Facets.tsx` consumes `FacetStateContext`.
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
         * TODO (routing): refinements are not yet reflected in the URL. This
         * needs an InstantSearch `routing` object written against the
         * facet attribute names.
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
