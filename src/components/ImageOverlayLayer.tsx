import { useLoadedMap } from '@peripleo/maplibre';
import { useEffect } from 'react';

interface Props {
  /** The overlay's name: the source is `source-<name>`, the layer `layer-<name>`. */
  id: string;

  /** The image's address. */
  url: string;

  /**
   * Where its corners go: [top left, top right, bottom right, bottom left],
   * each [longitude, latitude] (a KML GroundOverlay's box or quad).
   */
  coordinates: [number, number][];

  opacity?: number;
}

/**
 * One image laid on the map by its four corners (MapLibre's image source): a
 * scanned map or plan from a KML/KMZ GroundOverlay, stored with the atlas's
 * images. Opacity changes are applied by OverlayOpacity.
 */
const ImageOverlayLayer = ({ coordinates, id, opacity, url }: Props) => {
  const map = useLoadedMap() as any;
  const corners = JSON.stringify(coordinates);

  useEffect(() => {
    if (!map || !url || coordinates?.length !== 4) return undefined;

    const source = `source-${id}`;
    const layer = `layer-${id}`;

    map.addSource(source, { type: 'image', url, coordinates });
    map.addLayer({ id: layer, type: 'raster', source, paint: { 'raster-opacity': opacity ?? 1, 'raster-fade-duration': 0 } });

    return () => {
      if (map.getLayer(layer)) map.removeLayer(layer);
      if (map.getSource(source)) map.removeSource(source);
    };
  }, [map, id, url, corners]);

  return null;
};

export default ImageOverlayLayer;
