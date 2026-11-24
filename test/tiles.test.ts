import { describe, expect, it } from 'vitest';
import {
  absoluteTiles,
  parseTileProxyPath,
  proxiedTileJson,
  proxiedTileNames,
  tileUrlKind,
  vectorLayerIds
} from '../src/utils/tiles';
import { CLICKABLE_PLACE_LAYERS, clusteredPlacesStyles, DEFAULT_COLOR, defaultStyles, PLACE_LAYER_IDS, stylesForLayers, TILE_FILTERS, typeMatch, usesIcons } from '../src/utils/tileStyles';

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

  it('uses the default style for older features/labels tile sets and when unknown', () => {
    expect(stylesForLayers(['features', 'labels'], 'name')).toEqual(defaultStyles('name'));
    expect(stylesForLayers([], 'name')).toEqual(defaultStyles('name'));
  });

  it('draws any other single layer with the default look', () => {
    const styles = stylesForLayers(['churches'], 'title');

    expect(styles.every((style) => style['source-layer'] === 'churches')).toBe(true);
    expect(styles.find((style) => style.id === 'label')?.layout?.['text-field']).toEqual(['get', 'title']);
  });
});

describe('og_pmtiles styles', () => {
  const ids = (styles: any[]) => styles.map((style) => style.id);

  it('draws with fixed layer ids, the same for every atlas', () => {
    const styles = clusteredPlacesStyles('name', false, { Church: { icon: 'church' } });
    expect(ids(styles)).toEqual(expect.arrayContaining(Object.values(PLACE_LAYER_IDS)));
    expect(ids(styles).every((id) => id.startsWith('og-'))).toBe(true);
    expect(CLICKABLE_PLACE_LAYERS).toEqual(['og-places-point', 'og-places-icon', 'og-places-line', 'og-places-fill']);
  });

  it('draws the atlas\'s own lines and polygons, not the areas they sit in', () => {
    const styles = clusteredPlacesStyles('name');
    const byId = (id: string) => styles.find((style) => style.id === id) as any;

    expect(byId(PLACE_LAYER_IDS.line).filter).toEqual(TILE_FILTERS.line);
    expect(byId(PLACE_LAYER_IDS.fill).filter).toEqual(TILE_FILTERS.polygon);
    expect(JSON.stringify(TILE_FILTERS.line)).toContain('contained_in');
    expect(JSON.stringify(TILE_FILTERS.polygon)).toContain('contained_in');
  });

  it('keeps clusters out of the place points and labels', () => {
    const styles = clusteredPlacesStyles('name');
    const point = styles.find((style) => style.id === PLACE_LAYER_IDS.point) as any;
    const label = styles.find((style) => style.id === PLACE_LAYER_IDS.label) as any;

    expect(point.filter).toContainEqual(TILE_FILTERS.notCluster);
    expect(label.filter).toContainEqual(TILE_FILTERS.notCluster);
  });

  it('reads areas from their own layer when the tiles have one', () => {
    const together = stylesForLayers(['places'], 'name').find((style) => style.id === PLACE_LAYER_IDS.areaLine) as any;
    const separate = stylesForLayers(['places', 'areas'], 'name').find((style) => style.id === PLACE_LAYER_IDS.areaLine) as any;

    expect(together['source-layer']).toBe('places');
    expect(together.filter).toEqual(TILE_FILTERS.area);
    expect(separate['source-layer']).toBe('areas');
  });
});

describe('type icons', () => {
  const ICONS = { Church: { icon: 'church', color: '#1e40af' }, Park: { icon: 'tree' } };
  const styles = clusteredPlacesStyles('name', false, ICONS);
  const icon = styles.find((style) => style.id === PLACE_LAYER_IDS.icon) as any;
  const point = styles.find((style) => style.id === PLACE_LAYER_IDS.point) as any;

  it('matches a type by its quoted name in types, or a plain type', () => {
    expect(typeMatch('Park')).toEqual(['any', ['==', ['get', 'type'], 'Park'], ['in', '"Park"', ['coalesce', ['get', 'types'], '']]]);
  });

  it('draws typed places with the sprite\'s icons and the chosen colours, first listed type first', () => {
    expect(icon.layout['icon-image']).toEqual(['case', typeMatch('Church'), 'og:church', typeMatch('Park'), 'og:tree', 'og:marker']);
    expect(icon.paint['icon-color']).toEqual(['case', typeMatch('Church'), '#1e40af', typeMatch('Park'), DEFAULT_COLOR, DEFAULT_COLOR]);
    expect(usesIcons(styles)).toBe(true);
  });

  it('keeps clusters out of the icons, and typed places out of the circles', () => {
    expect(icon.filter[1]).toEqual(TILE_FILTERS.point);
    expect(point.filter).toEqual(['all', TILE_FILTERS.point, ['!', ['any', typeMatch('Church'), typeMatch('Park')]]]);
  });

  it('adds no icon layer without type icons', () => {
    expect(usesIcons(clusteredPlacesStyles('name'))).toBe(false);
    expect(usesIcons(stylesForLayers(['places'], 'name', { Church: { icon: '' } }))).toBe(false);
  });
});
