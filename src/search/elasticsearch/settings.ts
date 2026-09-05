import type { SearchConfig } from '@types';
import _ from 'underscore';

/**
 * The `search_settings` object consumed by `@searchkit/api` on the server.
 *
 * @see https://searchkit.co/docs/api-documentation/api
 */
export interface SearchSettings {
  search_attributes: Array<string | { field: string, weight: number }>;
  result_attributes: Array<string>;
  highlight_attributes?: Array<string>;
  geo_attribute?: string;
  facet_attributes: Array<{ attribute: string, field: string, type: 'string' | 'numeric' | 'date' }>;
  sorting?: {
    [key: string]: {
      field: string,
      order: 'asc' | 'desc'
    }
  };
}

/**
 * Facet field resolution.
 *
 * Elasticsearch can only aggregate (facet) on a `keyword` field. The canonical
 * OG mapping's promoted facet fields (`types`, `administrative_area.name`, …)
 * are ALREADY `keyword` typed, so a bare-string facet uses the attribute name
 * as-is — appending `.keyword` there would point at a field that doesn't
 * exist. A facet over an analyzed text field (e.g. a per-atlas UDF's
 * `<uuid>.keyword` multi-field or a `*_facet` companion) must spell out its
 * `field` explicitly in the long form.
 */

/**
 * Fallback attributes used when an atlas config doesn't specify its own.
 *
 * CONTRACT SEAM: these are the fields the canonical OG schema is expected to
 * guarantee on every document (see OG_SCHEMA_ANALYSIS.md §4). They are
 * intentionally minimal — the moment the locked schema + ES mapping are
 * published, these defaults should be replaced with the real fixed core rather
 * than grown ad hoc.
 */
const DEFAULT_SEARCH_ATTRIBUTES = [
  { field: 'name', weight: 3 },
  { field: 'names', weight: 2 },
  'description',
  'short_description'
];

const DEFAULT_GEO_ATTRIBUTE = 'geo.point';

const DEFAULT_RESULT_ATTRIBUTES = [
  'uuid',
  'slug',
  'name',
  'names',
  'short_description',
  'types',
  'geo',
  'geojson',
  'administrative_area',
  'thumbnail'
];

/**
 * Marks the sort suffix the UI appends to an index name (`<index>_sort_<name>`).
 * Searchkit matches sorts by `indexName.endsWith(key)`; the marker keeps the
 * suffix distinguishable from the index name itself.
 */
export const SORT_MARKER = '_sort_';

/**
 * The sort suffix for a named sort: `name_asc` → `_sort_name_asc`.
 *
 * @param name
 */
export const toSortKey = (name: string) => `${SORT_MARKER}${name}`;

/**
 * The index name a request targets, without any sort suffix.
 *
 * @param indexName
 */
export const toIndexName = (indexName: string) => indexName.split(SORT_MARKER)[0];

/**
 * Sorts every atlas gets. `default` is Searchkit's name for the sort applied
 * when the request names none: relevance for a query, and A–Z otherwise would
 * be ideal, but Searchkit applies `default` to every unsorted request, so it is
 * left unset and relevance (`_score`) is the unsorted order.
 */
const DEFAULT_SORTING = {
  [toSortKey('name_asc')]: { field: 'name.keyword', order: 'asc' as const },
  [toSortKey('name_desc')]: { field: 'name.keyword', order: 'desc' as const }
};

/**
 * The top-level document field for a dotted or facet path: `contained_in_place.name`
 * → `contained_in_place`, `denomination_facet` → `denomination_facet`.
 *
 * @param path
 */
const toRootField = (path: string) => path.split('.')[0];

/**
 * The `_source` include for a card path: a relationship part (`media.name`)
 * stays a nested include so the rest of the summary isn't returned; a
 * top-level path or one with an index is its root field.
 *
 * @param path
 */
const toResultField = (path: string) => (
  /^[^.]+\.(uuid|name|inverse)$/.test(path) ? path : toRootField(path)
);

/**
 * The document paths a search's result card renders, without positional
 * indices (`people.0.name` → `people.name`).
 *
 * @param searchConfig
 */
