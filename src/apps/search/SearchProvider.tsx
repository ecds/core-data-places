import type { ReactNode } from 'react';
import { useSearchConfig } from '@apps/search/SearchConfigContext';
import ElasticSearch from '@apps/search/ElasticSearch';
import TypesenseSearch from '@apps/search/TypesenseSearch';

/**
 * Selects the search engine for the current atlas.
 *
 * The platform is migrating from Typesense to Elasticsearch, and the two need to
 * coexist while the canonical schema and index mapping are being locked. Rather
 * than a build-time flag, the choice is per-atlas and data-driven: a search that
 * declares an `elasticsearch` block uses Elasticsearch; everything else keeps
 * working on Typesense exactly as before.
 *
 * That means an atlas can be migrated by changing its config alone, and the
 * migration can proceed one atlas at a time instead of as a cutover.
 *
 * Both providers expose the same contract to their children (an InstantSearch
 * context plus facet state), so the components below this point are unaware of
 * which engine is in play.
 */
const SearchProvider = (props: { children: ReactNode }) => {
  const config = useSearchConfig();

  if (config?.elasticsearch?.index_name) {
    return (
      <ElasticSearch>
        { props.children }
      </ElasticSearch>
    );
  }

  return (
    <TypesenseSearch>
      { props.children }
    </TypesenseSearch>
  );
};

export default SearchProvider;
