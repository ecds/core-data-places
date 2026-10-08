import _ from 'underscore';
import { parameterize } from './exclusions';
import { isSafeUrl } from './htmlPolicy';
import { resolveAssetPath } from './images';

// One of the atlas's own uploaded images (a photo packed in a KMZ, stored
// at import), kept as a console path.
const ASSET_PATH = /^\/core_data\/public\/v1\/assets\/[^/?#]+\//;

/**
 * A place's photo from one of its own fields.
 *
 * An upload's Photo column (a column of image addresses, e.g. the Library of
 * Congress's copy of a survey photograph) is stored as a field on each place,
 * and the atlas config names that field:
 *
 *   detail_pages.models.<model>.photo_field: 'photo'
 *
 * (a field uuid, its label, or its parameterized name, like `exclude`). The
 * detail page and the map panel show it where they'd show a media item's
 * image when the record has no media of its own; the field itself is hidden
 * from the field list so the address isn't shown twice.
 */

export const getPhotoField = (config: any, model: string): string | null => (
  config?.detail_pages?.models?.[model]?.photo_field || null
);

/**
 * The record's photo address from `field`, or null when it has none or the
 * value isn't an http(s) image address — or one of the atlas's own images,
 * resolved against `assetBase` (the console's address).
 */
export const getPhotoUrl = (record: any, field: string | null | undefined, assetBase?: string | null): string | null => {
  if (!field || !record?.user_defined) {
    return null;
  }

  const key = parameterize(field);
  const entry = Object.entries(record.user_defined).find(([uuid, value]: [string, any]) => (
    uuid === field || value?.label === field || parameterize(value?.label) === key
  )) as [string, any] | undefined;

  const value = typeof entry?.[1]?.value === 'string' ? entry[1].value.trim() : '';
  const url = ASSET_PATH.test(value) && assetBase ? resolveAssetPath(value, assetBase) || '' : value;

  return /^https?:\/\//i.test(url) && isSafeUrl(url, 'img') ? url : null;
};

// An IIIF Cloud sized copy: /public/resources/<uuid>/thumbnail or /preview.
const IIIF_SIZED = /^(https?:\/\/[^?#]+\/public\/resources\/[^/?#]+)\/(?:thumbnail|preview)(?=$|[?#])/i;

/**
 * The original of an IIIF Cloud sized copy, to show when the copy fails to
 * load: the image server won't enlarge, so a photo smaller than the size
 * asked for (250 px for a thumbnail, 500 px for a preview) has no copy at
 * all, and a photo uploaded seconds ago has none yet. Null for any other
 * address.
 */
export const getIiifOriginal = (url?: string | null): string | null => {
  const match = typeof url === 'string' ? url.match(IIIF_SIZED) : null;
  return match ? `${match[1]}/inline` : null;
};

const first = (value: any) => (Array.isArray(value) ? value[0] : value);

const thumbnailOf = (media: any): string | null => {
  const url = typeof media?.thumbnail === 'string' ? media.thumbnail.trim() : '';
  return /^https?:\/\//i.test(url) && isSafeUrl(url, 'img') ? url : null;
};

/**
 * A search hit's thumbnail: its featured media's IIIF thumbnail
 * (`featured_media.thumbnail` — a place's photo copied onto the atlas's
 * image server, or media a curator ticked "featured"), else its first
 * media item's, or null.
 *
 * The fallback is needed today: the indexer keys the canonical Media
 * relationship's featured item as `medium` (the relationship name,
 * singularized) rather than the mapping's `featured_media`.
 */
export const getHitThumbnail = (hit: any): string | null => (
  thumbnailOf(first(hit?.featured_media)) ||
  thumbnailOf(_.find(Array.isArray(hit?.media) ? hit.media : [hit?.media], thumbnailOf))
);
