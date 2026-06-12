import MapSearchContext, { LayerTypes } from '@apps/search/map/MapSearchContext';
import MultiLayer from '@apps/search/map/MultiLayer';
import SingleLayer from '@apps/search/map/SingleLayer';
import { useSearchConfig } from '@apps/search/SearchConfigContext';
import Map from '@components/Map';
import { useGeoSearch } from '@performant-software/core-data';
import { Map as MapUtils } from '@performant-software/geospatial';
import { useLoadedMap, useSelectionValue } from '@peripleo/maplibre';
import { useCurrentRoute, useNavigate } from '@peripleo/peripleo';
import { useContext, useEffect, useMemo, useRef } from 'react';
import _ from 'underscore';

/**
 * Auto-fits the map viewport to the current result set.
 *
 * This MUST render as a child of `<Map>`: `Map` wraps the `<PeripleoMap>` in its
 * own `<MapProvider>` (so multiple maps in a post body don't clobber each other's
 * context). `useLoadedMap()` only resolves the map instance for components rendered
 * *inside* that provider — calling it from `MapView` (above `<Map>`) always returns
 * null, so the fit never fired. Rendered here, inside `<Map>`'s `WhenStyleLoaded`
 * subtree, the map is both present and style-ready.
 */
const FitBounds = () => {
  const config = useSearchConfig();
  const { isRefinedWithMap } = useGeoSearch();
  const map = useLoadedMap();
  const route = useCurrentRoute();

  const { boundingBoxOptions, features } = useContext(MapSearchContext);

  /**
   * Suppress the auto-bounding box on the place detail page, when refining results by the
   * map viewport, or when 'zoom_to_place' is disabled.
   */
  const fitBoundingBox = useMemo(() => (
    !isRefinedWithMap() && route === '/' && config.map?.zoom_to_place
  ), [route, isRefinedWithMap()]);

  const fitScheduledRef = useRef(false);
  const fitTimerRef = useRef<ReturnType<typeof setTimeout>>();

  /**
   * Fit the viewport to the result set on initial load.
   *
   * We deliberately do NOT gate on `useSearching()` or debounce on every features
   * change: for large result sets the map streams hits in page-by-page, so `searching`
   * stays true throughout and features never stay still long enough for a debounce to
   * fire. Instead, the first time we have a map + a non-empty result set, we schedule a
   * single fit on a short fixed delay (enough for the first batches to land) and latch
   * it with a ref so later streaming updates neither reschedule nor cancel it.
   * `fitBoundingBox` still suppresses this on the detail route and once the user refines
   * the map viewport.
   *
   * We compute the bounding box here from the features rather than calling the context's
   * `getBoundingBox()`: that helper is defined in `MapSearchContextProvider` (above
   * `<Map>`'s own `MapProvider`), so its internal `useLoadedMap()` is null and it returns
   * a promise that never resolves. `FitBounds` runs inside the map context, so it has the
   * real map and can fit synchronously.
   */
  useEffect(() => {
    if (fitScheduledRef.current) {
      return;
    }

    if (!(fitBoundingBox && !_.isEmpty(features) && map)) {
      return;
    }

    fitScheduledRef.current = true;

    /**
     * If the user starts interacting with the map before the scheduled fit
     * fires, cancel it — a late auto-fit would yank the viewport out from
     * under them. Only user gestures count: programmatic moves (initial hash
     * restore, the fit itself) also emit dragstart/zoomstart but carry no
     * originalEvent.
     */
    const cancelFit = (e: any) => {
      if (e?.originalEvent && fitTimerRef.current) {
        clearTimeout(fitTimerRef.current);
        fitTimerRef.current = undefined;
        map.off('dragstart', cancelFit);
        map.off('zoomstart', cancelFit);
      }
    };

    map.on('dragstart', cancelFit);
    map.on('zoomstart', cancelFit);

    fitTimerRef.current = setTimeout(() => {
      const visible = _.filter(features, (f) => f?.properties?.visible);
      const data = _.isEmpty(visible) ? features : visible;

      const featureCollection = MapUtils.toFeatureCollection(data);
      const bbox = MapUtils.getBoundingBox(featureCollection);

      if (bbox && _.every(bbox, (n) => _.isNumber(n) && isFinite(n))) {
        map.fitBounds(bbox, boundingBoxOptions || { padding: 40, maxZoom: 15 });
      }
    }, 1500);
  }, [boundingBoxOptions, fitBoundingBox, features, map]);

  useEffect(() => () => {
    if (fitTimerRef.current) {
      clearTimeout(fitTimerRef.current);
    }
  }, []);

  return null;
};

const MapView = () => {
  const config = useSearchConfig();
  const navigate = useNavigate();
  const { selected } = useSelectionValue() || {};

  const {
    controlsClass,
    features,
    layerType
  } = useContext(MapSearchContext);

  /**
   * Navigate to the `/select` route when feature is selected.
   */
  useEffect(() => {
    if (selected) {
      navigate('/select');
    }
  }, [selected]);

  return (
    <Map
      classNames={{
        controls: controlsClass
      }}
    >
      <FitBounds />
      { layerType === LayerTypes.single && (
        <SingleLayer
          data={features}
        />
      )}
      { layerType === LayerTypes.multiple && (
        <MultiLayer
          data={features}
        />
      )}
    </Map>
  );
};

export default MapView;
