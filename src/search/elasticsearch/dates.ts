import _ from 'underscore';

/**
 * Time on the Elasticsearch path.
 *
 * A search names the field that places its records in time —
 * `search[].dates = { field, label?, timeline? }`, written by the console —
 * and the rest follows from that one setting: a year-range filter, a date
 * sort, the timeline view and dates on the hits it draws.
 *
 * The years are computed at search time (Elasticsearch runtime fields over
 * `_source`), not read from the mapping. The indexer stores a date as Core Data
 * holds it — a fuzzy date object, an ISO day, a year number, or older partial
 * text such as "1983-03-" — under `<field>.value`, with no derived year fields,
 * and how that value is mapped depends on the index (and may not be mapped at
 * all). Reading `_source` works the same whatever the mapping says, so it
 * needs nothing from the indexer. The script is a constant; the field name
 * travels as a script parameter, never inside the source.
 */

/** The filter's attribute: the URL key (`?years=1900:1950`) and facet name. */
export const YEARS_ATTRIBUTE = 'years';

/** Runtime fields: every year a record covers (≤ 100 values), its first and last year. */
export const YEARS_FIELD = 'og_years';
export const YEAR_START_FIELD = 'og_year_start';
export const YEAR_END_FIELD = 'og_year_end';

export const DATE_SORTS = ['date_asc', 'date_desc'];

const RUNTIME_FIELDS = [YEARS_FIELD, YEAR_START_FIELD, YEAR_END_FIELD];

/** A top-level document key, as the indexer writes a field's parameterized name. */
const FIELD_PATTERN = /^[a-z0-9_]+$/;

/**
 * Painless. `year` reads the year off whatever a date value is: a number is a
 * year; an ISO timestamp (Core Data's own form saves a day as local midnight in
 * UTC) is rounded to the nearest day first, so 1983-01-01T05:00Z and
 * 1982-12-31T23:00Z are both 1983; otherwise the leading digits ("1983-03-15",
 * "1983-03-", "1890"). Text that doesn't start with a year ("c. 1890") has
 * none — the upload turns those into fuzzy dates.
 *
 * Elasticsearch caps a runtime field at 100 values per document, so a span over
 * 99 years is sampled for `og_years` (first and last year always included);
 * the filter itself uses the exact first/last years.
 */
const YEARS_SCRIPT = `
int year(def x) {
  if (x == null) { return Integer.MIN_VALUE; }
  if (x instanceof Number) { return ((Number) x).intValue(); }
  String s = x.toString().trim();
  if (s.length() > 10 && s.charAt(10) == (char) 'T') {
    return ZonedDateTime.parse(s).plusHours(12).getYear();
  }
  int i = 0;
  boolean negative = false;
  if (s.length() > 0 && s.charAt(0) == (char) '-') { negative = true; i = 1; }
  int y = 0;
  int digits = 0;
  while (i < s.length() && digits < 6 && Character.isDigit(s.charAt(i))) {
    y = y * 10 + (s.charAt(i) - (char) '0');
    i++;
    digits++;
  }
  if (digits == 0) { return Integer.MIN_VALUE; }
  return negative ? -y : y;
}

def field = params._source[params.field];
if (field == null) { return; }
def value = (field instanceof Map && field.containsKey('value')) ? field.get('value') : field;
if (value == null) { return; }
List values = value instanceof List ? (List) value : [value];
int lo = Integer.MAX_VALUE;
int hi = Integer.MIN_VALUE;
for (def item : values) {
  int s;
  int e;
  if (item instanceof Map) {
    s = year(item.get('start_date'));
    e = year(item.get('end_date'));
    if (s == Integer.MIN_VALUE) { s = e; }
    if (e == Integer.MIN_VALUE) { e = s; }
  } else {
    s = year(item);
    e = s;
  }
  if (s == Integer.MIN_VALUE) { continue; }
  if (e < s) { e = s; }
  if (s < lo) { lo = s; }
  if (e > hi) { hi = e; }
}
if (lo == Integer.MAX_VALUE) { return; }
if (params.part == 'start') { emit(lo); return; }
if (params.part == 'end') { emit(hi); return; }
int step = hi - lo < 99 ? 1 : (hi - lo + 98) / 98;
for (int y = lo; y < hi; y += step) { emit(y); }
emit(hi);
`;

/**
 * The search's date field, when it names one that can be a document key.
 *
 * @param search
 */
export const getDateField = (search: any): string | null => {
  const field = search?.dates?.field;
  return typeof field === 'string' && FIELD_PATTERN.test(field) ? field : null;
};

