import { useLoadedMap } from '@peripleo/maplibre';
import { ensureSprite } from '@utils/sprite';
import { SPRITE_ID } from '@utils/tileStyles';
import { useEffect } from 'react';

// The search results' icon layer, the same in every atlas.
export const RESULT_ICON_LAYER = 'og-results-icon';

// Peripleo's colour for a hovered result, as on its circles.
const HOVER_COLOR = '#3b62ff';

interface Props {
  /** The id given to the results' SearchResultsLayer (Peripleo's layer id). */
  layerId: string;
}

/**
 * Draws search results that have an icon for their type (`og_icon`, set by
 * SingleLayer from the atlas's type icons) as that icon in its colour,
 * reading Peripleo's own results source. Peripleo's circle stays underneath,
 * transparent for these results, so clicking, hovering and selecting work
 * exactly as before; clusters and results without an icon stay circles.
 */
const ResultIcons = ({ layerId }: Props) => {
  const map = useLoadedMap() as any;

  useEffect(() => {
    if (!map) return undefined;

    const sourceId = `source-${layerId}`;

    const add = () => {
      if (!map.getSource(sourceId)) return;

      ensureSprite(map);

      if (!map.getLayer(RESULT_ICON_LAYER)) {
        map.addLayer({
          id: RESULT_ICON_LAYER,
          type: 'symbol',
          source: sourceId,
          filter: ['all', ['==', ['geometry-type'], 'Point'], ['has', 'og_icon'], ['!', ['has', 'point_count']]],
          layout: {
            'icon-image': ['concat', `${SPRITE_ID}:`, ['get', 'og_icon']],
            'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.9, 12, 1.4],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true
          },
          paint: {
            'icon-color': ['case', ['boolean', ['feature-state', 'hover'], false], HOVER_COLOR, ['get', 'og_color']],
            'icon-halo-color': '#ffffff',
            'icon-halo-width': 1
          }
        });
      }

      // Above Peripleo's circles, which it moves to the top once added. Only
      // when not already on top, so this doesn't feed its own styledata.
      const order: string[] = map.getLayersOrder?.() || [];
      if (order.length && order[order.length - 1] !== RESULT_ICON_LAYER) {
        map.moveLayer(RESULT_ICON_LAYER);
      }
    };

    add();
    map.on('styledata', add);

    return () => {
      map.off('styledata', add);

      try {
        if (map.getLayer(RESULT_ICON_LAYER)) map.removeLayer(RESULT_ICON_LAYER);
      } catch {
        // The map may already be gone.
      }
    };
  }, [map, layerId]);

  return null;
};

export default ResultIcons;
