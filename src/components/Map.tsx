import TranslationContext from '@contexts/TranslationContext';
import {
  Icon,
  LayerMenu,
  OverlayLayers,
  Peripleo as PeripleoUtils
} from '@performant-software/core-data';
import { Map as PeripleoMap, useMap, ZoomControl } from '@peripleo/maplibre';
import { MapProvider, useRuntimeConfig } from '@peripleo/peripleo';
import clsx from 'clsx';
import { type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import _ from 'underscore';
import { getDatedLayers, getInitialMapYear, getLayersForYear, getMapYears } from '@utils/mapYears';
import MapYearControl from './MapYearControl';
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
 * the place markers. Data layers are the ones drawn from GeoJSON sources that
 * aren't overlays (results, the selected place). Runs again whenever the style
 * changes, since an overlay's layer can arrive after its component mounts.
 */
const KeepOverlaysBelowData = ({ names }: { names: string[] }) => {
  const map = useMap() as any;
  const key = names.join('\u0000');

  useEffect(() => {
    if (!map) return;

    const isOverlay = (id: string) => _.some(names, (name) => (
      id === name || id === `layer-${name}` || id.startsWith(`layer-${name}-`) || id.startsWith(`${name}-`)
    ));

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
  const { baseLayers, dataLayers } = useMemo(() => PeripleoUtils.filterLayers(config), [config]);

  /**
   * Dated historic maps: with two or more, a year slider shows them (one year
   * at a time) instead of the layer menu listing them.
   */
  const datedLayers = useMemo(() => getDatedLayers(dataLayers), [dataLayers]);
  const mapYears = useMemo(() => getMapYears(datedLayers), [datedLayers]);
  const yearSlider = mapYears.length >= 2;
  const menuLayers = useMemo(() => (yearSlider ? _.difference(dataLayers, datedLayers) : dataLayers), [dataLayers, datedLayers, yearSlider]);

  const [baseLayer, setBaseLayer] = useState(_.first(baseLayers));
  const [overlays, setOverlays] = useState([]);
  const [mapYear, setMapYear] = useState<number | null>(() => getInitialMapYear(datedLayers));

  const visibleOverlays = useMemo(() => (
    yearSlider ? [...overlays, ...getLayersForYear(datedLayers, mapYear)] : overlays
  ), [overlays, yearSlider, datedLayers, mapYear]);

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
          { [...baseLayers, ...menuLayers].length > 1 && (
            <LayerMenu
              baseLayer={baseLayer?.name}
              baseLayers={baseLayers}
              baseLayersLabel={t('baseLayers')}
              className={buttonClass}
              dataLayers={menuLayers}
              onChangeBaseLayer={setBaseLayer}
              onChangeOverlays={setOverlays}
              overlaysLabel={t('overlays')}
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
          <OverlayLayers
            overlays={_.filter(visibleOverlays, (overlay: any) => overlay.layer_type !== 'pmtiles')}
          />
          { _.filter(visibleOverlays, (overlay: any) => overlay.layer_type === 'pmtiles').map((overlay: any) => (
            <PMTilesLayer
              id={overlay.name}
              key={overlay.name}
              labelField={overlay.label_field}
              styles={overlay.styles}
              url={overlay.url}
            />
          ))}
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