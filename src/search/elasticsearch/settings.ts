import type { SearchConfig } from '@types';

/**
 * The `search_settings` object consumed by `@searchkit/api` on the server.
 *
 * @see https://searchkit.co/docs/api-documentation/api
 */
export interface SearchSettings {
  search_attributes: Array<string | { field: string, weight: number }>;
  result_attributes: Array<string>;
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

const DEFAULT_RESULT_ATTRIBUTES = [
  'uuid',
  'slug',
  'name',
  'names',
  'description',
  'short_description',
  'types',
  'geo',
  'geojson',
  'administrative_area',
  'thumbnail'
];

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

  const settings: SearchSettings = {
    search_attributes: es?.search_attributes?.length
      ? es.search_attributes
      : DEFAULT_SEARCH_ATTRIBUTES,
    result_attributes: es?.result_attributes?.length
      ? es.result_attributes
      : DEFAULT_RESULT_ATTRIBUTES,
    facet_attributes: (es?.facet_attributes || []).map(normalizeFacet)
  };

  /**
   * Sorting. Typesense expresses sorts as pseudo-indices
   * (`index/sort/field:asc`); Searchkit declares them up front and refers to
   * them by name. `SortBy.tsx` still speaks the Typesense dialect, so wiring the
   * sort UI to these names is a follow-up once the sortable fields are fixed.
   */
  if (es?.sort_attributes?.length) {
    settings.sorting = es.sort_attributes.reduce((acc, sort) => ({
      ...acc,
      [sort.name]: { field: sort.field, order: sort.order || 'asc' }
    }), {});
  }

  return settings;
};
