/**
 * How a vector tile overlay is drawn when its layer doesn't give its own
 * styles: chosen by the tile set's vector layer names.
 */

export const DEFAULT_COLOR = '#BC2635';

const POLYGON = ['==', ['geometry-type'], 'Polygon'];
const POINT = ['==', ['geometry-type'], 'Point'];

const labelLayout = (labelField: string) => ({
  'text-field': ['get', labelField],
  'text-font': ['Open Sans Regular'],
  'text-size': 11,
  'text-anchor': 'top',
  'text-offset': [0, 0.5],
  'text-optional': true
});

const labelPaint = {
  'text-color': '#333333',
  'text-halo-color': '#ffffff',
  'text-halo-width': 1
};

/**
 * Tiles from `npm run build:tiles`: boundaries in "features", points to
 * label in "labels". With `layer`, the same look on a single layer of any
 * name (points filtered to points).
 *
 * @param labelField
 * @param layer
 */
export const defaultStyles = (labelField: string, layer?: string) => [{
  id: 'fill',
  type: 'fill',
  'source-layer': layer || 'features',
  paint: {
    'fill-color': DEFAULT_COLOR,
    'fill-opacity': 0.06
  },
  filter: POLYGON
}, {
  id: 'line',
  type: 'line',
  'source-layer': layer || 'features',
  paint: {
    'line-color': DEFAULT_COLOR,
    'line-opacity': 0.3,
    'line-width': 0.75
  },
  filter: POLYGON
}, {
  id: 'circle',
  type: 'circle',
  'source-layer': layer || 'labels',
  paint: {
    'circle-color': DEFAULT_COLOR,
    'circle-opacity': 0.7,
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 1, 12, 2.5, 15, 4]
  },
  ...(layer ? { filter: POINT } : {})
}, {
  id: 'label',
  type: 'symbol',
  'source-layer': layer || 'labels',
  minzoom: 14,
  layout: labelLayout(labelField),
  paint: labelPaint,
  ...(layer ? { filter: POINT } : {})
}];

const LINE = ['==', ['geometry-type'], 'LineString'];
const NOT_AREA = ['!=', ['get', 'contained_in'], true];
const NOT_CLUSTER = ['<=', ['coalesce', ['get', 'point_count'], 1], 1];

/**
 * Filters for the og_pmtiles convention, for styles that draw on it. A layer
 * that styles places by type must keep `NOT_CLUSTER`: a cluster carries one
 * of its places' properties, so it would otherwise take that place's look.
 */
export const TILE_FILTERS = {
  // A cluster made by tippecanoe: point_count > 1.
  cluster: ['all', POINT, ['>', ['coalesce', ['get', 'point_count'], 1], 1]],
  // One of the atlas's own places, as a point.
  point: ['all', POINT, NOT_AREA, NOT_CLUSTER],
  // One of the atlas's own places drawn as a line (a stream, a road).
  line: ['all', LINE, NOT_AREA],
  // One of the atlas's own places drawn as an area (an island, a park).
  polygon: ['all', POLYGON, NOT_AREA],
  // An area the atlas's places are contained in (a county, the state).
  area: ['all', POLYGON, ['==', ['get', 'contained_in'], true]],
  notCluster: NOT_CLUSTER
};

/**
 * The MapLibre layer ids og_pmtiles tiles are drawn with, the same for every
 * atlas, so a style or a click handler can name them. Clicking one of
 * `CLICKABLE_PLACE_LAYERS` opens that place.
 */
export const PLACE_LAYER_IDS = {
  areaLine: 'og-areas-line',
  fill: 'og-places-fill',
  outline: 'og-places-outline',
  line: 'og-places-line',
  cluster: 'og-places-cluster',
  clusterCount: 'og-places-cluster-count',
  point: 'og-places-point',
  icon: 'og-places-icon',
  label: 'og-places-label'
};

export const CLICKABLE_PLACE_LAYERS = [PLACE_LAYER_IDS.point, PLACE_LAYER_IDS.icon, PLACE_LAYER_IDS.line, PLACE_LAYER_IDS.fill];

// Ids starting with this are used as they are, not prefixed with the source's.
export const FIXED_LAYER_PREFIX = 'og-';

/**
 * The renderer's own icon sprite (`npm run build:sprites`), loaded next to
 * the base map's under this id: icons are `og:<name>`.
 */
export const SPRITE_ID = 'og';
export const SPRITE_PATH = '/sprites/og';

/**
 * An icon and colour for a place type, from an atlas's `type_icons`:
 * `{ "Church": { "icon": "church", "color": "#1e40af" } }`.
 */
export interface TypeIcon {
  icon: string;
  color?: string;
}

export type TypeIcons = Record<string, TypeIcon>;

/**
 * Whether a tile feature is of this type: its plain `type`, if the tiles
 * carry one, or a quoted match in `types`, which tiles store as JSON text
 * (so "Park" doesn't also match "Parking Lot").
 */
export const typeMatch = (type: string) => ['any',
  ['==', ['get', 'type'], type],
  ['in', JSON.stringify(type), ['coalesce', ['get', 'types'], '']]
];

const iconEntries = (typeIcons?: TypeIcons) => Object.entries(typeIcons || {})
  .filter(([type, entry]) => type && entry?.icon);

/**
 * Whether the atlas's styles use the icon sprite.
 */
export const usesIcons = (styles: any[]) => styles.some((style) => style.id === PLACE_LAYER_IDS.icon);

