import _ from 'underscore';

/**
 * Field exclusions for detail pages and panels.
 *
 * A record from Core Data's public API carries every user-defined field the
 * curator entered — including bookkeeping like `Legacy ID`, `WordPress Link`
 * or `Slug` that was never meant for the public page. Which fields are
 * internal is an atlas decision, so it lives in the site config:
 *
 *   detail_pages.models.<model>.exclude: ['legacy_id', 'WordPress Link', '<udf uuid>']
 *
 * (`result_filtering.<model>.exclude`, core-data's original UUID-keyed list, is
 * honored too — both lists apply.) An entry may be a UDF uuid, the field's
 * label as the curator typed it, or its parameterized name — the same key the
 * v1 index uses (`legacy_id`), so the console can speak one language for
 * search and display. Top-level attributes (`description`, `place_geometry`,
 * `place_layers`, `relatedMedia`) and relationship uuids match by exact key
 * as before.
 */

/**
 * Parameterizes a label the way the v1 index keys it: `WordPress Link` → `wordpress_link`.
 *
 * @param value
 */
export const parameterize = (value: string) => (
  (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
);

/**
 * Returns the exclusion list for a model: the union of the legacy
 * `result_filtering` list and the `detail_pages` one.
 *
 * @param config
 * @param model
 */
export const getExclusions = (config: any, model: string): string[] => {
  const legacy = config?.result_filtering?.[model]?.exclude;
  const current = config?.detail_pages?.models?.[model]?.exclude;

  return _.uniq(_.compact([...(legacy || []), ...(current || [])].map((value) => `${value}`)));
};

/**
 * Returns true if the field identified by `key` (a uuid or attribute name)
 * with the optional `label` is excluded.
 *
 * @param excludes
 * @param key
 * @param label
 */
export const isExcluded = (excludes: string[], key: string, label?: string) => {
  if (_.isEmpty(excludes)) {
    return false;
  }

  if (excludes.includes(key)) {
    return true;
  }

  if (!label) {
    return false;
  }

  const names = [parameterize(label), parameterize(key)];

  return _.some(excludes, (value) => value === label || names.includes(parameterize(value)));
};

/**
 * Returns a copy of the record with excluded top-level attributes removed and
 * excluded user-defined fields (matched by uuid or label) dropped.
 *
 * @param record
 * @param excludes
 */
export const omitExcluded = (record: any, excludes: string[]) => {
  if (!record || _.isEmpty(excludes)) {
    return record;
  }

  const userDefined = _.isObject(record.user_defined)
    ? _.omit(record.user_defined, (field: any, uuid: string) => isExcluded(excludes, uuid, field?.label))
    : record.user_defined;

  return {
    ..._.omit(record, ...excludes),
    ...(userDefined !== undefined ? { user_defined: userDefined } : {})
  };
};
