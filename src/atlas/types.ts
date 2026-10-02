import type { AtlasImages } from '@utils/images';

/**
 * The per-request atlas bundle: everything the shared dynamic renderer needs
 * to render one atlas, resolved by slug or by its own domain from the console
 * at request time.
 *
 * `config` is the config.json document (the same shape the old baked
 * public/config.json had); `branding` and `navigation` are the console-owned
 * chrome documents; `content` is the atlas's own pages (home page and
 * standalone pages such as About); `images` the sizes and web-sized copies of
 * its uploaded images (utils/images.ts). A bundle with `slug: null` is the fallback
 * used when no atlas resolves for a request (so the renderer degrades instead
 * of 500ing).
 */
export interface AtlasBundle {
  slug: string | null;
  /**
   * Served to a preview link: the atlas isn't published yet. Pages show a
   * preview notice and are never cached or indexed.
   */
  preview?: boolean;
  /**
   * No atlas at this address (unknown, or a draft without its preview
   * token): the renderer answers 404 rather than an empty atlas.
   */
  missing?: boolean;
  /**
   * The atlas's own domain, once connected (its DNS points at the atlas):
   * the platform address <slug>.<base domain> sends visitors there.
   */
  domain?: string | null;
  config: any;
  branding: any;
  navigation: any;
  /**
   * The menu in each of the atlas's languages (navigation is the default
   * language's).
   */
  navigations?: { [locale: string]: any } | null;
  content?: AtlasContent | null;
  images?: AtlasImages | null;
}

/**
 * A page section, as the console edits it (the engine's SiteContent).
 * Text (`body`) is Markdown.
 */
export interface AtlasSection {
  id?: string;
  type: 'hero' | 'text' | 'text_image' | 'call_to_action';
  title?: string;
  subtitle?: string;
  body?: string;
  image?: string;
  image_alt?: string;
  image_position?: 'left' | 'right';
  search?: boolean;
  search_placeholder?: string;
  button_text?: string;
  button_url?: string;
}

export interface AtlasPage {
  slug?: string;
  title?: string;
  description?: string;
  sections: AtlasSection[];
}

export interface AtlasContent {
  home?: AtlasPage | null;
  pages: AtlasPage[];
  /**
   * The pages in the atlas's other languages, same shape; a translated page
   * has the slug of one of `pages`. Untranslated ones show in the default
   * language.
   */
  translations?: { [locale: string]: { home?: AtlasPage | null; pages?: AtlasPage[] } } | null;
}
