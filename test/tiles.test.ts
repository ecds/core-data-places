import { describe, expect, it } from 'vitest';
import {
  absoluteTiles,
  parseTileProxyPath,
  proxiedTileJson,
  proxiedTileNames,
  tileUrlKind,
  vectorLayerIds
} from '../src/utils/tiles';
import { clusteredPlacesStyles, defaultStyles, stylesForLayers } from '../src/utils/tileStyles';

describe('tileUrlKind', () => {
  it('tells archives, TileJSON documents and templates apart', () => {
    expect(tileUrlKind('https://example.org/places.pmtiles')).toBe('archive');
    expect(tileUrlKind('https://pmtiles.ecds.io/historic-rural-churches-of-georgia.json')).toBe('tilejson');
    expect(tileUrlKind('https://atlas.example.org/map-tiles/hrcga.json?v=2')).toBe('tilejson');
    expect(tileUrlKind('https://example.org/tiles/{z}/{x}/{y}.pbf')).toBe('template');
  });
});

describe('absoluteTiles', () => {
  it('resolves root-relative tiles against the TileJSON, braces kept', () => {
    expect(absoluteTiles(['/map-tiles/hrcga/{z}/{x}/{y}.mvt'], 'https://hrcga.opengeographies.org/map-tiles/hrcga.json'))
      .toEqual(['https://hrcga.opengeographies.org/map-tiles/hrcga/{z}/{x}/{y}.mvt']);
  });

  it('keeps absolute tiles and drops anything that is not an address', () => {
    expect(absoluteTiles(['https://d3j4mgzjrheeg2.cloudfront.net/x/{z}/{x}/{y}.mvt', 7, ''], 'https://pmtiles.ecds.io/x.json'))
      .toEqual(['https://d3j4mgzjrheeg2.cloudfront.net/x/{z}/{x}/{y}.mvt']);
    expect(absoluteTiles(undefined, 'https://pmtiles.ecds.io/x.json')).toEqual([]);
  });
});

describe('parseTileProxyPath', () => {
  it('reads a TileJSON or a tile inside its zoom grid', () => {
    expect(parseTileProxyPath('historic-rural-churches-of-georgia.json')).toEqual({ kind: 'tilejson', name: 'historic-rural-churches-of-georgia' });
    expect(parseTileProxyPath('hrcga/6/17/25.mvt')).toEqual({ kind: 'tile', name: 'hrcga', z: 6, x: 17, y: 25 });
  });

  it('refuses other names, paths and tiles outside the grid', () => {
    ['../secret.json', 'Hrcga.json', 'a/b.json', 'hrcga/6/64/1.mvt', 'hrcga/23/0/0.mvt', 'hrcga/6/1/1.pbf', 'hrcga/x/1/1.mvt', '']
      .forEach((path) => expect(parseTileProxyPath(path)).toBeNull());
  });
});

describe('proxiedTileNames', () => {
  it('lists only the tile sets the atlas loads through the proxy', () => {
    const config = {
      layers: [
        { layer_type: 'pmtiles', url: '/map-tiles/historic-rural-churches-of-georgia.json' },
        { layer_type: 'pmtiles', url: 'https://pmtiles.ecds.io/other.json' },
        { layer_type: 'raster', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' },
        { layer_type: 'pmtiles', url: '/map-tiles/../etc.json' }
      ]
    };

    expect([...proxiedTileNames(config)]).toEqual(['historic-rural-churches-of-georgia']);
    expect(proxiedTileNames(null).size).toBe(0);
  });
});

describe('proxiedTileJson', () => {
  it('keeps the document and points its tiles at the proxy, root-relative', () => {
    const doc = { tilejson: '3.0.0', tiles: ['https://d3j4mgzjrheeg2.cloudfront.net/hrcga/{z}/{x}/{y}.mvt'], maxzoom: 8, vector_layers: [{ id: 'places' }] };

    expect(proxiedTileJson(doc, 'hrcga')).toEqual({ ...doc, tiles: ['/map-tiles/hrcga/{z}/{x}/{y}.mvt'] });
  });
});

describe('stylesForLayers', () => {
  it('uses the clustered places style for og_pmtiles tiles', () => {
    expect(vectorLayerIds({ vector_layers: [{ id: 'places' }] })).toEqual(['places']);
    expect(stylesForLayers(['places'], 'name')).toEqual(clusteredPlacesStyles('name'));
  });

  it('uses the default style for build:tiles output and when unknown', () => {
    expect(stylesForLayers(['features', 'labels'], 'name')).toEqual(defaultStyles('name'));
    expect(stylesForLayers([], 'name')).toEqual(defaultStyles('name'));
  });

  it('draws any other single layer with the default look', () => {
    const styles = stylesForLayers(['churches'], 'title');

    expect(styles.every((style) => style['source-layer'] === 'churches')).toBe(true);
    expect(styles.find((style) => style.id === 'label')?.layout?.['text-field']).toEqual(['get', 'title']);
  });
});