/**
 * Tiles from FairData's og_pmtiles task (ECDS): one "places" layer, with
 * nearby places clustered at low zooms (point_count, point_count_abbreviated)
 * and the areas they're contained in (contained_in: true), which may instead
 * come in a layer of their own, "areas". The atlas's own places may be
 * points, lines or polygons.
 *
 * Places of a type in `typeIcons` are drawn with its icon and colour (the
 * first listed type a place has wins); the rest stay circles. Clusters never
 * take an icon.
 *
 * @param labelField
 * @param separateAreas  the tiles have an "areas" layer
 * @param typeIcons
 */
export const clusteredPlacesStyles = (labelField: string, separateAreas = false, typeIcons?: TypeIcons) => {
  const icons = iconEntries(typeIcons);
  const matches = icons.map(([type]) => typeMatch(type));
  const hasIcon = ['any', ...matches];

  const areas = separateAreas
    ? { 'source-layer': 'areas', filter: POLYGON }
    : { 'source-layer': 'places', filter: TILE_FILTERS.area };

  // Areas are outlined, not filled: a county inside the state would stack
  // two fills and tint the whole map.
  return [{
    id: PLACE_LAYER_IDS.areaLine,
    type: 'line',
    ...areas,
    paint: {
      'line-color': DEFAULT_COLOR,
      'line-opacity': 0.35,
      'line-width': 0.75
    }
  }, {
    id: PLACE_LAYER_IDS.fill,
    type: 'fill',
    'source-layer': 'places',
    filter: TILE_FILTERS.polygon,
    paint: {
      'fill-color': DEFAULT_COLOR,
      'fill-opacity': 0.2
    }
  }, {
    id: PLACE_LAYER_IDS.outline,
    type: 'line',
    'source-layer': 'places',
    filter: TILE_FILTERS.polygon,
    paint: {
      'line-color': DEFAULT_COLOR,
      'line-opacity': 0.8,
      'line-width': 1
    }
  }, {
    id: PLACE_LAYER_IDS.line,
    type: 'line',
    'source-layer': 'places',
    filter: TILE_FILTERS.line,
    layout: {
      'line-cap': 'round',
      'line-join': 'round'
    },
    paint: {
      'line-color': DEFAULT_COLOR,
      'line-opacity': 0.8,
      'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1, 12, 2.5]
    }
  }, {
    id: PLACE_LAYER_IDS.cluster,
    type: 'circle',
    'source-layer': 'places',
    filter: TILE_FILTERS.cluster,
    paint: {
      'circle-color': DEFAULT_COLOR,
      'circle-opacity': 0.8,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
      'circle-radius': ['step', ['get', 'point_count'], 10, 10, 14, 50, 18, 200, 22]
    }
  }, {
    id: PLACE_LAYER_IDS.clusterCount,
    type: 'symbol',
    'source-layer': 'places',
    filter: TILE_FILTERS.cluster,
    layout: {
      'text-field': ['to-string', ['coalesce', ['get', 'point_count_abbreviated'], ['get', 'point_count']]],
      'text-font': ['Open Sans Regular'],
      'text-size': 11,
      'text-allow-overlap': true
    },
    paint: {
      'text-color': '#ffffff'
    }
  }, {
    id: PLACE_LAYER_IDS.point,
    type: 'circle',
    'source-layer': 'places',
    filter: icons.length ? ['all', TILE_FILTERS.point, ['!', hasIcon]] : TILE_FILTERS.point,
    paint: {
      'circle-color': DEFAULT_COLOR,
      'circle-opacity': 0.85,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 3, 10, 5]
    }
  }, ...(icons.length ? [{
    id: PLACE_LAYER_IDS.icon,
    type: 'symbol',
    'source-layer': 'places',
    filter: ['all', TILE_FILTERS.point, hasIcon],
    layout: {
      'icon-image': ['case', ...icons.flatMap(([type, entry]) => [typeMatch(type), `${SPRITE_ID}:${entry.icon}`]), `${SPRITE_ID}:marker`],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.9, 12, 1.4],
      'icon-allow-overlap': true
    },
    paint: {
      'icon-color': ['case', ...icons.flatMap(([type, entry]) => [typeMatch(type), entry.color || DEFAULT_COLOR]), DEFAULT_COLOR],
      'icon-halo-color': '#ffffff',
      'icon-halo-width': 1
    }
  }] : []), {
    id: PLACE_LAYER_IDS.label,
    type: 'symbol',
    'source-layer': 'places',
    filter: TILE_FILTERS.point,
    minzoom: 9,
    layout: labelLayout(labelField),
    paint: labelPaint
  }];
};

/**
 * Whether a tile set follows the og_pmtiles convention (a "places" layer).
 */
export const isPlacesTileSet = (layerIds: string[]) => layerIds.includes('places');

/**
 * The styles for a tile set with these vector layers: build:tiles' own
 * ("features"/"labels"), og_pmtiles' "places", or the default look on the
 * first layer of anything else.
 *
 * @param layerIds
 * @param labelField
 * @param typeIcons  an icon and colour per place type, for og_pmtiles tiles
 */
export const stylesForLayers = (layerIds: string[], labelField: string, typeIcons?: TypeIcons) => {
  if (!layerIds.length || layerIds.includes('features') || layerIds.includes('labels')) {
    return defaultStyles(labelField);
  }

  return isPlacesTileSet(layerIds)
    ? clusteredPlacesStyles(labelField, layerIds.includes('areas'), typeIcons)
    : defaultStyles(labelField, layerIds[0]);
};
