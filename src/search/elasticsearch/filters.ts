/**
 * Base filters applied to every Elasticsearch query, on the server.
 *
 * These are deliberately NOT expressible from the browser. Searchkit's client
 * sends the user's query/refinements; the handler adds these filters before the
 * request reaches Elasticsearch, so an atlas can never be made to return another
 * atlas's documents by tampering with the request.
 */

/**
 * The field carrying the owning project on every OG document.
 *
 * CONTRACT SEAM: the canonical schema fixes this as the per-tenant key (see
 * OG_SCHEMA_ANALYSIS.md §4). It is the one field the multi-tenant renderer
 * cannot function without, so it is named here rather than left to config.
 */
export const TENANT_FIELD = 'project_id';

interface BaseFilterOptions {
  /** The project id(s) the current atlas is allowed to see. */
  projectIds: Array<string | number>;
  /** Optional map-search viewport, as [west, south, east, north]. */
  bbox?: [number, number, number, number];
  /** The document's geo_point field, when the atlas supports map search. */
  geoField?: string;
}

/**
 * Builds the array of Elasticsearch query clauses to AND onto every search.
 *
 * Passed to `@searchkit/api` as `getBaseFilters()`.
 *
 * The tenant clause is mandatory: if the atlas resolves to no project ids we
 * emit a clause that matches nothing, rather than silently returning the whole
 * shared index. Failing closed is the only safe default for a shared index.
 *
 * @param options
 */
export const buildBaseFilters = ({ projectIds, bbox, geoField }: BaseFilterOptions) => {
  const filters: Array<any> = [];

  if (!projectIds?.length) {
    /**
     * Fail closed. An unresolved atlas (unknown slug, missing config) must not
     * fall through to an unfiltered query against a shared index.
     */
    filters.push({ match_none: {} });

    return filters;
  }

  filters.push({
    terms: {
      [TENANT_FIELD]: projectIds
    }
  });

  /**
   * Visibility. Hidden records must be unsearchable regardless of what the
   * client asks for — enforced here, in the same trusted layer as the tenant
   * filter, so the mapping's "every query filters on project_id + visibility"
   * contract actually holds. Documents lacking the field are excluded (a term
   * query never matches a missing field), which fails closed for any document
   * indexed before the visibility field existed.
   */
  filters.push({
    term: {
      visibility: 'published'
    }
  });

  /**
   * Map search. The renderer's map issues a viewport query as the user pans;
   * expressing it as a base filter keeps the geo clause server-side and out of
   * the InstantSearch refinement state.
   *
   * CONTRACT SEAM: assumes the geo field is a `geo_point`. If the locked mapping
   * makes it a `geo_shape` (needed for polygon extents rather than centroids),
   * this becomes a `geo_shape` / `envelope` query instead.
   */
  if (bbox && geoField) {
    const [west, south, east, north] = bbox;

    filters.push({
      geo_bounding_box: {
        [geoField]: {
          top_left: { lat: north, lon: west },
          bottom_right: { lat: south, lon: east }
        }
      }
    });
  }

  return filters;
};
