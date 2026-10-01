/**
 * Parses the JSON from the `properties` object as a work-around. See description below.
 *
 * @param feature
 */
export const parseFeature = (feature) => {
  if (!feature) {
    return null;
  }

  let properties = {};

  /**
   * This looks to be a known issue with `maplibre-gl-js`. The `properties` object is serialized into a string. As a
   * work-around, we'll check all of the keys and attempt to parse all of the strings into JSON.
   *
   * @see https://github.com/maplibre/maplibre-gl-js/issues/1325
   */
  for (const key in feature.properties) {
    let value = feature.properties[key];

    if (typeof feature.properties[key] === 'string') {
      try {
        value = JSON.parse(feature.properties[key] as string);
      } catch (e) {
        value = feature.properties[key];
      }
    }

    properties[key] = value;
  }

  return {
    ...feature,
    properties
  };
};

export const kilometersToMiles = (km) => km * 0.621371;

// Degrees: anything narrower is a single point.
const MIN_EXTENT = 1e-6;

// How close the search map comes to a selected point (it never zooms out to
// show one).
const POINT_ZOOM = 15;

/**
 * [west, south, east, north] of a GeoJSON object (FeatureCollection, Feature
 * or geometry), or null when it has no coordinates.
 */
export const bounds = (geojson: any): [number, number, number, number] | null => {
  const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];

  const visit = (node: any) => {
    if (!node) {
      return;
    }

    if (node.type === 'FeatureCollection') {
      (node.features || []).forEach(visit);
    } else if (node.type === 'Feature') {
      visit(node.geometry);
    } else if (node.type === 'GeometryCollection') {
      (node.geometries || []).forEach(visit);
    } else if (node.coordinates) {
      const walk = (c: any) => {
        if (typeof c?.[0] === 'number') {
          box[0] = Math.min(box[0], c[0]);
          box[1] = Math.min(box[1], c[1]);
          box[2] = Math.max(box[2], c[0]);
          box[3] = Math.max(box[3], c[1]);
        } else if (Array.isArray(c)) {
          c.forEach(walk);
        }
      };

      walk(node.coordinates);
    }
  };

  visit(geojson);

  return box.every(Number.isFinite) ? box : null;
};

/**
 * True when the GeoJSON covers an area or a distance — a boundary, a route,
 * several points, an uncertainty circle — rather than a single point.
 */
export const hasExtent = (geometry: any): boolean => {
  const box = bounds(geometry);

  return !!box && (box[2] - box[0] > MIN_EXTENT || box[3] - box[1] > MIN_EXTENT);
};

interface ShowPlaceOptions {
  /** Room the map's overlays (result list, record panel) take up, in pixels. */
  padding?: any;
  maxZoom?: number;
}

/**
 * Moves `map` to a place the visitor selected: a shape fitted to its own
 * extent, a point centred and brought to street level (closer if the map is
 * already closer).
 */
export const showPlace = (map: any, geometry: any, options: ShowPlaceOptions = {}) => {
  const box = bounds(geometry);

  if (!box) {
    return;
  }

  const maxZoom = options.maxZoom ?? 18;

  if (hasExtent(geometry)) {
    map.fitBounds(box, { padding: options.padding, maxZoom: Math.min(maxZoom, 17) });
  } else {
    map.easeTo({
      center: [box[0], box[1]],
      padding: options.padding,
      zoom: Math.min(maxZoom, Math.max(map.getZoom(), POINT_ZOOM))
    });
  }
};
