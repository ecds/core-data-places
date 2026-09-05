import { history } from 'instantsearch.js/es/lib/routers';
import _ from 'underscore';
import { SORT_MARKER } from '@search/elasticsearch/settings';

/**
 * URL routing for the search UI state, so a search (query, facet refinements,
 * range refinements, sort) can be linked to and survives a reload.
 *
 * The route is a flat query string — `?q=church&types=Church&types=Cemetery&
 * date=1800:1900&sort=name_asc` — the same shape the Typesense-era routing
 * produced, so links to existing atlas searches keep working. Facet values are
 * keyed by attribute at the top level; a range is `min:max`; the sort is the
 * name declared in the search settings (`SortBy.tsx` appends it to the index
 * name as `<index>_sort_<name>`).
 *
 * Only the query string is written. The map search's own state (selected
 * record, viewport) lives in the hash, managed by peripleo's router; the
 * history router preserves the hash when it writes, so the two coexist.
 */

const QUERY_PARAM = 'q';
const SORT_PARAM = 'sort';
const RANGE_DELIMITER = ':';

interface Options {
  indexName: string;
  /** Attributes rendered as range facets: their route values are `min:max` strings. */
  rangeAttributes?: string[];
}

/**
 * The sort name for an InstantSearch sortBy value (`<index>_sort_<name>`), or
 * undefined for the bare index (relevance).
 *
 * @param sortBy
 * @param indexName
 */
const toSortName = (sortBy: string | undefined, indexName: string) => {
  if (!sortBy || sortBy === indexName || !sortBy.startsWith(`${indexName}${SORT_MARKER}`)) {
    return undefined;
  }

  return sortBy.slice(indexName.length + SORT_MARKER.length);
};

export const createRouting = ({ indexName, rangeAttributes = [] }: Options) => ({
  router: history({
    cleanUrlOnDispose: false
  }),
  stateMapping: {
    stateToRoute: (uiState) => {
      const state = uiState[indexName] || {};
      const route: { [key: string]: any } = {};

      if (state.query) {
        route[QUERY_PARAM] = state.query;
      }

      _.each(state.refinementList || {}, (values, attribute) => {
        if (!_.isEmpty(values)) {
          route[attribute] = values;
        }
      });

      _.each(state.range || {}, (value, attribute) => {
        if (value) {
          route[attribute] = value;
        }
      });

      const sort = toSortName(state.sortBy, indexName);

      if (sort) {
        route[SORT_PARAM] = sort;
      }

      return route;
    },
    routeToState: (route) => {
      const { [QUERY_PARAM]: query, [SORT_PARAM]: sort, ...attributes } = route || {};
      const state: { [key: string]: any } = {};

      if (query) {
        state.query = query;
      }

      if (sort) {
        state.sortBy = `${indexName}${SORT_MARKER}${sort}`;
      }

      _.each(attributes, (value, attribute) => {
        if (rangeAttributes.includes(attribute)) {
          const range = _.isArray(value) ? _.first(value) : value;

          if (_.isString(range) && range.includes(RANGE_DELIMITER)) {
            state.range = { ...state.range, [attribute]: range };
          }
        } else {
          state.refinementList = {
            ...state.refinementList,
            [attribute]: _.isArray(value) ? value : [value]
          };
        }
      });

      return { [indexName]: state };
    }
  }
});