/**
 * The search entry with its `dates` setting spelled out the way the rest of the
 * renderer reads a search: the year range as a long-form numeric facet
 * attribute and a `range` facet (first, unless the curator placed it), the
 * date sorts, and `timeline.date_range_facet` when the timeline is on. A search
 * without a usable date field comes back unchanged.
 *
 * @param search
 */
export const expandDates = (search: any) => {
  if (!getDateField(search)) {
    return search;
  }

  const elasticsearch = search.elasticsearch || {};
  const facetAttributes = elasticsearch.facet_attributes || [];
  const facets = search.facets || [];
  const sorts = elasticsearch.sort_attributes || [];

  const hasAttribute = _.some(facetAttributes, (facet: any) => (typeof facet === 'string' ? facet : facet?.attribute) === YEARS_ATTRIBUTE);

  return {
    ...search,
    elasticsearch: {
      ...elasticsearch,
      facet_attributes: hasAttribute
        ? facetAttributes
        : [{ attribute: YEARS_ATTRIBUTE, field: YEARS_FIELD, type: 'numeric' }, ...facetAttributes],
      sort_attributes: [
        ...sorts,
        ...[
          { name: 'date_asc', field: YEAR_START_FIELD, order: 'asc' },
          { name: 'date_desc', field: YEAR_END_FIELD, order: 'desc' }
        ].filter((sort) => !_.findWhere(sorts, { name: sort.name }))
      ]
    },
    facets: _.findWhere(facets, { name: YEARS_ATTRIBUTE })
      ? facets
      : [{ name: YEARS_ATTRIBUTE, type: 'range', label: search.dates.label }, ...facets],
    timeline: search.dates.timeline
      ? { ...search.timeline, date_range_facet: YEARS_ATTRIBUTE }
      : search.timeline
  };
};

/**
 * Whether a facet attribute's field is one of the computed year fields (never
 * a `_source` path).
 *
 * @param field
 */
export const isRuntimeField = (field: string) => RUNTIME_FIELDS.includes(field);

/**
 * The runtime field definitions for a search over `field`.
 *
 * @param field
 */
export const yearRuntimeMappings = (field: string) => ({
  [YEARS_FIELD]: { type: 'long', script: { source: YEARS_SCRIPT, params: { field, part: 'years' } } },
  [YEAR_START_FIELD]: { type: 'long', script: { source: YEARS_SCRIPT, params: { field, part: 'start' } } },
  [YEAR_END_FIELD]: { type: 'long', script: { source: YEARS_SCRIPT, params: { field, part: 'end' } } }
});

/**
 * Rewrites the year filter Searchkit builds (`range` on `og_years`) into an
 * overlap test: a record dated 1861–1865 matches 1864–1900, because its last
 * year is ≥ 1864 and its first year ≤ 1900. Returns a new body.
 *
 * @param node
 */
export const toOverlapFilters = (node: any): any => {
  if (Array.isArray(node)) {
    return node.map(toOverlapFilters);
  }

  if (!node || typeof node !== 'object') {
    return node;
  }

  if (node.range && node.range[YEARS_FIELD]) {
    const { gt, gte, lt, lte, ...rest } = node.range[YEARS_FIELD];
    const filters = [];

    if (gt !== undefined || gte !== undefined) {
      filters.push({ range: { [YEAR_END_FIELD]: _.pick({ gt, gte, ...rest }, (v) => v !== undefined) } });
    }

    if (lt !== undefined || lte !== undefined) {
      filters.push({ range: { [YEAR_START_FIELD]: _.pick({ lt, lte, ...rest }, (v) => v !== undefined) } });
    }

    return filters.length === 1 ? filters[0] : { bool: { filter: filters } };
  }

  return _.mapObject(node, toOverlapFilters);
};

/**
 * The years searches use: `[first, last]`, or null when the value has none.
 * Mirrors the script (same rules), for hits and tests.
 *
 * @param raw
 */
export const toYears = (raw: any): [number, number] | null => {
  const range = toDateRange(raw);
  return range ? [range.start.year, range.end.year] : null;
};

interface DatePart {
  year: number;
  month?: number;
  day?: number;
}

export interface DateRange {
  start: DatePart;
  end: DatePart;
  accuracy: 'year' | 'month' | 'day';
  range: boolean;
  description?: string;
}

const ACCURACY = ['year', 'month', 'day'] as const;

