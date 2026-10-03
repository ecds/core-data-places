import TranslationContext from '@contexts/TranslationContext';
import {
  Icon,
  OverlayLayers,
  Peripleo as PeripleoUtils
} from '@performant-software/core-data';
import { Map as PeripleoMap, useMap, ZoomControl } from '@peripleo/maplibre';
import { MapProvider, useRuntimeConfig } from '@peripleo/peripleo';
import clsx from 'clsx';
import { type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import _ from 'underscore';
import defaults from '@config' with { type: 'json' };
import { resolveAssetPath } from '@utils/images';
import { getDatedLayers, getInitialMapYear, getLayersForYear, getMapYears } from '@utils/mapYears';
import { hasOpacity, opacityOf } from '@utils/overlays';
import ImageOverlayLayer from './ImageOverlayLayer';
import LayersControl from './LayersControl';
import MapYearControl from './MapYearControl';
import OverlayOpacity from './OverlayOpacity';
import PMTilesLayer from './PMTilesLayer';

/**
 * Defers rendering children until the underlying MapLibre style has fully
 * loaded. Peripleo's `useLoadedMap` returns the map synchronously the moment a
 * style prop is provided to `<PeripleoMap>`, even though MapLibre hasn't
 * finished parsing the style yet. Layer-adding children (e.g. `LocationMarkers`
 * via `GeoJSONLayer`) then call `map.getStyle().layers` and crash because the
 * style is undefined. Gating on `isStyleLoaded()` and the `styledata` /`load`
 * events avoids that race.
 */
const WhenStyleLoaded = ({ children }: { children: ReactNode }) => {
  // `useMap` (not `useLoadedMap`): the loaded flag behind `useLoadedMap` is
  // set by MapLibre's 'load' event, which fires only after the first frame
  // renders. A background tab (or an occluded window) gets no
  // requestAnimationFrame, so in it no frame renders and 'load' never fires
  // — the map looks stalled until the tab is shown, at which point it paints
  // on its own. That is browser scheduling, not a render-loop fault: nothing
  // the page does (resize, triggerRepaint) draws a frame while rAF is
  // suspended. Style readiness, though, comes from fetches, not frames, so
  // watching it directly lets layer children mount while still hidden.
  const map = useMap() as any;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!map || ready) return;

    let cancelled = false;

    const onReady = () => {
      if (cancelled) return;
      setReady(true);
    };

    if (typeof map.isStyleLoaded === 'function' && map.isStyleLoaded()) {
      onReady();
      return;
    }

    map.once?.('load', onReady);

    // Fallback poll: 'load'/'styledata' can be missed when the event fired
    // before we attached, and 'load' waits on a frame (see above).
    const interval = setInterval(() => {
      if (map.isStyleLoaded?.()) {
        clearInterval(interval);
        onReady();
      }
    }, 250);

    return () => {
      cancelled = true;
      clearInterval(interval);
      map.off?.('load', onReady);
    };
  }, [map, ready]);

  return ready ? <>{children}</> : null;
};

/**
 * Keeps overlays (historic maps, imagery, PMTiles) beneath the atlas's own
 * data: peripleo adds a layer at the top of the style, so an overlay switched
 * on after the map loaded — from the layer menu or the year slider — covered
 * the place markers. An overlay's layers are known exactly: a georeferenced
 * map's layer carries the overlay's name as its id, a PMTiles archive's layers
 * read the source named after it, and peripleo's raster and GeoJSON layers read
 * `source-<name>`. Data layers are the ones drawn from GeoJSON sources that
 * aren't overlays (results, the selected place). Runs again whenever the style
 * changes, since an overlay's layer can arrive after its component mounts.
 */
const KeepOverlaysBelowData = ({ names }: { names: string[] }) => {
  const map = useMap() as any;
  const key = names.join('\u0000');

  useEffect(() => {
    if (!map) return;

    const isOverlay = (id: string) => {
      const source = map.getLayer(id)?.source;
      return _.some(names, (name) => id === name || source === name || source === `source-${name}`);
    };

    const reorder = () => {
      const order: string[] = map.getLayersOrder?.() || _.pluck(map.getStyle()?.layers || [], 'id');
      const isData = (id: string) => !isOverlay(id) && map.getSource(map.getLayer(id)?.source)?.type === 'geojson';
      const firstData = _.findIndex(order, isData);

      if (firstData < 0) return;

      order.forEach((id, index) => {
        if (index > firstData && isOverlay(id)) {
          map.moveLayer(id, order[firstData]);
        }
      });
    };

    reorder();
    map.on('styledata', reorder);

    return () => {
      map.off('styledata', reorder);
    };
  }, [map, key]);

  return null;
};

interface Props {
  children: ReactNode,
  classNames?: {
    controls?: string
    root?: string,
  };
}

