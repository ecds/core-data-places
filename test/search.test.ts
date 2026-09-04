import {
  getFacetLabel,
  getHitValue,
  getRelatedItems,
  getRelationshipLabel,
  humanize,
  isInverse,
  isRelatedRecord,
  withGeometry
} from '@utils/search';
import { describe, expect, test } from 'vitest';

const UUID = '1c2e1456-c521-4951-8626-ec6847e4b49d';

/**
 * A translation function with the same contract as `useTranslations`: the value
 * for a known key, `undefined` otherwise.
 */
const translations = {
  [UUID]: 'County',
  [`${UUID}_inverse`]: 'Places in county',
  name: 'Name',
  facetLabel: '{{relationship}}: {{field}}',
  works: 'Bibliography'
};

const t = (key, values = {}) => {
  let value = translations[key];

  if (value) {
    Object.keys(values).forEach((k) => {
      value = value.replace(`{{${k}}}`, values[k]);
    });
  }

  return value;
};

describe('humanize', () => {
  test('name keys', () => {
    expect(humanize('types')).toBe('Types');
    expect(humanize('contained_in_place')).toBe('Contained In Place');
    expect(humanize('denomination_facet')).toBe('Denomination');
  });
});

describe('getFacetLabel', () => {
  test('UUID keys use the translation bundle', () => {
    expect(getFacetLabel(`${UUID}.name_facet`, t)).toBe('County');
    expect(getFacetLabel(`${UUID}.name_facet`, t, true)).toBe('Places in county');
    expect(getFacetLabel(`${UUID}.type_facet`, t)).toBe('County: Type');
  });

  test('untranslated UUID keys stay unlabeled', () => {
    expect(getFacetLabel('ffffffff-ffff-ffff-ffff-ffffffffffff.name_facet', t)).toBeUndefined();
  });

  test('name keys are humanized when untranslated', () => {
    expect(getFacetLabel('types', t)).toBe('Types');
    expect(getFacetLabel('denomination_facet', t)).toBe('Denomination');
    expect(getFacetLabel('contained_in_place.name', t)).toBe('Contained In Place');
    expect(getFacetLabel('administrative_area.name', t)).toBe('Administrative Area');
    expect(getFacetLabel('people.name.keyword', t)).toBe('People');
    expect(getFacetLabel('administrative_area.level', t)).toBe('Administrative Area: Level');
  });

  test('name keys prefer a translation', () => {
    expect(getFacetLabel('works', t)).toBe('Bibliography');
  });
});

describe('getRelationshipLabel', () => {
  test('both dialects', () => {
    expect(getRelationshipLabel(UUID, t)).toBe('County');
    expect(getRelationshipLabel(UUID, t, true)).toBe('Places in county');
    expect(getRelationshipLabel('contained_in_place', t)).toBe('Contained In Place');
    expect(getRelationshipLabel('works', t)).toBe('Bibliography');
  });
});

describe('related records', () => {
  const typesenseHit = {
    [UUID]: [{ uuid: 'a', name: 'Chatham', inverse: true }]
  };

  const v1Hit = {
    types: ['Church', 'Cemetery'],
    contained_in_place: { uuid: 'b', name: 'Chatham County', slug: 'chatham-county' },
    people: [{ uuid: 'c', name: 'Someone' }],
    denomination: { label: 'Denomination', value: 'Baptist' }
  };

  test('getRelatedItems normalizes single-valued relationships', () => {
    expect(getRelatedItems(v1Hit, 'contained_in_place')).toEqual([v1Hit.contained_in_place]);
    expect(getRelatedItems(v1Hit, 'people')).toEqual(v1Hit.people);
    expect(getRelatedItems(v1Hit, 'missing')).toEqual([]);
  });

  test('isRelatedRecord', () => {
    expect(isRelatedRecord(typesenseHit[UUID][0])).toBe(true);
    expect(isRelatedRecord(v1Hit.contained_in_place)).toBe(true);
    expect(isRelatedRecord('Church')).toBe(false);
    expect(isRelatedRecord(v1Hit.denomination)).toBe(false);
  });

  test('isInverse', () => {
    expect(isInverse(`${UUID}.name_facet`, [typesenseHit])).toBe(true);
    expect(isInverse('contained_in_place.name', [v1Hit])).toBe(false);
    expect(isInverse('types', [v1Hit])).toBe(false);
    expect(isInverse('denomination_facet', [v1Hit])).toBe(false);
    expect(isInverse('types', [])).toBe(false);
  });

  test('getHitValue unwraps v1 user-defined fields', () => {
    expect(getHitValue(v1Hit, { name: 'denomination' })).toBe('Baptist');
    expect(getHitValue(v1Hit, { name: 'contained_in_place.name' })).toBe('Chatham County');
    expect(getHitValue(v1Hit, { name: 'types' })).toEqual(['Church', 'Cemetery']);
  });
});

describe('withGeometry', () => {
  test('derives a Point from geo.point', () => {
    const hit = withGeometry({ uuid: 'a', geo: { point: { lat: 32.08, lon: -81.09 } } });
    expect(hit.geometry).toEqual({ type: 'Point', coordinates: [-81.09, 32.08] });
  });

  test('prefers geo.shape', () => {
    const shape = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
    expect(withGeometry({ geo: { shape, point: { lat: 0, lon: 0 } } }).geometry).toEqual(shape);
  });

  test('leaves an embedded geometry and geometry-less hits alone', () => {
    const geometry = { type: 'Point', coordinates: [1, 2] };
    expect(withGeometry({ geometry }).geometry).toBe(geometry);
    expect(withGeometry({ uuid: 'a' })).toEqual({ uuid: 'a' });
  });
});
