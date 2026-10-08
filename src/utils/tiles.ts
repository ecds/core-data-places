/**
 * Vector tile overlays (layer_type "pmtiles"): where their tiles come from.
 *
 * An overlay's url is one of
 * - a .pmtiles archive, read with the pmtiles:// protocol;
 * - a TileJSON document (.json), such as the tile server ECDS runs for
 *   FairData (pmtiles.ecds.io: Protomaps' Lambda behind CloudFront);
 * - a {z}/{x}/{y} template.
 *
 * A tile server that only lets some websites load its tiles (CORS) can be
 * reached through the atlas's own address instead: /map-tiles/<name>.json,
 * proxied to OG_TILE_SERVER (pages/map-tiles/[...path].ts). Only tile sets an
 * atlas's own layers name are proxied for it.
 */

export const TILE_PROXY_PREFIX = '/map-tiles';

// A tile set's name on the tile server: the atlas's slug, for ECDS.
const TILE_NAME = /^[a-z0-9][a-z0-9-]{0,99}$/;

export type TileUrlKind = 'archive' | 'tilejson' | 'template';

/**
 * What kind of tile address an overlay's url is.
 *
 * @param url
 */
export const tileUrlKind = (url: string): TileUrlKind => {
  const path = url.split(/[?#]/)[0];

  if (path.endsWith('.pmtiles')) {
    return 'archive';
  }

  return path.endsWith('.json') ? 'tilejson' : 'template';
};

/**
 * A TileJSON's tile templates as absolute addresses, resolved against the
 * document's own address (the proxy answers with root-relative ones, so no
 * host from a request header is ever written into a cached response).
 * Braces stay literal: MapLibre fills in {z}/{x}/{y}.
 *
 * @param tiles
 * @param documentUrl
 */
export const absoluteTiles = (tiles: unknown, documentUrl: string): string[] => (
  (Array.isArray(tiles) ? tiles : [])
    .filter((tile): tile is string => typeof tile === 'string' && tile.length > 0)
    .map((tile) => decodeURI(new URL(tile, documentUrl).toString()))
);

/**
 * The vector layer names a TileJSON lists.
 *
 * @param doc
 */
export const vectorLayerIds = (doc: any): string[] => (
  (Array.isArray(doc?.vector_layers) ? doc.vector_layers : [])
    .map((layer: any) => layer?.id)
    .filter((id: unknown): id is string => typeof id === 'string')
);

export type TileProxyRequest =
  { kind: 'tilejson', name: string } |
  { kind: 'tile', name: string, z: number, x: number, y: number };

/**
 * Reads a proxy path (after /map-tiles/): "<name>.json" or
 * "<name>/<z>/<x>/<y>.mvt", with x and y inside zoom z's grid. Anything
 * else is null.
 *
 * @param path
 */
export const parseTileProxyPath = (path: string): TileProxyRequest | null => {
  const tilejson = path.match(/^([^/]+)\.json$/);

  if (tilejson) {
    return TILE_NAME.test(tilejson[1]) ? { kind: 'tilejson', name: tilejson[1] } : null;
  }

  const tile = path.match(/^([^/]+)\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})\.mvt$/);

  if (!tile || !TILE_NAME.test(tile[1])) {
    return null;
  }

  const [z, x, y] = [Number(tile[2]), Number(tile[3]), Number(tile[4])];
  const size = 2 ** z;

  return z <= 22 && x < size && y < size ? { kind: 'tile', name: tile[1], z, x, y } : null;
};

/**
 * The tile set names an atlas's layers load through the proxy
 * (url "/map-tiles/<name>.json"): the only ones it proxies for that atlas.
 *
 * @param config
 */
export const proxiedTileNames = (config: any): Set<string> => {
  const names = new Set<string>();

  (Array.isArray(config?.layers) ? config.layers : []).forEach((layer: any) => {
    const match = typeof layer?.url === 'string' && layer.url.match(/^\/map-tiles\/([^/?#]+)\.json$/);

    if (match && TILE_NAME.test(match[1])) {
      names.add(match[1]);
    }
  });

  return names;
};

/**
 * A tile server's TileJSON as the proxy serves it: the same document, its
 * tiles pointed at the proxy (root-relative; see absoluteTiles).
 *
 * @param doc
 * @param name
 */
export const proxiedTileJson = (doc: any, name: string) => ({
  ...doc,
  tiles: [`${TILE_PROXY_PREFIX}/${name}/{z}/{x}/{y}.mvt`]
});
