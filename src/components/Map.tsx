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
  // only set by MapLibre's 'load' event, which never fires when the initial
  // render loop stalls (observed on cold loads: style metadata fetched, no
  // tile requests, blank canvas until a user gesture). The raw map instance
  // is available immediately, so we can watch style readiness ourselves.
  const map = useMap() as any;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!map || ready) return;

    let cancelled = false;

    const onReady = () => {
      if (cancelled) return;
      setReady(true);

      // Kick the render loop: a map whose 'load' never fired has not
      // requested tiles or painted; resize + repaint restarts it.
      map.resize?.();
      map.triggerRepaint?.();
    };

    if (typeof map.isStyleLoaded === 'function' && map.isStyleLoaded()) {
      onReady();
      return;
    }

    map.once?.('load', onReady);

    // Fallback poll: 'load'/'styledata' can be missed entirely when the
    // event fired before we attached, or never fires on a stalled loop.
    // Kick the render loop on every tick while waiting — a stalled map has
    // fetched style metadata but never requests tiles or paints.
    const interval = setInterval(() => {
      if (map.isStyleLoaded?.()) {
        clearInterval(interval);
        onReady();
      } else {
        map.resize?.();
        map.triggerRepaint?.();
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

interface Props {
  children: ReactNode,
  classNames?: {
    controls?: string
    root?: string,
  };
}

const Map = (props: Props) => {
  const config = useRuntimeConfig();
  const { baseLayers, dataLayers } = PeripleoUtils.filterLayers(config);

  const [baseLayer, setBaseLayer] = useState(_.first(baseLayers));
  const [overlays, setOverlays] = useState([]);

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
          { [...baseLayers, ...dataLayers].length > 1 && (
            <LayerMenu
              baseLayer={baseLayer?.name}
              baseLayers={baseLayers}
              baseLayersLabel={t('baseLayers')}
              className={buttonClass}
              dataLayers={dataLayers}
              onChangeBaseLayer={setBaseLayer}
              onChangeOverlays={setOverlays}
              overlaysLabel={t('overlays')}
            />
          )}
        </div>
        <WhenStyleLoaded>
          <OverlayLayers
            overlays={_.filter(overlays, (overlay: any) => overlay.layer_type !== 'pmtiles')}
          />
          { _.filter(overlays, (overlay: any) => overlay.layer_type === 'pmtiles').map((overlay: any) => (
            <PMTilesLayer
              id={overlay.name}
              key={overlay.name}
              labelField={overlay.label_field}
              styles={overlay.styles}
              url={overlay.url}
            />
          ))}
          { props.children }
        </WhenStyleLoaded>
      </PeripleoMap>
    </MapProvider>
  );
};

export default Map;