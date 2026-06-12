import { useLoadedMap } from '@peripleo/maplibre';
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { useEffect } from 'react';

/**
 * The pmtiles:// protocol only needs to be registered with MapLibre once per
 * page, no matter how many layers/maps use it.
 */
let protocolRegistered = false;

const registerProtocol = () => {
  if (!protocolRegistered) {
    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    protocolRegistered = true;
  }
};

interface Props {
  /**
   * ID of the new layer. Also used as the MapLibre source ID.
   */
  id: string,

  /**
   * (Optional) name of the feature property to use for labels. Defaults to "name".
   */
  labelField?: string,

  /**
   * (Optional) array of MapLibre layer definitions (without `source`, which is
   * filled in). Use `source-layer` to address the tile layers (the
   * build.tiles.mjs script produces "features" and "labels"). When omitted, a
   * default fill/line/circle/symbol style is applied.
   */
  styles?: any[],

  /**
   * URL of the .pmtiles archive, or a {z}/{x}/{y} tile URL template (as
   * produced by `npm run build:tiles -- --dir`). Relative URLs are resolved
   * against the site origin.
   */
  url: string,

  /**
   * (Optional) source min/max zoom for template URLs. Defaults: 6 / 15.
   */
  minzoom?: number,
  maxzoom?: number
}

const DEFAULT_COLOR = '#BC2635';

const defaultStyles = (labelField: string) => [{
  id: 'fill',
  type: 'fill',
  'source-layer': 'features',
  paint: {
    'fill-color': DEFAULT_COLOR,
    'fill-opacity': 0.06
  },
  filter: ['==', ['geometry-type'], 'Polygon']
}, {
  id: 'line',
  type: 'line',
  'source-layer': 'features',
  paint: {
    'line-color': DEFAULT_COLOR,
    'line-opacity': 0.3,
    'line-width': 0.75
  },
  filter: ['==', ['geometry-type'], 'Polygon']
}, {
  id: 'circle',
  type: 'circle',
  'source-layer': 'labels',
  paint: {
    'circle-color': DEFAULT_COLOR,
    'circle-opacity': 0.7,
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 1, 12, 2.5, 15, 4]
  }
}, {
  id: 'label',
  type: 'symbol',
  'source-layer': 'labels',
  minzoom: 14,
  layout: {
    'text-field': ['get', labelField],
    'text-font': ['Open Sans Regular'],
    'text-size': 11,
    'text-anchor': 'top',
    'text-offset': [0, 0.5],
    'text-optional': true
  },
  paint: {
    'text-color': '#333333',
    'text-halo-color': '#ffffff',
    'text-halo-width': 1
  }
}];

/**
 * Renders a self-hosted PMTiles vector tile overlay. Tiles can be generated
 * from the project's Core Data geometries with `npm run build:tiles` — the
 * scalable way to put an entire project's records (tens of thousands of
 * features) on the map.
 */
const PMTilesLayer = (props: Props) => {
  const map = useLoadedMap() as any;

  useEffect(() => {
    if (!map) {
      return undefined;
    }
    const url = new URL(props.url, window.location.origin).toString();
    const isArchive = url.endsWith('.pmtiles');

    // {z}/{x}/{y} template URLs use a plain vector source. .pmtiles archives
    // need the pmtiles:// protocol, registered on the maplibre-gl module.
    // (Note: the protocol registry is module-global, so the bundler must
    // resolve a single maplibre-gl copy — see `resolve.dedupe` in
    // astro.config.mjs. Template URLs avoid the issue entirely.)
    if (isArchive) {
      registerProtocol();
    }

    const source = isArchive
      ? { type: 'vector', url: `pmtiles://${url}` }
      : {
        type: 'vector',
        tiles: [decodeURI(url)],
        minzoom: props.minzoom ?? 6,
        maxzoom: props.maxzoom ?? 15
      };

    const sourceId = props.id;
    const styles = props.styles || defaultStyles(props.labelField || 'name');
    const layerIds = styles.map((style) => `${sourceId}-${style.id}`);

    const addLayers = () => {
      try {
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, source);
        }

        styles.forEach((style) => {
          const layerId = `${sourceId}-${style.id}`;

          if (!map.getLayer(layerId)) {
            map.addLayer({
              ...style,
              id: layerId,
              source: sourceId
            });
          }
        });
      } catch (error) {
        console.error('PMTilesLayer: failed to add layers', error);
      }
    };

    addLayers();

    // A base layer style change (`setStyle`) wipes all custom sources/layers;
    // re-add them whenever the style settles without our layers present.
    const onStyleData = () => {
      if (!map.getLayer(layerIds[0])) {
        addLayers();
      }
    };

    map.on('styledata', onStyleData);

    return () => {
      map.off('styledata', onStyleData);

      try {
        layerIds.forEach((layerId) => map.getLayer(layerId) && map.removeLayer(layerId));

        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }
      } catch (error) {
        // The map may already be destroyed during teardown.
      }
    };
  }, [map, props.url]);

  return null;
};

export default PMTilesLayer;
