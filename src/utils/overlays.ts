/**
 * Map overlays (`layers[]` with `overlay: true`): how opaque each one draws.
 *
 * A curator sets a layer's opacity in the console (`layers[].opacity`,
 * 0.2–1); a visitor can change it from the map's layers control. Unset, a
 * georeferenced map (Allmaps) draws at half opacity — what it always has, so
 * the modern map shows through — and every other overlay fully.
 */

export interface OverlayLayer {
  name: string;
  layer_type?: string;
  opacity?: number;
  [key: string]: any;
}

export const defaultOpacity = (layer: OverlayLayer): number => {
  if (typeof layer.opacity === 'number' && layer.opacity >= 0 && layer.opacity <= 1) {
    return layer.opacity;
  }

  return layer.layer_type === 'georeference' ? 0.5 : 1;
};

/**
 * The opacity to draw `layer` at: the visitor's choice when they've made
 * one, else the layer's own.
 */
export const opacityOf = (layer: OverlayLayer, chosen: Record<string, number> = {}): number => (
  typeof chosen[layer.name] === 'number' ? chosen[layer.name] : defaultOpacity(layer)
);

/**
 * True for the layer types whose opacity the map can change after they're
 * drawn (GeoJSON overlays keep their own styles).
 */
export const hasOpacity = (layer: OverlayLayer): boolean => (
  ['raster', 'georeference', 'image', 'pmtiles'].includes(layer.layer_type || '')
);
