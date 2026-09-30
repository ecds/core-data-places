import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import sanitize from 'sanitize-html';
import { ALLOWED_ATTRIBUTES, ALLOWED_TAGS } from './htmlPolicy';

/**
 * Turning curator text into HTML the renderer can put on a page.
 *
 * Every server-rendered `set:html` goes through `sanitizeHtml`: the console's
 * page text (Markdown, via `markdownToHtml`), WordPress bodies, and RichText
 * strings. One atlas owner must not be able to run script on their visitors'
 * pages, so markup is limited to text formatting, links, images and tables;
 * links and image sources to http(s)/mailto and site paths (htmlPolicy.ts).
 * HTML rendered by React components — Core Data rich-text fields, which also
 * render in the browser's map panel — goes through components/SafeHtml.tsx,
 * which applies the same policy on both sides.
 *
 * Uploaded images are stored as host-relative paths
 * (`/core_data/public/v1/assets/<key>/<file>`); `assetBase` (the console's
 * public URL) turns them into absolute URLs, since the renderer is served
 * from another origin.
 */

export interface HtmlOptions {
  /** The console's public URL, prefixed to `/core_data/...` image paths. */
  assetBase?: string | null;
}

/**
 * Resolves an image source for the page: an uploaded asset path gets the
 * console's origin; anything else is returned unchanged.
 */
export const resolveAssetPath = (src: string | null | undefined, assetBase?: string | null): string | undefined => {
  if (!src) {
    return undefined;
  }

  if (src.startsWith('/core_data/') && assetBase) {
    return `${assetBase.replace(/\/+$/, '')}${src}`;
  }

  return src;
};

/**
 * Returns `html` reduced to the formatting, link and image markup a page may
 * carry. External links open in a new tab without access to this page.
 */
export const sanitizeHtml = (html: string | null | undefined, options: HtmlOptions = {}): string => {
  if (!html) {
    return '';
  }

  return sanitize(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => {
        const { target, rel, ...rest } = attribs;
        const external = /^https?:\/\//i.test(rest.href || '');

        return {
          tagName,
          attribs: external ? { ...rest, target: '_blank', rel: 'noopener noreferrer' } : rest
        };
      },
      img: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          src: resolveAssetPath(attribs.src, options.assetBase) || '',
          loading: 'lazy'
        }
      })
    }
  });
};

/**
 * Converts a curator's Markdown (CommonMark + GitHub's tables, strikethrough
 * and autolinks) to sanitized HTML. Raw HTML in the Markdown is escaped, not
 * passed through.
 */
export const markdownToHtml = (markdown: string | null | undefined, options: HtmlOptions = {}): string => {
  if (!markdown) {
    return '';
  }

  const html = micromark(markdown, {
    allowDangerousHtml: false,
    extensions: [gfm()],
    htmlExtensions: [gfmHtml()]
  });

  return sanitizeHtml(html, options);
};
