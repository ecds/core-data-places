import { FuzzyDate as FuzzyDateUtils } from '@performant-software/shared-components';
import _ from 'underscore';

const DEFAULT_JSON_FILENAME = 'search-results.json';
const MAX_ATTRIBUTES = 4;
export const INVERSE_SUFFIX = '_inverse';
const FACET_SUFFIX = '_facet';
const KEYWORD_SUFFIX = '.keyword';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Relationship/field keys come in two dialects. Typesense documents key
 * relationships and user-defined fields by UUID (`<uuid>.name_facet`), and every
 * label must come from the atlas i18n bundle. Open Geographies v1 documents key
 * them by parameterized name (`types`, `contained_in_place`, `denomination_facet`),
 * which is legible on its own — so a missing translation falls back to the
 * humanized key rather than an empty label.
 *
 * @param key
 */
export const isUuid = (key: string) => UUID_REGEX.test(key);

/**
 * Returns the relationship segment of a facet attribute (`<relationship>.<field>_facet`),
 * or an empty string for a top-level field.
 *
 * @param attribute
 */
export const getRelationshipId = (attribute: string) => (
  attribute && attribute.includes('.')
    ? attribute.replace(FACET_SUFFIX, '').substring(0, attribute.indexOf('.'))
    : ''
);

/**
 * Returns the field segment of a facet attribute, without the `_facet` suffix.
 *
 * @param attribute
 */
export const getFieldId = (attribute: string) => {
  if (!attribute) {
    return '';
  }

  const field = attribute.replaceAll(FACET_SUFFIX, '');

  return field.includes('.') ? field.substring(field.indexOf('.') + 1) : field;
};

/**
 * Turns a name key into a display label: `contained_in_place` → "Contained In Place".
 *
 * @param key
 */
export const humanize = (key: string) => (
  key
    .replace(new RegExp(`${FACET_SUFFIX}$`), '')
    .split(/[_\-\s]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
);

/**
 * Translates a relationship or field key, humanizing name keys that have no
 * translation. UUID keys keep their existing behavior (no translation, no label).
 *
 * @param key
 * @param t
 */
export const translateKey = (key: string, t: any) => {
  if (!key) {
    return undefined;
  }

  const translation = t(key);

  if (translation) {
    return translation;
  }

  return isUuid(key.replace(INVERSE_SUFFIX, '')) ? undefined : humanize(key);
};

/**
 * Adds a link to the document and downloads the passed file.
 *
 * @param file
 */
export const download = (file) => {
  const link = document.createElement('a');
  const url = URL.createObjectURL(file);

  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

/**
 * Exports the passed set of hits as a JSON file.
 *
 * @param hits
 * @param filename
 */
export const exportAsJSON = (hits, filename = DEFAULT_JSON_FILENAME) => {
  const file = new File([JSON.stringify(hits)], filename, { type: 'application/json' });

  download(file);
};

/**
 * Returns the attributes from the 'result_card' prop.
 *
 * @param config
 */
export const getAttributes = (config) => config.result_card.attributes?.slice(0, MAX_ATTRIBUTES) || [];

/**
 * Returns the facet label for the passed attribute.
 *
 * @param attribute
 * @param t
 * @param inverse
 */
export const getFacetLabel = (attribute, t, inverse = false, inverseSuffix = '_inverse') => {
  let value;
  
  // exclude these from facet labels, e.g. 'Organizations' rather than 'Organizations: Name'
  const DEFAULT_FIELD_IDS = ['name', 'names'];

  // an ES facet over an analyzed text field points at its `.keyword` multi-field
  const path = attribute.endsWith(KEYWORD_SUFFIX)
    ? attribute.slice(0, -KEYWORD_SUFFIX.length)
    : attribute;

  let relationshipId = getRelationshipId(path);
  const fieldId = getFieldId(path);

  if (relationshipId && inverse) {
    relationshipId = relationshipId + inverseSuffix;
  }

  if (relationshipId && fieldId && !DEFAULT_FIELD_IDS.includes(fieldId)) {
    value = t('facetLabel', { relationship: translateKey(relationshipId, t), field: translateKey(fieldId, t) })
  } else if (relationshipId) {
    value = translateKey(relationshipId, t);
  } else if (fieldId) {
    value = translateKey(fieldId, t);
  }

  return value;
};

/**
 * Get the label for a relationship key (UUID or parameterized name).
 * This is NOT meant for fields (e.g. '<uuid>.name'), only for top-level relationships.
 */
export const getRelationshipLabel = (key: string, t: any, inverse = false) => {
  let value = key;

  if (inverse) {
    value = `${key}${INVERSE_SUFFIX}`;
  }

  return translateKey(value, t);
};

/**
 * Returns the related record(s) stored on a hit under the passed relationship key,
 * always as an array. A single-valued relationship is a bare object rather than
 * a one-element array.
 *
 * @param hit
 * @param key
 */
export const getRelatedItems = (hit, key: string): any[] => {
  const value = hit?.[key];

  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === 'object') {
    return [value];
  }

  return [];
};

/**
 * Tests whether the passed relationship item is a related record (as opposed to
 * a scalar, a bare taxonomy term, or a `{ label, value }` user-defined field).
 *
 * @param item
 */
export const isRelatedRecord = (item) => (
  !!item && typeof item === 'object' && (item.inverse !== undefined || !!item.uuid)
);

/**
 * Tests whether the relationship at the passed attribute is the inverse side.
 * Only Typesense documents carry an `inverse` flag on related records; name-keyed
 * documents key each direction separately, so this is `false` for them.
 *
 * @param attribute
 * @param hits
 */
export const isInverse = (attribute: string, hits: any[]) => {
  if (hits.length === 0) {
    return false;
  }

  const attributeBase = attribute
    .split('.')[0]
    .replace(new RegExp(`${FACET_SUFFIX}$`), '');

  const sampleHit = _.find(hits, (hit) => (
    _.some(getRelatedItems(hit, attributeBase), (item) => item && typeof item === 'object')
  ));

  return !!(sampleHit && _.first(getRelatedItems(sampleHit, attributeBase))?.inverse);
}

/**
 * Gets the label for a search column as given by the result_card.attributes config array.
 */
export const getColumnLabel = (flattenedAtt, t) => {
  // remove the indices from the path
  const path = flattenedAtt
    .split('.')
    .filter(att => !isNumber(att))
    .join('.');

  return getFacetLabel(path, t);
};

/**
 * Returns the value at the passed path for the passed hit.
 *
 * @param hit
 * @param path
 * @param fuzzyDate
 */
export const getHitValue = (hit, attr) => {
  const { name, parser } = attr;
  let rawValue = _.get(hit, name.split('.'));

  // a v1 user-defined field is stored as `{ label, value }`; the label is resolved separately
  if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) && 'value' in rawValue && 'label' in rawValue) {
    rawValue = rawValue.value;
  }

  switch (parser) {
    case 'fuzzyDate':
      return FuzzyDateUtils.getDateView(rawValue);
    default:
      return rawValue;
  }
};

