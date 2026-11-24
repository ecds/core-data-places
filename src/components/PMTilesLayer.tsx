import { useLoadedMap } from '@peripleo/maplibre';
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { useEffect, useRef } from 'react';
import { ensureSprite } from '@utils/sprite';
import { absoluteTiles, tileUrlKind, vectorLayerIds } from '@utils/tiles';
import {
  CLICKABLE_PLACE_LAYERS,
  defaultStyles,
  FIXED_LAYER_PREFIX,
  isPlacesTileSet,
  PLACE_LAYER_IDS,
  stylesForLayers,
  type TypeIcons,
  usesIcons
} from '@utils/tileStyles';

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
   * og_pmtiles task writes a "places" layer). When omitted,
   * a style is chosen from the tile set's layers (utils/tileStyles.ts).
   */
  styles?: any[],

  /**
   * URL of the .pmtiles archive, a TileJSON document (.json; e.g. ECDS's
   * tile server, or the atlas's /map-tiles proxy of it), or a {z}/{x}/{y}
   * tile URL template.
   * Relative URLs are resolved against the site origin.
   */
  url: string,

  /**
   * (Optional) source min/max zoom for template URLs. Defaults: 6 / 15.
   */
  minzoom?: number,
  maxzoom?: number,

  /**
   * (Optional) the overlay's opacity (0–1), scaling each style's own
   * (a default fill at 0.06 drawn at 50% is 0.03). Default 1.
   */
  opacity?: number,

  /**
   * (Optional) called with a place's tile properties (uuid, slug, name, …)
   * when the visitor clicks it, for og_pmtiles tiles. Clicking a cluster
   * zooms in instead.
   */
  onSelectPlace?: (place: { uuid: string, slug?: string, name?: string }) => void,

  /**
   * (Optional) an icon and colour per place type, for og_pmtiles tiles:
   * `{ "Church": { "icon": "church", "color": "#1e40af" } }`. Icons come from
   * the renderer's sprite (`npm run build:sprites`).
   */
  typeIcons?: TypeIcons
}



/**
 * A style's MapLibre layer id: og_pmtiles' are fixed (see PLACE_LAYER_IDS),
 * the rest are prefixed with the source's id.
 */
const layerIdOf = (sourceId: string, style: any) => (
  String(style.id).startsWith(FIXED_LAYER_PREFIX) ? style.id : `${sourceId}-${style.id}`
);

// Each layer type's opacity paint properties.
const OPACITY_PROPERTIES: Record<string, string[]> = {
  fill: ['fill-opacity'],
  line: ['line-opacity'],
  circle: ['circle-opacity', 'circle-stroke-opacity'],
  symbol: ['text-opacity', 'icon-opacity'],
  raster: ['raster-opacity'],
  'fill-extrusion': ['fill-extrusion-opacity'],
  heatmap: ['heatmap-opacity']
};

// A style's paint with its opacity properties scaled by `opacity`.
const scaledPaint = (style: any, opacity: number) => {
  const paint = { ...(style.paint || {}) };
  (OPACITY_PROPERTIES[style.type] || []).forEach((property) => {
    const base = style.paint?.[property] ?? 1;
    if (typeof base === 'number') paint[property] = base * opacity;
  });
  return paint;
};

/**
 * Renders a self-hosted PMTiles vector tile overlay. An atlas's tiles are
 * built by the indexing engine's og_pmtiles task (FairData) — the
 * scalable way to put an entire project's records (tens of thousands of
 * features) on the map.
 */