const getCardAttributes = (searchConfig: SearchConfig) => {
  const card = searchConfig?.result_card;

  return _.compact([
    card?.title,
    ...(card?.attributes || []).map((attribute) => attribute.name),
    ...(card?.tags || []).map((tag) => tag.name),
    /**
     * A card shows a relationship as a count and names, so only those parts
     * of the related summaries are returned — a place with ten photographs
     * carries ten full media summaries otherwise, and a map search streams
     * every hit to the browser.
     */
    ..._.flatten((card?.relationships || []).map((key) => [`${key}.uuid`, `${key}.name`, `${key}.inverse`]))
  ]).map((path) => path.replace(/\.\d+/g, ''));
};

/**
 * The field names in a `search_attributes` list (bare or weighted).
 *
 * @param attributes
 */
const settingsSearchFields = (attributes?: Array<string | { field: string, weight: number }>) => (
  (attributes?.length ? attributes : DEFAULT_SEARCH_ATTRIBUTES)
    .map((attribute) => (typeof attribute === 'string' ? attribute : attribute.field))
);

/**
 * Normalizes a configured facet into Searchkit's `facet_attributes` shape.
 *
 * Accepts either a bare string (`'types'`) or a fully-specified object
 * (`{ attribute, field, type }`), so an atlas can start with simple facet names
 * and only reach for the long form when it needs a numeric/date range or a
 * field name that differs from the attribute name.
 *
 * @param facet
 */
const normalizeFacet = (facet: any) => {
  if (typeof facet === 'string') {
    return {
      attribute: facet,
      field: facet,
      type: 'string' as const
    };
  }

  return {
    attribute: facet.attribute,
    field: facet.field || facet.attribute,
    type: facet.type || 'string'
  };
};

/**
 * Builds the Searchkit `search_settings` for one atlas search, from that
 * search's `elasticsearch` config block.
 *
 * This is the seam where the per-atlas half of the schema plugs in: the fixed
 * structural fields (name, slug, geo, …) are the same for every atlas and can be
 * defaulted here, while facets vary per atlas and therefore come from config —
 * exactly the "fixed core + per-atlas facet convention" split the canonical
 * schema defines. Nothing here should hardcode an atlas-specific field name.
 *
 * @param searchConfig
 */
export const buildSearchSettings = (searchConfig: SearchConfig): SearchSettings => {
  const es = searchConfig?.elasticsearch;
  const cardAttributes = getCardAttributes(searchConfig);

  const settings: SearchSettings = {
    search_attributes: es?.search_attributes?.length
      ? es.search_attributes
      : DEFAULT_SEARCH_ATTRIBUTES,
    /**
     * The result card names the fields it renders (title, attributes, tags,
     * relationships); those are always returned so a card never renders blank
     * for want of a `result_attributes` entry. The facet fields ride along so
     * a hit can tell the UI which side of a relationship it is on.
     */
    result_attributes: _.uniq([
      ...(es?.result_attributes?.length ? es.result_attributes : DEFAULT_RESULT_ATTRIBUTES),
      ...cardAttributes.map(toResultField),
      ...(es?.facet_attributes || []).map((facet) => toRootField(normalizeFacet(facet).attribute))
    ]),
    /**
     * Searchkit only emits `_highlightResult` (which react-instantsearch's
     * `<Highlight>` renders from, even with no match) for listed attributes.
     */
    highlight_attributes: _.uniq([
      ...settingsSearchFields(es?.search_attributes),
      ...cardAttributes
    ]).filter((path) => !path.includes('.')),
    facet_attributes: (es?.facet_attributes || []).map(normalizeFacet),
    /**
     * Map search. The map refines with InstantSearch's `insideBoundingBox`
     * (see `useGeoSearchToggle`), which Searchkit turns into a
     * `geo_bounding_box` filter on this field. The canonical mapping puts
     * every record's centroid at `geo.point`.
     */
    geo_attribute: es?.geo?.field || DEFAULT_GEO_ATTRIBUTE
  };

  /**
   * Sorting. Typesense expressed sorts as pseudo-indices (`index/sort/field:asc`);
   * Searchkit declares them up front, keyed by a suffix the UI appends to the
   * index name (`<index><key>`, see `SortBy.tsx` and `toSortKey`). The
   * canonical mapping guarantees `name.keyword` on every document, so the
   * A–Z / Z–A sorts are always available; an atlas may add its own via
   * `sort_attributes`, whose entries win on a key clash.
   */
  settings.sorting = {
    ...DEFAULT_SORTING,
    ...(es?.sort_attributes || []).reduce((acc, sort) => ({
      ...acc,
      [toSortKey(sort.name)]: { field: sort.field, order: sort.order || 'asc' }
    }), {})
  };

  return settings;
};
