/**
 * The per-request atlas bundle: everything the shared dynamic renderer needs
 * to render one atlas, resolved by slug from the console at request time.
 *
 * `config` is the config.json document (the same shape the old baked
 * public/config.json had); `branding` and `navigation` are the console-owned
 * chrome documents. A bundle with `slug: null` is the fallback used when no
 * atlas resolves for a request (so the renderer degrades instead of 500ing).
 */
export interface AtlasBundle {
  slug: string | null;
  config: any;
  branding: any;
  navigation: any;
}
