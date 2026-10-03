import { describe, expect, test } from 'vitest';
import { defaultOpacity, hasOpacity, opacityOf } from '../src/utils/overlays';

describe('overlay opacity', () => {
  test('a curator-set opacity wins; unset, a georeferenced map draws at half, others fully', () => {
    expect(defaultOpacity({ name: 'a', layer_type: 'raster', opacity: 0.6 })).toBe(0.6);
    expect(defaultOpacity({ name: 'a', layer_type: 'georeference' })).toBe(0.5);
    expect(defaultOpacity({ name: 'a', layer_type: 'raster' })).toBe(1);
    expect(defaultOpacity({ name: 'a', layer_type: 'image' })).toBe(1);
    expect(defaultOpacity({ name: 'a', layer_type: 'raster', opacity: 7 })).toBe(1);
  });

  test('the visitor\'s choice wins over the layer\'s own, including fully transparent', () => {
    const layer = { name: 'Sanborn 1911', layer_type: 'georeference', opacity: 0.8 };
    expect(opacityOf(layer, {})).toBe(0.8);
    expect(opacityOf(layer, { 'Sanborn 1911': 0.3 })).toBe(0.3);
    expect(opacityOf(layer, { 'Sanborn 1911': 0 })).toBe(0);
    expect(opacityOf(layer, { Other: 0.1 })).toBe(0.8);
  });

  test('GeoJSON overlays keep their own styles', () => {
    expect(hasOpacity({ name: 'a', layer_type: 'geojson' })).toBe(false);
    expect(['raster', 'georeference', 'image', 'pmtiles'].every((layer_type) => hasOpacity({ name: 'a', layer_type }))).toBe(true);
  });
});