/**
 * Reads one date-ish value into its parts. ISO timestamps are rounded to the
 * nearest UTC day (see the script).
 *
 * @param value
 */
const toPart = (value: any): { part: DatePart, accuracy: DateRange['accuracy'] } | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { part: { year: Math.trunc(value) }, accuracy: 'year' };
  }

  if (typeof value !== 'string') {
    return null;
  }

  const text = value.trim();

  if (/^-?\d{1,6}-\d{2}-\d{2}T/.test(text)) {
    const date = new Date(Date.parse(text) + 12 * 3600 * 1000);

    if (!Number.isNaN(date.getTime())) {
      return { part: { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }, accuracy: 'day' };
    }
  }

  const match = text.match(/^(-?\d{1,6})(?:-(\d{1,2})(?:-(\d{1,2}))?)?/);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;

  if (day) {
    return { part: { year: Number(year), month: Number(month), day: Number(day) }, accuracy: 'day' };
  }

  if (month) {
    return { part: { year: Number(year), month: Number(month) }, accuracy: 'month' };
  }

  return { part: { year: Number(year) }, accuracy: 'year' };
};

/**
 * Any stored date value — `{ label, value }`, a fuzzy date, an ISO day or
 * timestamp, a year, partial text — as a start/end range, or null.
 *
 * @param raw
 */
export const toDateRange = (raw: any): DateRange | null => {
  let value = raw;

  if (value && typeof value === 'object' && !Array.isArray(value) && 'value' in value) {
    value = value.value;
  }

  if (Array.isArray(value)) {
    value = _.find(value, (item) => !!toDateRange(item));
  }

  if (value && typeof value === 'object') {
    const start = toPart(value.start_date) || toPart(value.end_date);
    const end = toPart(value.end_date) || start;

    if (!start || !end) {
      return null;
    }

    const accuracy = ACCURACY[value.accuracy] || start.accuracy;

    return {
      start: start.part,
      end: end.part.year < start.part.year ? start.part : end.part,
      accuracy,
      range: !!value.range,
      description: typeof value.description === 'string' && value.description.trim() ? value.description.trim() : undefined
    };
  }

  const single = toPart(value);

  return single ? { start: single.part, end: single.part, accuracy: single.accuracy, range: false } : null;
};

const formatPart = (part: DatePart, accuracy: DateRange['accuracy'], locale: string) => {
  if (accuracy === 'year' || !part.month) {
    return String(part.year);
  }

  // Year 1–99 need setUTCFullYear; Date.UTC maps them to 1900–1999.
  const date = new Date(Date.UTC(2000, part.month - 1, part.day || 1));
  date.setUTCFullYear(part.year);

  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    ...(accuracy === 'day' && part.day ? { day: 'numeric' } : {})
  }).format(date);
};

/**
 * A date value as a visitor reads it: the description when there is one
 * ("1890s", "c. 1890"), else "1983", "March 1983", "March 15, 1983" — or a
 * range, "1861–1865". The same on the server and in any browser time zone.
 *
 * @param raw
 * @param locale
 */
export const formatDateValue = (raw: any, locale = 'en'): string | null => {
  const range = toDateRange(raw);

  if (!range) {
    return null;
  }

  if (range.description) {
    return range.description;
  }

  const start = formatPart(range.start, range.accuracy, locale);
  const end = formatPart(range.end, range.accuracy, locale);

  return start === end || !range.range ? start : `${start}–${end}`;
};

/**
 * Unix seconds at UTC midnight for a date part (the timeline's event shape).
 *
 * @param part
 * @param last whether to take the last day of a year/month
 */
const toUnixSeconds = (part: DatePart, last = false) => {
  const date = new Date(Date.UTC(2000, 0, 1));
  date.setUTCFullYear(part.year, (part.month || (last ? 12 : 1)) - 1, part.day || 1);

  if (last && !part.day) {
    // the last day of the month (or of December for a bare year)
    date.setUTCMonth(date.getUTCMonth() + 1, 0);
  }

  return Math.floor(date.getTime() / 1000);
};

/**
 * What a hit carries for the timeline (core-data's `start_date`/`end_date`
 * convention: arrays of Unix seconds) and its readable date.
 *
 * @param raw
 * @param locale
 */
export const toHitDates = (raw: any, locale = 'en') => {
  const range = toDateRange(raw);

  if (!range) {
    return {};
  }

  return {
    start_date: [toUnixSeconds(range.start)],
    end_date: [toUnixSeconds(range.end, true)],
    date_label: formatDateValue(raw, locale)
  };
};
