import {
  getConfiguredFacetLabel,
  getFacetLabel,
  getHitValue,
  getRelatedItems,
  getRelationshipLabel,
  humanize,
  isInverse,
  isRelatedRecord,
  featureId,
  withFeatureIds,
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

describe('getConfiguredFacetLabel', () => {
  const searchConfig = {
    facets: [
      { name: 'types', type: 'list', label: ' Building types ' },
      { name: 'architect_facet', type: 'list', label: '' },
      { name: 'denomination', type: 'list' }
    ]
  };

  test('returns the label the atlas gave a filter, trimmed', () => {
    expect(getConfiguredFacetLabel(searchConfig, 'types')).toBe('Building types');
  });

  test('matches a facet over a .keyword multi-field by its name', () => {
    expect(getConfiguredFacetLabel({ facets: [{ name: 'denomination', label: 'Faith' }] }, 'denomination.keyword')).toBe('Faith');
  });

  test('falls back (undefined) for blank, missing or unknown labels', () => {
    expect(getConfiguredFacetLabel(searchConfig, 'architect_facet')).toBeUndefined();
    expect(getConfiguredFacetLabel(searchConfig, 'denomination')).toBeUndefined();
    expect(getConfiguredFacetLabel(searchConfig, 'nope')).toBeUndefined();
    expect(getConfiguredFacetLabel(undefined, 'types')).toBeUndefined();
  });
});

describe('featureId', () => {
  test('a UUID that starts with a letter still gets an integer id', () => {
    // parseInt('af219adc-…', 10) is NaN: MapLibre drops the id and hover never finds the point.
    const id = featureId('af219adc-aef5-4326-8cc7-0aa0b1b56319');
    expect(Number.isSafeInteger(id)).toBe(true);
    expect(id).toBe(parseInt('af219adcaef5', 16));
  });

  test('UUIDs that parseInt would collapse to the same number stay distinct', () => {
    // parseInt gives 4 for both.
    expect(featureId('4f8e6c3b-7474-4486-a93f-a44aef82c367')).not.toBe(featureId('4a1b2c3d-0000-4000-8000-000000000000'));
  });

  test('stable for a UUID, undefined for anything else', () => {
    const uuid = '1774167e-737e-4442-ba09-713f6a000261';
    expect(featureId(uuid)).toBe(featureId(uuid));
    expect(featureId(undefined)).toBeUndefined();
    expect(featureId('not-a-uuid')).toBeUndefined();
  });
});

describe('withFeatureIds', () => {
  test('sets each feature id from its UUID and keeps the rest', () => {
    const features = [
      { type: 'Feature', id: NaN, properties: { uuid: 'd46c7a8f-d161-4f62-8ad9-b36ccfa9349c', name: 'New Hebron Baptist' }, geometry: null },
      { type: 'Feature', id: 7, properties: { name: 'no uuid' }, geometry: null }
    ];
    const [first, second] = withFeatureIds(features);
    expect(first.id).toBe(parseInt('d46c7a8fd161', 16));
    expect(first.properties.name).toBe('New Hebron Baptist');
    expect(second).toBe(features[1]);
  });
});

