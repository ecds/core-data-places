import { getAtlasConfig } from '@atlas/server';
import { parseTileProxyPath, proxiedTileJson, proxiedTileNames } from '@utils/tiles';
import type { APIRoute } from 'astro';

export const prerender = false;

const UPSTREAM_TIMEOUT = 10_000;

const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } });

/**
 * Vector tiles from OG_TILE_SERVER (ECDS: https://pmtiles.ecds.io), served
 * from the atlas's own address. That tile server only lets the websites on
 * its list load its tiles (CORS), and an atlas on its own domain isn't on
 * it; through here the browser never asks it.
 *
 *   /map-tiles/<name>.json            the TileJSON, its tiles pointed here
 *   /map-tiles/<name>/<z>/<x>/<y>.mvt one tile
 *
 * Only for tile sets this atlas's layers name ("/map-tiles/<name>.json"),
 * so the route can't relay the tile server's other sets. The upstream
 * address comes from the server's environment, never the request.
 */
export const GET: APIRoute = async ({ params }) => {
  const server = (process.env.OG_TILE_SERVER || '').replace(/\/+$/, '');
  const request = parseTileProxyPath(params.path || '');

  if (!server || !request || !proxiedTileNames(getAtlasConfig()).has(request.name)) {
    return notFound();
  }

  const upstream = request.kind === 'tilejson'
    ? `${server}/${request.name}.json`
    : `${server}/${request.name}/${request.z}/${request.x}/${request.y}.mvt`;

  let response: Response;

  try {
    response = await fetch(upstream, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT) });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[map-tiles] tile server unreachable:', error instanceof Error ? error.message : error);
    return new Response('Bad gateway', { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }

  if (response.status === 404) {
    return notFound();
  }

  if (request.kind === 'tilejson') {
    if (!response.ok) {
      return new Response('Bad gateway', { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }

    return new Response(JSON.stringify(proxiedTileJson(await response.json(), request.name)), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }
    });
  }

  // No tile there (outside the set's area or zooms).
  if (response.status === 204) {
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'public, max-age=86400' } });
  }

  if (!response.ok) {
    return new Response(null, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }

  return new Response(await response.arrayBuffer(), {
    headers: { 'Content-Type': 'application/vnd.mapbox-vector-tile', 'Cache-Control': 'public, max-age=86400' }
  });
};
