/**
 * WordPress REST helper.
 *
 * Longform (standalone pages/essays + per-record detail content) comes from the
 * user's own WordPress, fetched via the public WP REST API
 * (`/wp-json/wp/v2/{pages|posts}`). WordPress is the user's instance, not part
 * of our tier; the atlas config carries the host
 * (`config.wordpress.host` site-wide, or `config.detail_pages.models.<m>.wordpress`
 * per detail model). This helper is the single fetch used by both the standalone
 * page route (Page.astro) and the detail-page integration (WordPressContent.astro).
 */

export interface WordPressDocument {
  title: string | null;
  content: string | null;
}

interface FetchArgs {
  host?: string | null;
  resource?: string;
  /** A numeric WordPress id, or a slug. */
  value?: string | number | null;
}

/**
 * Fetches a WordPress document by id (numeric) or slug and returns its rendered
 * title + content. Returns null for a missing host/value, a non-OK response, no
 * match, or any network error — callers degrade (404 / render nothing) rather
 * than fail the page. An unreachable WordPress never takes down the renderer.
 */
export const fetchWordPressDocument = async ({ host, resource = 'posts', value }: FetchArgs): Promise<WordPressDocument | null> => {
  const trimmedValue = value == null ? '' : `${value}`.trim();

  if (!host || !trimmedValue) {
    return null;
  }

  const base = host.replace(/\/$/, '');

  // Numeric values are treated as WordPress ids, anything else as a slug.
  const url = /^\d+$/.test(trimmedValue)
    ? `${base}/wp-json/wp/v2/${resource}/${trimmedValue}`
    : `${base}/wp-json/wp/v2/${resource}/?slug=${encodeURIComponent(trimmedValue)}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const post = Array.isArray(data) ? data[0] : data;

    if (!post) {
      return null;
    }

    return {
      title: post.title?.rendered ?? null,
      content: post.content?.rendered ?? null
    };
  } catch {
    return null;
  }
};
