import { createRouting } from '@search/elasticsearch/routing';
import { describe, expect, test } from 'vitest';

const indexName = 'open_geographies_v1';
const { stateMapping } = createRouting({ indexName, rangeAttributes: ['date'] });

describe('routing', () => {
  const uiState = {
    [indexName]: {
      query: 'church',
      refinementList: { types: ['Church', 'Cemetery'], 'contained_in_place.name': ['Chatham County'] },
      range: { date: '1800:1900' },
      sortBy: `${indexName}_sort_name_desc`
    }
  };

  const route = {
    q: 'church',
    types: ['Church', 'Cemetery'],
    'contained_in_place.name': ['Chatham County'],
    date: '1800:1900',
    sort: 'name_desc'
  };

  test('stateToRoute flattens the UI state', () => {
    expect(stateMapping.stateToRoute(uiState)).toEqual(route);
  });

  test('routeToState restores it, keyed by index', () => {
    expect(stateMapping.routeToState(route)).toEqual(uiState);
  });

  test('relevance and empty refinements leave the route clean', () => {
    expect(stateMapping.stateToRoute({ [indexName]: { query: '', refinementList: { types: [] }, sortBy: indexName } })).toEqual({});
    expect(stateMapping.routeToState({})).toEqual({ [indexName]: {} });
  });

  test('a single facet value arrives as a string', () => {
    expect(stateMapping.routeToState({ types: 'Church' })).toEqual({
      [indexName]: { refinementList: { types: ['Church'] } }
    });
  });

  test('only declared sorts are read back when the search names them', () => {
    const declared = createRouting({ indexName, sortNames: ['name_asc', 'name_desc', 'date_asc', 'date_desc'] }).stateMapping;

    expect(declared.routeToState({ sort: 'date_desc' })).toEqual({
      [indexName]: { sortBy: `${indexName}_sort_date_desc` }
    });

    // An old link to a sort the atlas no longer has: relevance, not a failed search.
    expect(declared.routeToState({ sort: 'founded_asc', q: 'church' })).toEqual({
      [indexName]: { query: 'church' }
    });

    // Repeated or odd values never become an index name.
    expect(declared.routeToState({ sort: ['date_asc', 'name_asc'] })).toEqual({ [indexName]: {} });
    expect(declared.routeToState({ sort: '*,other' })).toEqual({ [indexName]: {} });
  });
});
