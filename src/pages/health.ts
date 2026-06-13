import type { APIRoute } from 'astro';

/**
 * Liveness probe for the SSR runtime. Returns 200 without resolving an atlas or
 * calling the console (the middleware short-circuits `/health`), so a
 * load-balancer health check never couples renderer health to Core Data
 * availability.
 */
export const prerender = false;

export const GET: APIRoute = () => new Response('ok', {
  status: 200,
  headers: { 'content-type': 'text/plain; charset=utf-8' }
});
