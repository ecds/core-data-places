import type { AtlasImages } from '@utils/images';

/**
 * The per-request atlas bundle: everything the shared dynamic renderer needs
 * to render one atlas, resolved by slug from the console at request time.
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
  config: any;
  branding: any;
  navigation: any;
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
}