const Map = (props: Props) => {
  const config = useRuntimeConfig();
  // An atlas whose base maps were all removed (only overlays left) still gets
  // one: the defaults' OpenStreetMap, as a new atlas starts with.
  const { baseLayers, dataLayers } = useMemo(() => {
    const layers = PeripleoUtils.filterLayers(config);
    return _.isEmpty(layers.baseLayers) ? { ...layers, baseLayers: (defaults as any).layers } : layers;
  }, [config]);

  /**
   * Dated historic maps: with two or more, a year slider shows them (one year
   * at a time) instead of the layer menu listing them.
   */
  const datedLayers = useMemo(() => getDatedLayers(dataLayers), [dataLayers]);
  const mapYears = useMemo(() => getMapYears(datedLayers), [datedLayers]);
  const yearSlider = mapYears.length >= 2;
  const menuLayers = useMemo(() => (yearSlider ? _.difference(dataLayers, datedLayers) : dataLayers), [dataLayers, datedLayers, yearSlider]);

  const [baseLayer, setBaseLayer] = useState(_.first(baseLayers));
  // The listed overlays shown now: at first, the ones set to show at open.
  const [overlays, setOverlays] = useState<any[]>(() => _.filter(menuLayers, (layer: any) => layer.default === true));
  const [mapYear, setMapYear] = useState<number | null>(() => getInitialMapYear(datedLayers));
  // Opacities the visitor has chosen, by overlay name.
  const [opacities, setOpacities] = useState<Record<string, number>>({});

  const yearOverlays = useMemo(() => (yearSlider ? getLayersForYear(datedLayers, mapYear) : []), [yearSlider, datedLayers, mapYear]);

  const visibleOverlays = useMemo(() => (
    _.map([...overlays, ...yearOverlays], (overlay: any) => ({ ...overlay, opacity: opacityOf(overlay, opacities) }))
  ), [overlays, yearOverlays, opacities]);

  // Uploaded images (a KML overlay's) are stored as console paths.
  const assetBase = (config as any)?.core_data?.url;

  const onToggleOverlay = (name: string, visible: boolean) => setOverlays((current) => (
    _.filter(menuLayers, (layer: any) => (layer.name === name ? visible : _.some(current, (c: any) => c.name === layer.name)))
  ));

  const controlOverlays = [
    ..._.map(menuLayers, (layer: any) => ({
      name: layer.name,
      visible: _.some(overlays, (o: any) => o.name === layer.name),
      opacity: opacityOf(layer, opacities),
      togglable: true,
      adjustable: hasOpacity(layer)
    })),
    ..._.map(yearOverlays, (layer: any) => ({
      name: layer.name,
      visible: true,
      opacity: opacityOf(layer, opacities),
      togglable: false,
      adjustable: hasOpacity(layer)
    }))
  ];

  const { t } = useContext(TranslationContext);

  /**
   * Memo-izes the class to apply to the map control buttons.
   */
  const buttonClass = useMemo(() => [
    'bg-gray-50',
    'shadow',
    'rounded-full',
    'h-[40px]',
    'w-[40px]',
    'flex',
    'justify-center',
    'items-center',
    'hover:opacity-90'
  ].join(' '), []);

  // Each BaseMap gets its own MapProvider. Peripleo ships a single shared
  // `MapContext` at the app root, so when a post body contains more than one
  // map (e.g. a `<place>` block and a `<map>` block), each PeripleoMap mount
  // overwrites the previous one's `setMap(...)` and `useLoadedMap()` returns
  // the wrong instance for the earlier subtree. Isolating the context per
  // BaseMap avoids the cross-contamination.
  return (
    <MapProvider>
      <PeripleoMap
        attributionControl={false}
        className={clsx('grow', props.classNames?.root)}
        style={PeripleoUtils.toLayerStyle(baseLayer, baseLayer.name)}
      >
        <div
          className={clsx('absolute top-0 right-0 flex flex-col py-3 px-3 gap-y-2', props.classNames?.controls)}
        >
          <ZoomControl
            zoomIn={<Icon name='zoom_in' />}
            zoomInProps={{ className: buttonClass }}
            zoomOut={<Icon name='zoom_out' />}
            zoomOutProps={{ className: buttonClass }}
          />
          { (baseLayers.length > 1 || controlOverlays.length > 0) && (
            <LayersControl
              baseLayer={baseLayer?.name}
              baseLayers={baseLayers}
              className={buttonClass}
              labels={{ button: t('mapLayers'), baseLayers: t('baseLayers'), overlays: t('overlays'), opacity: t('opacity') }}
              onChangeBaseLayer={(name) => setBaseLayer(_.findWhere(baseLayers, { name }))}
              onChangeOpacity={(name, value) => setOpacities((current) => ({ ...current, [name]: value }))}
              onToggleOverlay={onToggleOverlay}
              overlays={controlOverlays}
            />
          )}
          { yearSlider && (
            <MapYearControl
              label={t('mapYear')}
              noneLabel={t('mapYearNone')}
              onChange={setMapYear}
              value={mapYear}
              years={mapYears}
            />
          )}
        </div>
        <WhenStyleLoaded>
          { /* One per overlay, keyed by name: core-data's OverlayLayers keys by
              position, and its georeferenced-map layer is added only on mount,
              so a different map in the same position (the year slider) must
              remount rather than update. */ }
          { _.filter(visibleOverlays, (overlay: any) => !['pmtiles', 'image'].includes(overlay.layer_type)).map((overlay: any) => (
            <OverlayLayers
              key={overlay.name}
              overlays={[overlay]}
            />
          ))}
          { _.filter(visibleOverlays, (overlay: any) => overlay.layer_type === 'pmtiles').map((overlay: any) => (
            <PMTilesLayer
              id={overlay.name}
              key={overlay.name}
              labelField={overlay.label_field}
              opacity={overlay.opacity}
              styles={overlay.styles}
              url={overlay.url}
            />
          ))}
          { _.filter(visibleOverlays, (overlay: any) => overlay.layer_type === 'image').map((overlay: any) => (
            <ImageOverlayLayer
              coordinates={overlay.coordinates}
              id={overlay.name}
              key={overlay.name}
              opacity={overlay.opacity}
              url={resolveAssetPath(overlay.url, assetBase) as string}
            />
          ))}
          <OverlayOpacity
            overlays={visibleOverlays}
          />
          { props.children }
          <KeepOverlaysBelowData
            names={_.pluck(visibleOverlays, 'name')}
          />
        </WhenStyleLoaded>
      </PeripleoMap>
    </MapProvider>
  );
};

export default Map;