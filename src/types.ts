import { ModelNames } from '@services/coreData/factory';

export type Models =
  typeof ModelNames.events |
  typeof ModelNames.instances |
  typeof ModelNames.items |
  typeof ModelNames.mediaContents |
  typeof ModelNames.organizations |
  typeof ModelNames.people |
  typeof ModelNames.places |
  typeof ModelNames.taxonomies |
  typeof ModelNames.works;

import { Dispatch, SetStateAction } from "react";

export interface SearchConfig {
  name: string,
  route: string,
  geosearch?: boolean,

  /**
   * Caps how many hits are progressively loaded into the browser (list +
   * result map). Without it the search streams the entire result set, which
   * is unusable for large datasets. See MapSearchProvider.tsx.
   */
  result_limit?: number,
  timeline?: {
    date_range_facet: string,
    event_path?: string,
  };

  facets?: Array<{
    name: string,
    type: 'list' | 'select',
    icon?: string
  }>;

  map?:{
    cluster_radius?: number,
    geometry: string,
    properties?: string,
    max_zoom?: number,
    zoom_to_place?: boolean
  };

  result_card: {
    attributes?: Array<{
      name: string,
      icon?: string,
      parser?: string
    }>,
    relationships?: string[],
    title: string,
    tags?: Array<{
      name: string,
      primary?: boolean,
      secondary?: boolean,
      parser?: string
    }>
  };

  table?: boolean;

  type?: 'grid' | 'image' | 'list' | 'map';

  typesense: {
    host: string,
    port: number,
    protocol: string,
    api_key: string,
    index_name: string,
    query_by: string,
    default_sort?: string,
    exclude_fields?: string,
    facets?: {
      exclude?: Array<string>,
      include?: Array<string>
    }
    overrides?: {
      [key: string]: string
    }
  };
}

export interface Configuration {
  content?: {
    collections?: Array<String>,
    localize_pages?: boolean,
    posts_config?: {
      categories?: Array<String>,
      drafts?: boolean,
      layout?: 'list' | 'grid'
    },
    paths_config?: {
      categories?: Array<String>,
      drafts?: boolean,
      layout?: 'list' | 'grid'     
    }
  };

  core_data: {
    url: string,
    project_ids: string[]
  };

  detail_pages?: {
    models: {
      [key in Models]: {
        related_manifest?: {
          model: string,
          relationship: string
        },

        /**
         * Renders longform content from a WordPress site on the detail page.
         * `field` is the UUID of the user-defined field holding the WordPress
         * post/page ID (or slug). `resource` defaults to "posts".
         */
        wordpress?: {
          host: string,
          field: string,
          resource?: 'posts' | 'pages'
        }
      }
    },
    relationship_fields?: {
      events?: string[],
      instances?: string[],
      items?: string[],
      organizations?: string[],
      people?: string[],
      places?: string[],
      taxonomies?: string[],
      works?: string[]
    }
  };

  i18n: {
    default_locale: string,
    locales: string[]
  },

  gallery?: string,

  layers?: Array<{
    name: string,
    layer_type: 'geojson' | 'vector' | 'raster' | 'georeference' | 'pmtiles',
    url: string,
    overlay?: boolean,

    /**
     * georeference layers only: opacity of the warped image (0-1).
     */
    opacity?: number,

    /**
     * pmtiles layers only: the feature property used for labels (default "name")
     * and an optional array of MapLibre layer definitions overriding the
     * default fill/line/circle/symbol styling. See PMTilesLayer.tsx.
     */
    label_field?: string,
    styles?: any[]
  }>,

  result_filtering?: {
    events?: {
      exclude?: string[]
    },
    instances?: {
      exclude?: string[]
    },
    items?: {
      exclude?: string[]
    },
    organizations?: {
      exclude?: string[]
    },
    people?: {
      exclude?: string[]
    },
    places?: {
      exclude?: string[]
    },
    works?: {
      exclude?: string[]
    }
  },

  search: Array<SearchConfig>
}

export interface DataVisualizationProps {
  data: any;
  title?: string;
}

export interface SearchSession {
  created: string;
  data: any;
  id: string;
  name: string;
  searchName: string;
}

export interface HitComponentProps {
  attributes: {
    label: string;
    icon: string;
    name: string;
    parser?: string;
    value: string;
  }[]
  relationships: {
    label: string;
    names: string[];
  }
  highlightComponent?: React.FC<any>;
  hit: any;
  setManifestUrl?: Dispatch<SetStateAction<string>>
  tags?: {
    name: string;
    primary?: boolean;
    secondary?: boolean;
    value: string;
  }[]
}

export interface NavbarItem {
  href?: string;
  options?: NavbarItem[];
}

export interface Navbar {
  items: NavbarItem[];
}