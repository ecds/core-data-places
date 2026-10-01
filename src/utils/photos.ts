import { parameterize } from './exclusions';
import { isSafeUrl } from './htmlPolicy';

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
 * value isn't an http(s) image address.
 */
export const getPhotoUrl = (record: any, field: string | null | undefined): string | null => {
  if (!field || !record?.user_defined) {
    return null;
  }

  const key = parameterize(field);
  const entry = Object.entries(record.user_defined).find(([uuid, value]: [string, any]) => (
    uuid === field || value?.label === field || parameterize(value?.label) === key
  )) as [string, any] | undefined;

  const url = typeof entry?.[1]?.value === 'string' ? entry[1].value.trim() : '';

  return /^https?:\/\//i.test(url) && isSafeUrl(url, 'img') ? url : null;
};
