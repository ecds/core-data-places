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

// A cluster made by tippecanoe: point_count > 1.
const CLUSTER = ['all', POINT, ['>', ['coalesce', ['get', 'point_count'], 1], 1]];
// A place of the atlas's own (not an area it's contained in, not a cluster).
const PLACE = ['all', POINT, ['!=', ['get', 'contained_in'], true], ['<=', ['coalesce', ['get', 'point_count'], 1], 1]];
// The boundary of an area the atlas's places are contained in.
const AREA = ['all', POLYGON, ['==', ['get', 'contained_in'], true]];

/**
 * Tiles from FairData's og_pmtiles task (ECDS): one "places" layer, with
 * nearby places clustered at low zooms (point_count, point_count_abbreviated)
 * and the areas they're contained in (contained_in: true).
 *
 * @param labelField
 */
export const clusteredPlacesStyles = (labelField: string) => [{
  id: 'area-fill',
  type: 'fill',
  'source-layer': 'places',
  filter: AREA,
  paint: {
    'fill-color': DEFAULT_COLOR,
    'fill-opacity': 0.04
  }
}, {
  id: 'area-line',
  type: 'line',
  'source-layer': 'places',
  filter: AREA,
  paint: {
    'line-color': DEFAULT_COLOR,
    'line-opacity': 0.35,
    'line-width': 0.75
  }
}, {
  id: 'cluster',
  type: 'circle',
  'source-layer': 'places',
  filter: CLUSTER,
  paint: {
    'circle-color': DEFAULT_COLOR,
    'circle-opacity': 0.8,
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 1.5,
    'circle-radius': ['step', ['get', 'point_count'], 10, 10, 14, 50, 18, 200, 22]
  }
}, {
  id: 'cluster-count',
  type: 'symbol',
  'source-layer': 'places',
  filter: CLUSTER,
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
  id: 'point',
  type: 'circle',
  'source-layer': 'places',
  filter: PLACE,
  paint: {
    'circle-color': DEFAULT_COLOR,
    'circle-opacity': 0.85,
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 1,
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 3, 10, 5]
  }
}, {
  id: 'label',
  type: 'symbol',
  'source-layer': 'places',
  filter: PLACE,
  minzoom: 9,
  layout: labelLayout(labelField),
  paint: labelPaint
}];

/**
 * The styles for a tile set with these vector layers: build:tiles' own
 * ("features"/"labels"), og_pmtiles' "places", or the default look on the
 * first layer of anything else.
 *
 * @param layerIds
 * @param labelField
 */
export const stylesForLayers = (layerIds: string[], labelField: string) => {
  if (!layerIds.length || layerIds.includes('features') || layerIds.includes('labels')) {
    return defaultStyles(labelField);
  }

  return layerIds.includes('places') ? clusteredPlacesStyles(labelField) : defaultStyles(labelField, layerIds[0]);
};
