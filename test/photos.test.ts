import { describe, expect, it } from 'vitest';
import { getHitThumbnail, getPhotoField, getPhotoUrl } from '../src/utils/photos';

const PHOTO = 'https://tile.loc.gov/storage-services/service/pnp/habshaer/ga/ga0100/ga0141/photos/056098pv.jpg';

const record = {
  user_defined: {
    'f1e2d3c4-0000-4000-8000-000000000001': { label: 'Photo', type: 'String', value: ` ${PHOTO} ` },
    'f1e2d3c4-0000-4000-8000-000000000002': { label: 'LOC record', type: 'String', value: 'https://www.loc.gov/item/ga0141/' },
    'f1e2d3c4-0000-4000-8000-000000000003': { label: 'Bad', type: 'String', value: 'javascript:alert(1)' }
  }
};

describe('photos', () => {
  it('reads the photo field from the atlas config', () => {
    expect(getPhotoField({ detail_pages: { models: { places: { photo_field: 'photo' } } } }, 'places')).toBe('photo');
    expect(getPhotoField({}, 'places')).toBeNull();
  });

  it('finds the field by key, label or uuid', () => {
    expect(getPhotoUrl(record, 'photo')).toBe(PHOTO);
    expect(getPhotoUrl(record, 'Photo')).toBe(PHOTO);
    expect(getPhotoUrl(record, 'f1e2d3c4-0000-4000-8000-000000000001')).toBe(PHOTO);
  });

  it('resolves one of the atlas\'s own images (a KMZ\'s packed photo) against the console', () => {
    const packed = { user_defined: { u: { label: 'Photo', type: 'String', value: '/core_data/public/v1/assets/abc123/telfair.jpg' } } };
    expect(getPhotoUrl(packed, 'Photo', 'https://console.example.edu/')).toBe('https://console.example.edu/core_data/public/v1/assets/abc123/telfair.jpg');
    expect(getPhotoUrl(packed, 'Photo')).toBeNull();
    const other = { user_defined: { u: { label: 'Photo', type: 'String', value: '/elsewhere/telfair.jpg' } } };
    expect(getPhotoUrl(other, 'Photo', 'https://console.example.edu')).toBeNull();
  });

  it('gives nothing without a field, a value or a safe http(s) address', () => {
    expect(getPhotoUrl(record, null)).toBeNull();
    expect(getPhotoUrl(record, 'missing')).toBeNull();
    expect(getPhotoUrl(record, 'bad')).toBeNull();
    expect(getPhotoUrl({}, 'photo')).toBeNull();
  });
});

describe('getHitThumbnail', () => {
  const THUMB = 'https://iiif-cloud.ecds.io/public/resources/0b7c/thumbnail';

  it('reads the featured media thumbnail, single or listed', () => {
    expect(getHitThumbnail({ featured_media: { uuid: 'm1', thumbnail: THUMB } })).toBe(THUMB);
    expect(getHitThumbnail({ featured_media: [{ thumbnail: ` ${THUMB} ` }, { thumbnail: 'https://x.test/2' }] })).toBe(THUMB);
  });

  it('falls back to the first media item with a thumbnail', () => {
    expect(getHitThumbnail({ media: [{ uuid: 'a' }, { thumbnail: THUMB }] })).toBe(THUMB);
    expect(getHitThumbnail({ featured_media: { thumbnail: THUMB }, media: [{ thumbnail: 'https://x.test/other' }] })).toBe(THUMB);
  });

  it('is null without one, or for an address that is not http(s)', () => {
    expect(getHitThumbnail({})).toBeNull();
    expect(getHitThumbnail({ featured_media: { content_url: THUMB } })).toBeNull();
    expect(getHitThumbnail({ featured_media: { thumbnail: 'javascript:alert(1)' } })).toBeNull();
    expect(getHitThumbnail({ featured_media: { thumbnail: '//evil.test/x.jpg' } })).toBeNull();
  });
});
