import { ReactNode, useCallback, useMemo, useState } from 'react';
import { useGeoSearch, useInfiniteHits, useSearchBox } from 'react-instantsearch';
import { PersistentSearchStateContextProvider } from '@performant-software/core-data';
import { useSearchConfig } from '@apps/search/SearchConfigContext';
import { createShowMoreGate } from '@apps/search/map/showMoreGate';

const MapSearchProvider = (props: { children: ReactNode }) => {
  const geoSearch = useGeoSearch();
  const infiniteHits = useInfiniteHits();
  const searchBox = useSearchBox();
  const searchConfig = useSearchConfig();

  /**
   * `useProgressiveSearch` keeps calling `showMore()` until `isLastPage`,
   * streaming the ENTIRE result set into the browser. For large datasets
   * (OWA: 38k records) that loop runs for minutes, keeps `searching` true and
   * destabilizes the UI. `result_limit` caps how many hits are loaded (the
   * GCA approach: display one page of results, ~1000); the rest of the records
   * are still on the map via a tile layer, and narrowing the search reloads
   * fresh hits.
   */
  const limit = searchConfig?.result_limit;

  /**
   * One "show more" per response received (see `showMoreGate.ts`).
   */
  const { results: currentResults, showMore: connectorShowMore } = infiniteHits as any;
  const [gate] = useState(createShowMoreGate);
  gate.see(currentResults);

  const showMore = useCallback(() => {
    gate.request(currentResults, connectorShowMore);
  }, [connectorShowMore, currentResults, gate]);

  const cappedInfiniteHits = useMemo(() => {
    const { results } = infiniteHits as any;
    const loaded = ((results?.page ?? 0) + 1) * (results?.hitsPerPage || 0);

    if (limit && loaded >= limit) {
      return { ...infiniteHits, showMore, isLastPage: true };
    }

    return { ...infiniteHits, showMore };
  }, [infiniteHits, limit, showMore]);

  return (
    <PersistentSearchStateContextProvider
      infiniteHits={cappedInfiniteHits}
      geoSearch={geoSearch}
      searchBox={searchBox}
    >
      { props.children }
    </PersistentSearchStateContextProvider>
  )
};

export default MapSearchProvider;