/**
 * Tests whether a string contains only integers.
 *
 * @param str
 */
const isNumber = (str: string) => /^\d+$/.test(str);

/**
 * Parses the JSON from the `properties` object as a work-around. See description below.
 *
 * @param feature
 */
export const parseFeature = (feature) => {
  if (!feature) {
    return null;
  }

  let properties = {};

  /**
   * This looks to be a known issue with `maplibre-gl-js`. The `properties` object is serialized into a string. As a
   * work-around, we'll check all of the keys and attempt to parse all of the strings into JSON.
   *
   * @see https://github.com/maplibre/maplibre-gl-js/issues/1325
   */
  for (const key in feature.properties) {
    let value = properties[key] = feature.properties[key];

    if (typeof feature.properties[key] === 'string') {
      try {
        value = JSON.parse(feature.properties[key] as string);
      } catch (e) {
        value = feature.properties[key];
      }
    }

    properties[key] = value;
  }

  return {
    ...feature,
    properties
  };
};

/**
 * Returns the passed hit with a GeoJSON geometry at `geometryPath`, deriving one
 * from the canonical `geo` envelope when the document carries none there.
 *
 * Typesense documents embed a GeoJSON `geometry`; Open Geographies v1 documents
 * carry `geo.point` (`{ lat, lon }`) and, for polygon extents, `geo.shape`
 * (GeoJSON). The map feature builder reads a GeoJSON geometry at the configured
 * path, so the v1 shape is adapted here rather than in the feature builder.
 *
 * @param hit
 * @param geometryPath
 */
export const withGeometry = (hit, geometryPath = 'geometry') => {
  if (!hit || _.get(hit, geometryPath.split('.'))) {
    return hit;
  }

  const shape = hit.geo?.shape;
  const point = hit.geo?.point;

  let geometry;

  if (shape?.type) {
    geometry = shape;
  } else if (point && _.isNumber(point.lon) && _.isNumber(point.lat)) {
    geometry = { type: 'Point', coordinates: [point.lon, point.lat] };
  }

  if (!geometry || geometryPath.includes('.')) {
    return hit;
  }

  return { ...hit, [geometryPath]: geometry };
};
