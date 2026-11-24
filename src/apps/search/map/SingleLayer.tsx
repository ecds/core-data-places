import ResultIcons from '@apps/search/map/ResultIcons';
import Tooltip from '@apps/search/map/Tooltip';
import { useSearchConfig } from '@apps/search/SearchConfigContext';
import { SearchResultsLayer } from '@performant-software/core-data';
import { Map as MapUtils, MapStyles } from '@performant-software/geospatial';
import { HoverTooltip } from '@peripleo/maplibre';
import { useRuntimeConfig } from '@peripleo/peripleo';
import { atlasTypeIcons, iconForTypes } from '@utils/typeIcons';
import { useMemo } from 'react';
import _ from 'underscore';

// Peripleo's id for the results' layers (layer-results-point) and source
// (source-results).
const LAYER_ID = 'results';

// The results' usual circle colour, for an icon given no colour.
const RESULT_COLOR = '#ff623b';

const HAS_ICON = ['has', 'og_icon'];

/**
 * The default result circle, transparent (and a little larger, as the
 * icon's click target) where ResultIcons draws an icon instead.
 */
const POINT_STYLE = {
  ...MapStyles.point,
  paint: {
    ...MapStyles.point.paint,
    'circle-radius': ['case', HAS_ICON, 9, MapStyles.point.paint['circle-radius']],
    'circle-opacity': ['case', HAS_ICON, 0, 1],
    'circle-stroke-opacity': ['case', HAS_ICON, 0, 1]
  }
};

const SingleLayer = (props) => {
  const config = useSearchConfig();
  const runtimeConfig = useRuntimeConfig();

  const typeIcons = useMemo(() => atlasTypeIcons(runtimeConfig), [runtimeConfig]);

  /**
   * Memo-izes the data to only include features that are visible, each with
   * the icon and colour for its types when the atlas sets icons by type.
   */
  const data = useMemo(() => MapUtils.toFeatureCollection(
    _.map(_.filter(props.data, (d) => d.properties.visible), (feature) => {
      const icon = iconForTypes(feature.properties.types, typeIcons);

      return icon
        ? { ...feature, properties: { ...feature.properties, og_icon: icon.icon, og_color: icon.color || RESULT_COLOR } }
        : feature;
    })
  ), [props.data, typeIcons]);

  return (
    <>
      <SearchResultsLayer
        data={data}
        cluster={!!config.map?.cluster_radius}
        clusterRadius={config.map?.cluster_radius}
        fitBoundingBox={false}
        interactive
        layerId={LAYER_ID}
        pointStyle={typeIcons ? POINT_STYLE : undefined}
      />
      { typeIcons && <ResultIcons layerId={LAYER_ID} /> }
      <HoverTooltip
        tooltip={({ hovered }) => (
          <Tooltip
            hovered={hovered}
          />
        )}
      />
    </>
  );
};

export default SingleLayer;
