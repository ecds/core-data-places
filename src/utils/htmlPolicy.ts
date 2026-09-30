/**
 * What tenant-supplied HTML may contain, shared by the server-side sanitizer
 * (utils/html.ts, sanitize-html) and the isomorphic React renderer
 * (components/SafeHtml.tsx): text formatting, links, images and tables; links
 * to http(s)/mailto and site paths, images from http(s) and site paths.
 */

export const ALLOWED_TAGS = [
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'cite', 'code', 'del', 'div', 'em',
  'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li',
  'ol', 'p', 'pre', 's', 'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td',
  'tfoot', 'th', 'thead', 'tr', 'u', 'ul'
];

export const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
  td: ['align', 'colspan', 'rowspan'],
  th: ['align', 'colspan', 'rowspan', 'scope'],
  ol: ['start'],
  '*': ['id']
};

const LINK_SCHEMES = ['http:', 'https:', 'mailto:'];
const IMAGE_SCHEMES = ['http:', 'https:'];

/**
 * True when `url` is safe as a link (`a`) or image source (`img`): an allowed
 * scheme, or a site-relative address. Whitespace and control characters are
 * ignored when reading the scheme (browsers ignore them too, which is how
 * "java\tscript:" gets through naive checks), and protocol-relative
 * addresses ("//host", "/\host") are refused like in the server sanitizer.
 */
export const isSafeUrl = (url: string | null | undefined, tag: 'a' | 'img'): boolean => {
  if (url == null) {
    return false;
  }

  const normalized = url.replace(/[\u0000- \u007f]/g, '').replace(/\\/g, '/').toLowerCase();

  if (normalized.startsWith('//')) {
    return false;
  }

  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(normalized)?.[1];

  if (scheme) {
    return (tag === 'img' ? IMAGE_SCHEMES : LINK_SCHEMES).includes(`${scheme}:`);
  }

  return true;
};
