import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import sanitize from 'sanitize-html';

/**
 * Turning curator text into HTML the renderer can put on a page.
 *
 * Every server-rendered `set:html` goes through `sanitizeHtml`: the console's
 * page text (Markdown, via `markdownToHtml`), WordPress bodies, and RichText
 * strings. One atlas owner must not be able to run script on their visitors'
 * pages, so markup is limited to text formatting, links, images and tables;
 * links and image sources to http(s)/mailto and site paths. (Still raw: Core
 * Data rich-text field values in UserDefinedFieldView, which also renders in
 * the browser's map panel.)
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

const ALLOWED_TAGS = [
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'cite', 'code', 'del', 'div', 'em',
  'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li',
  'ol', 'p', 'pre', 's', 'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td',
  'tfoot', 'th', 'thead', 'tr', 'u', 'ul'
];

const ALLOWED_ATTRIBUTES: sanitize.IOptions['allowedAttributes'] = {
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
  td: ['align', 'colspan', 'rowspan'],
  th: ['align', 'colspan', 'rowspan', 'scope'],
  ol: ['start'],
  '*': ['id']
};

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
