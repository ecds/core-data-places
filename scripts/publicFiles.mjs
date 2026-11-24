/**
 * Files any website may load: the renderer's map styles (/styles/, e.g. the
 * Simple map) and its icon sprite with its credits (/sprites/). They are
 * public by design, and style editors such as Maputnik
 * (https://maplibre.org/maputnik) load a style from its address in the
 * browser, which needs CORS. Pages, API routes and everything else keep the
 * default (same origin only).
 */
const PUBLIC_PREFIXES = ['/styles/', '/sprites/'];

export const isPublicFile = (pathname) => PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
