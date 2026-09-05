import { describe, expect, it } from 'vitest';
import { getExclusions, isExcluded, omitExcluded, parameterize } from '../src/utils/exclusions';

const LEGACY_ID = '1eb8861f-e8d2-4c62-a245-aef1d41358f8';
const WORDPRESS = 'b1c1e4db-4ba1-47e2-8186-9aa7dfb44c09';
const SHORT = '9529b5b5-698b-45e2-8ed8-467c13dc75cc';

const record = {
  name: 'Mizpah Presbyterian',
  description: '<p>…</p>',
  place_geometry: { geometry_json: { type: 'Point', coordinates: [0, 0] } },
  user_defined: {
    [LEGACY_ID]: { label: 'Legacy ID', type: 'Text', value: '1234' },
    [WORDPRESS]: { label: 'WordPress Link', type: 'Text', value: 'https://…' },
    [SHORT]: { label: 'Short Description', type: 'Text', value: 'A church.' }
  }
};

describe('parameterize', () => {
  it('keys a label the way the v1 index does', () => {
    expect(parameterize('WordPress Link')).toBe('wordpress_link');
    expect(parameterize(' Legacy-ID ')).toBe('legacy_id');
    expect(parameterize('')).toBe('');
  });
});

describe('getExclusions', () => {
  it('unions result_filtering and detail_pages lists', () => {
    const config = {
      result_filtering: { places: { exclude: [LEGACY_ID, 'place_layers'] } },
      detail_pages: { models: { places: { exclude: ['wordpress_link', LEGACY_ID] } } }
    };

    expect(getExclusions(config, 'places')).toEqual([LEGACY_ID, 'place_layers', 'wordpress_link']);
    expect(getExclusions(config, 'works')).toEqual([]);
    expect(getExclusions({}, 'places')).toEqual([]);
  });
});

describe('isExcluded', () => {
  it('matches a UDF by uuid, label or parameterized name', () => {
    expect(isExcluded([LEGACY_ID], LEGACY_ID, 'Legacy ID')).toBe(true);
    expect(isExcluded(['Legacy ID'], LEGACY_ID, 'Legacy ID')).toBe(true);
    expect(isExcluded(['legacy_id'], LEGACY_ID, 'Legacy ID')).toBe(true);
    expect(isExcluded(['legacy_id'], SHORT, 'Short Description')).toBe(false);
  });

  it('matches top-level attributes by key only', () => {
    expect(isExcluded(['description'], 'description')).toBe(true);
    expect(isExcluded(['Description'], 'description')).toBe(false);
    expect(isExcluded([], 'description')).toBe(false);
  });
});

describe('omitExcluded', () => {
  it('drops excluded attributes and user-defined fields', () => {
    const result = omitExcluded(record, ['legacy_id', 'WordPress Link', 'description']);

    expect(result.description).toBeUndefined();
    expect(result.place_geometry).toBeDefined();
    expect(Object.keys(result.user_defined)).toEqual([SHORT]);
  });

  it('is a no-op without exclusions or a record', () => {
    expect(omitExcluded(record, [])).toBe(record);
    expect(omitExcluded(null, ['x'])).toBeNull();
  });
});
