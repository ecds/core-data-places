/**
 * Uploaded images at the size the page needs.
 *
 * A curator's images are stored as host-relative paths
 * (`/core_data/public/v1/assets/<key>/<file>`). For JPEG, PNG, WebP and AVIF
 * uploads the console also keeps web-sized copies (up to 2000 px wide), which
 * the atlas bundle lists by the original's key (`images`, the engine's
 * SiteImages). These helpers turn a stored path into what an <img> needs:
 * a srcset of the copies, their size (so the browser reserves the space), and
 * single URLs for places that take one (logo, favicon, share image).
 * Anything else — an SVG, an image hosted elsewhere, an upload made before
 * copies existed — is used as it is.
 */

export interface AtlasImageVariant {
  path: string;
  width: number;
  height: number;
}

export interface AtlasImage {
  width: number;
  height: number;
  /** Narrowest first. */
  variants: AtlasImageVariant[];
}

export type AtlasImages = Record<string, AtlasImage>;

export interface ImageOptions {
  /** The console's public URL, prefixed to `/core_data/...` image paths. */
  assetBase?: string | null;
  /** The atlas bundle's `images`. */
  images?: AtlasImages | null;
}

export interface ImageAttributes {
  src: string;
  srcset?: string;
  sizes?: string;
  width?: number;
  height?: number;
}

const ASSET_PATH = /^\/core_data\/public\/v1\/assets\/([^/?#]+)\//;

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
 * The recorded size and copies of an uploaded image, by its stored path (or
 * that path already prefixed with `assetBase`), if there are any.
 */
export const findImage = (src: string | null | undefined, options: ImageOptions = {}): AtlasImage | undefined => {
  if (!src || !options.images) {
    return undefined;
  }

  const base = (options.assetBase || '').replace(/\/+$/, '');
  const path = base && src.startsWith(`${base}/`) ? src.slice(base.length) : src;
  const key = ASSET_PATH.exec(path)?.[1];

  return key ? options.images[key] : undefined;
};

/**
 * Attributes for an <img> showing `src`: the copies as a srcset with
 * `sizes` (how wide the image is laid out), the largest copy's size, and the
 * copy closest to 1024 px as the plain src. Without copies, just the
 * resolved src (and the size when it's known).
 */
export const imageAttributes = (
  src: string | null | undefined,
  sizes: string,
  options: ImageOptions = {}
): ImageAttributes | undefined => {
  const resolved = resolveAssetPath(src, options.assetBase);

  if (!resolved) {
    return undefined;
  }

  const image = findImage(src, options);
  const variants = image?.variants || [];

  if (!variants.length) {
    return { src: resolved, width: image?.width, height: image?.height };
  }

  const largest = variants[variants.length - 1];
  const fallback = variants.find((variant) => variant.width >= 1024) || largest;

  return {
    src: resolveAssetPath(fallback.path, options.assetBase)!,
    srcset: variants.map((variant) => `${resolveAssetPath(variant.path, options.assetBase)} ${variant.width}w`).join(', '),
    sizes,
    width: largest.width,
    height: largest.height
  };
};

/**
 * One URL for `src`: the narrowest copy at least `width` px wide (the
 * largest copy when none is), or the resolved src when there are no copies.
 */
export const imageUrlAtWidth = (
  src: string | null | undefined,
  width: number,
  options: ImageOptions = {}
): string | undefined => {
  const variants = findImage(src, options)?.variants || [];
  const variant = variants.find((v) => v.width >= width) || variants[variants.length - 1];

  return resolveAssetPath(variant ? variant.path : src, options.assetBase);
};

/**
 * One URL for an image shown `height` px tall (a logo): a copy wide enough
 * for a 2x screen at that height.
 */
export const imageUrlAtHeight = (
  src: string | null | undefined,
  height: number,
  options: ImageOptions = {}
): string | undefined => {
  const image = findImage(src, options);

  if (!image) {
    return resolveAssetPath(src, options.assetBase);
  }

  return imageUrlAtWidth(src, Math.ceil((2 * height * image.width) / image.height), options);
};
