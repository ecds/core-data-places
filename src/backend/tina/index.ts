/**
 * Content backend — TinaCMS removed (migration step 3, "drop Tina").
 *
 * These functions used to read branding, navigation, i18n strings, and longform
 * (pages / posts / paths) from TinaCMS via a datalayer/MongoDB. That whole tier
 * is gone:
 *   - branding + navigation are console-owned and resolved per request from the
 *     atlas bundle (see @atlas/server); callers moved off these months-equivalent
 *     of work ago (Layout/Header/Footer).
 *   - i18n strings become console-owned (migration step 2).
 *   - standalone pages / posts / paths (longform) move to the user's WordPress,
 *     fetched via the WP REST API (migration step 2 — WordPressContent.astro is
 *     the existing pattern).
 *
 * Until step 2 wires those reads, every function returns an empty/`null` value
 * so the routes that still call them degrade (render nothing / 404) instead of
 * importing Tina (which hung the SSR runtime at startup). No `@tina/*` /
 * `tinacms` / `mongodb` imports remain anywhere in the app.
 */

export const fetchBranding = async (): Promise<any> => ({});

export const fetchNavbar = async (_language: string): Promise<any> => null;

export const fetchI18n = async (_language: string): Promise<any> => null;

export const fetchI18ns = async (): Promise<any[]> => [];

export const fetchPage = async (_locale: string, _slug: string): Promise<any> => null;

export const fetchPages = async (_locale: string, _params?: any): Promise<any[]> => [];

export const fetchPath = async (_slug: string): Promise<any> => null;

export const fetchPathResponse = async (_slug: string): Promise<any> => null;

export const fetchPaths = async (_params: any = {}): Promise<{ metadata: any; paths: any[] }> => ({
  metadata: null,
  paths: []
});

export const fetchPost = async (_slug: string): Promise<any> => null;

export const fetchPostResponse = async (_slug: string): Promise<any> => null;

export const fetchPosts = async (_params: any = {}): Promise<{ metadata: any; posts: any[] }> => ({
  metadata: null,
  posts: []
});
