import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { atlasTypeIcons, iconForTypes } from '../src/utils/typeIcons';

const ICONS = { 'Methodist Church': { icon: 'church', color: '#1e40af' }, Cemetery: { icon: 'cemetery' } };

describe('atlasTypeIcons', () => {
  it('uses the atlas-wide setting first', () => {
    expect(atlasTypeIcons({ map: { type_icons: ICONS }, layers: [{ layer_type: 'pmtiles', type_icons: { X: { icon: 'tree' } } }] })).toEqual(ICONS);
  });

  it('falls back to a tile overlay\'s icons, and to none', () => {
    expect(atlasTypeIcons({ layers: [{ layer_type: 'raster' }, { layer_type: 'pmtiles', type_icons: ICONS }] })).toEqual(ICONS);
    expect(atlasTypeIcons({ layers: [{ layer_type: 'raster' }] })).toBeUndefined();
    expect(atlasTypeIcons({ map: { type_icons: {} } })).toBeUndefined();
  });
});

describe('iconForTypes', () => {
  it('picks the first listed type the place has', () => {
    expect(iconForTypes(['Cemetery', 'Methodist Church'], ICONS)).toEqual(ICONS['Methodist Church']);
    expect(iconForTypes(['Cemetery'], ICONS)).toEqual(ICONS.Cemetery);
  });

  it('gives none without a match, types or settings', () => {
    expect(iconForTypes(['Baptist Church'], ICONS)).toBeNull();
    expect(iconForTypes([], ICONS)).toBeNull();
    expect(iconForTypes(['Cemetery'], undefined)).toBeNull();
  });
});

describe('the simple base map', () => {
  const style = JSON.parse(fs.readFileSync('public/styles/simple.json', 'utf8'));
  const sourceLayers = style.layers.map((layer: any) => layer['source-layer']).filter(Boolean);

  it('draws no points of interest, place, road or water names, or house numbers', () => {
    for (const hidden of ['poi', 'place', 'transportation_name', 'water_name', 'housenumber', 'aerodrome_label', 'mountain_peak']) {
      expect(sourceLayers).not.toContain(hidden);
    }
    expect(style.layers.some((layer: any) => layer.type === 'symbol')).toBe(false);
  });

  it('serves fonts for the atlas\'s own labels and uses the free tiles', () => {
    expect(style.glyphs).toBe('https://glyphs.ecds.io/{fontstack}/{range}.pbf');
    expect(style.sources.openmaptiles.url).toBe('https://tiles.openfreemap.org/planet');
  });

  it('is the renderer\'s first default base map', async () => {
    const defaults = JSON.parse(fs.readFileSync('src/config.defaults.json', 'utf8'));
    expect(defaults.layers[0]).toEqual({ name: 'Simple map', layer_type: 'vector', url: '/styles/simple.json' });
  });
});