const PMTilesLayer = (props: Props) => {
  const map = useLoadedMap() as any;
  const opacity = props.opacity ?? 1;
  // Read when layers are (re)added, so they start at the current opacity.
  const opacityRef = useRef(opacity);
  opacityRef.current = opacity;
  // The styles drawn (a TileJSON's are chosen once it has loaded).
  const stylesRef = useRef<any[]>(props.styles || defaultStyles(props.labelField || 'name'));

  useEffect(() => {
    if (!map) {
      return undefined;
    }
    const url = new URL(props.url, window.location.origin).toString();
    const kind = tileUrlKind(url);
    const sourceId = props.id;
    const labelField = props.labelField || 'name';
    let cancelled = false;
    let source: any = null;
    let styles: any[] = props.styles || defaultStyles(labelField);
    let layerIds: string[] = [];

    // {z}/{x}/{y} template URLs use a plain vector source. .pmtiles archives
    // need the pmtiles:// protocol, registered on the maplibre-gl module.
    // (Note: the protocol registry is module-global, so the bundler must
    // resolve a single maplibre-gl copy — see `resolve.dedupe` in
    // astro.config.mjs. Template URLs avoid the issue entirely.) A TileJSON
    // is read first: its tiles (made absolute; the /map-tiles proxy answers
    // with root-relative ones), zoom range and bounds make the source, and
    // its layer names choose the styles.
    if (kind === 'archive') {
      registerProtocol();
      source = { type: 'vector', url: `pmtiles://${url}` };
    } else if (kind === 'template') {
      source = {
        type: 'vector',
        tiles: [decodeURI(url)],
        minzoom: props.minzoom ?? 6,
        maxzoom: props.maxzoom ?? 15
      };
    }

    const addLayers = () => {
      if (!source) {
        return;
      }

      layerIds = styles.map((style) => layerIdOf(sourceId, style));
      stylesRef.current = styles;

      try {
        if (usesIcons(styles)) {
          ensureSprite(map);
        }

        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, source);
        }

        styles.forEach((style) => {
          const layerId = layerIdOf(sourceId, style);

          if (!map.getLayer(layerId)) {
            map.addLayer({
              ...style,
              paint: scaledPaint(style, opacityRef.current),
              id: layerId,
              source: sourceId
            });
          }
        });
      } catch (error) {
        console.error('PMTilesLayer: failed to add layers', error);
      }
    };

    if (kind === 'tilejson') {
      fetch(url)
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`TileJSON ${response.status}`))))
        .then((doc) => {
          if (cancelled) {
            return;
          }

          source = {
            type: 'vector',
            tiles: absoluteTiles(doc.tiles, url),
            minzoom: doc.minzoom ?? 0,
            maxzoom: doc.maxzoom ?? 14,
            ...(Array.isArray(doc.bounds) ? { bounds: doc.bounds } : {}),
            ...(doc.attribution ? { attribution: doc.attribution } : {})
          };
          const vectorLayers = vectorLayerIds(doc);
          // og_pmtiles tiles: feature ids from each place's uuid (tile ids
          // must be whole numbers), for hover and selection state.
          if (isPlacesTileSet(vectorLayers)) {
            source.promoteId = 'uuid';
          }
          styles = props.styles || stylesForLayers(vectorLayers, labelField, props.typeIcons);
          addLayers();
        })
        .catch((error) => console.error('PMTilesLayer: failed to read the TileJSON', error));
    } else {
      addLayers();
    }

    // A base layer style change (`setStyle`) wipes all custom sources/layers;
    // re-add them whenever the style settles without our layers present.
    const onStyleData = () => {
      if (layerIds.length && !map.getLayer(layerIds[0])) {
        addLayers();
      }
    };

    map.on('styledata', onStyleData);

    return () => {
      cancelled = true;
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
  }, [map, props.url, JSON.stringify(props.typeIcons || null)]);

  // The overlay's opacity times each style's own (a number; an expression is
  // left as styled), as the visitor changes it.
  useEffect(() => {
    if (!map) return;

    stylesRef.current.forEach((style) => {
      const layerId = layerIdOf(props.id, style);
      if (!map.getLayer(layerId)) return;

      Object.entries(scaledPaint(style, opacity)).forEach(([property, value]) => {
        if ((OPACITY_PROPERTIES[style.type] || []).includes(property)) map.setPaintProperty(layerId, property, value);
      });
    });
  }, [map, opacity]);

  // Clicking a place opens it; clicking a cluster zooms in. Only when the
  // place is the topmost thing under the pointer, so a search result drawn
  // over it keeps its own click.
  const onSelectRef = useRef(props.onSelectPlace);
  onSelectRef.current = props.onSelectPlace;

  useEffect(() => {
    if (!map) return undefined;

    const clickable = [...CLICKABLE_PLACE_LAYERS, PLACE_LAYER_IDS.cluster];
    const present = () => clickable.filter((id) => map.getLayer(id) && map.getLayer(id).source === props.id);

    const onClick = (event: any) => {
      const layers = present();
      if (!layers.length) return;

      const [top] = map.queryRenderedFeatures(event.point);
      if (!top || !layers.includes(top.layer?.id)) return;

      if (top.layer.id === PLACE_LAYER_IDS.cluster) {
        map.easeTo({ center: event.lngLat, zoom: map.getZoom() + 2 });
        return;
      }

      const place = top.properties || {};
      if (place.uuid && onSelectRef.current) {
        onSelectRef.current({ uuid: place.uuid, slug: place.slug, name: place.name });
      }
    };

    // Only undoes a pointer it set, so other layers' hover cursors stand.
    let pointing = false;

    const onMove = (event: any) => {
      const layers = present();
      if (!layers.length) return;

      const [top] = map.queryRenderedFeatures(event.point);
      const over = !!top && layers.includes(top.layer?.id)
        && (top.layer.id === PLACE_LAYER_IDS.cluster || !!onSelectRef.current);

      if (over) {
        map.getCanvas().style.cursor = 'pointer';
        pointing = true;
      } else if (pointing) {
        map.getCanvas().style.cursor = '';
        pointing = false;
      }
    };

    map.on('click', onClick);
    map.on('mousemove', onMove);

    return () => {
      map.off('click', onClick);
      map.off('mousemove', onMove);
    };
  }, [map, props.id]);

  return null;
};

export default PMTilesLayer;
