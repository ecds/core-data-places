import { useMap } from '@peripleo/maplibre';
import { useEffect } from 'react';
import _ from 'underscore';

interface Props {
  /** The overlays drawn now, each with the opacity to draw it at. */
  overlays: { name: string, layer_type?: string, opacity: number }[];
}

/**
 * Applies each overlay's opacity to what's already on the map, as it changes:
 * a tiled (raster) overlay's and a KML image's layer (`layer-<name>`, raster
 * opacity) and a georeferenced map's (Allmaps' WarpedMapLayer, which takes
 * its opacity only when added). Runs again when the style changes, since a
 * layer can arrive after this mounts. PMTiles layers take theirs as a prop.
 */
const OverlayOpacity = ({ overlays }: Props) => {
  const map = useMap() as any;
  const key = JSON.stringify(_.map(overlays, (o) => [o.name, o.layer_type, o.opacity]));

  useEffect(() => {
    if (!map) return undefined;

    const apply = () => {
      _.each(overlays, (overlay) => {
        if (overlay.layer_type === 'georeference') {
          map.getLayer(overlay.name)?.implementation?.setOpacity?.(overlay.opacity);
        } else if (overlay.layer_type === 'raster' || overlay.layer_type === 'image') {
          const id = `layer-${overlay.name}`;
          if (map.getLayer(id) && map.getPaintProperty(id, 'raster-opacity') !== overlay.opacity) {
            map.setPaintProperty(id, 'raster-opacity', overlay.opacity);
          }
        }
      });
    };

    apply();
    map.on('styledata', apply);

    return () => {
      map.off('styledata', apply);
    };
  }, [map, key]);

  return null;
};

export default OverlayOpacity;
