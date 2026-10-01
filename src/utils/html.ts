import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import sanitize from 'sanitize-html';
import { ALLOWED_ATTRIBUTES, ALLOWED_TAGS } from './htmlPolicy';
import { imageAttributes, type ImageOptions } from './images';

export { resolveAssetPath } from './images';

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
 * from another origin, and `images` (the atlas bundle's) offers their
 * web-sized copies as a srcset (utils/images.ts).
 */

export type HtmlOptions = ImageOptions;

// How wide an image in page text can be laid out: the page container
// (components/Container.astro), whose text column tops out at 1280 px.
const TEXT_IMAGE_SIZES = '(min-width: 1536px) 1280px, 100vw';

// The image markup a page may carry, plus the srcset/sizes this module adds
// for uploaded images (only ever its own: see the img transform).
const SANITIZE_ATTRIBUTES = { ...ALLOWED_ATTRIBUTES, img: [...ALLOWED_ATTRIBUTES.img, 'srcset', 'sizes'] };

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
    allowedAttributes: SANITIZE_ATTRIBUTES,
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
      img: (tagName, attribs) => {
        // A srcset in the markup itself is dropped, as before; uploaded
        // images get one listing their copies.
        const { srcset, sizes, ...rest } = attribs;
        const image = imageAttributes(rest.src, TEXT_IMAGE_SIZES, options);
        const sized = image?.srcset
          ? { srcset: image.srcset, sizes: image.sizes!, width: String(image.width), height: String(image.height) }
          : {};

        return {
          tagName,
          attribs: {
            ...rest,
            ...sized,
            src: image?.src || '',
            loading: 'lazy'
          }
        };
      }
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
