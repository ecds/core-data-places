import { ReactNode, useCallback, useMemo, useRef } from 'react';
import { useGeoSearch, useInfiniteHits, useSearchBox } from 'react-instantsearch';
import { PersistentSearchStateContextProvider } from '@performant-software/core-data';
import { useSearchConfig } from '@apps/search/SearchConfigContext';

/**
 * Identifies a page of results: its page number and the search it belongs to
 * (the search state without the page).
 */
const toResultsKey = (results: any) => (
  results ? `${results.page}:${JSON.stringify({ ...results._state, page: undefined })}` : ''
);

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
   * One "show more" per page received. `useProgressiveSearch` can ask twice
   * for the same page (its effect runs again when the same results re-render),
   * and InstantSearch's showMore requests the page after the one last
   * *requested*: the second call skipped a page, and the helper then dropped
   * the skipped page's response as outdated — 18 of 38 results never reached
   * the list or the map (a search with a query and a filter, every time).
   */
  const { results: currentResults, showMore: connectorShowMore } = infiniteHits as any;
  const resultsKey = toResultsKey(currentResults);
  const requested = useRef({ key: '', done: false });

  if (requested.current.key !== resultsKey) {
    requested.current = { key: resultsKey, done: false };
  }

  const showMore = useCallback(() => {
    if (requested.current.key !== resultsKey || requested.current.done) {
      return;
    }

    requested.current.done = true;
    connectorShowMore();
  }, [connectorShowMore, resultsKey]);

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
