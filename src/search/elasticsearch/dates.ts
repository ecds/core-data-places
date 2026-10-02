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

/** Years outside ±MAX_YEAR are treated as no year (a typo or a stray number, not a date). */
export const MAX_YEAR = 100000;

/**
 * Painless. `year` reads the year off whatever a date value is: a number is a
 * year; an ISO timestamp (Core Data's own form saves a day as local midnight in
 * UTC) is taken as a UTC instant — one without an offset as UTC — and rounded
 * to the nearest day, so 1983-01-01T05:00Z and 1982-12-31T23:00Z are both 1983;
 * a timestamp that doesn't parse, and any other text, gives its leading digits
 * ("1983-03-15", "1983-03-", "1890"). Text that doesn't start with a year
 * ("c. 1890") has none — the upload turns those into fuzzy dates. No value can
 * make the script fail: one bad record must not break an atlas's searches.
 * `toPart` below applies the same rules.
 *
 * Elasticsearch caps a runtime field at 100 values per document, so a span over
 * 99 years is sampled for `og_years` (first and last year always included);
 * the filter itself uses the exact first/last years.
 */
const YEARS_SCRIPT = `
long year(def x) {
  if (x == null) { return Long.MIN_VALUE; }
  if (x instanceof Number) {
    double d = ((Number) x).doubleValue();
    if (!(d >= -${MAX_YEAR}.0 && d <= ${MAX_YEAR}.0)) { return Long.MIN_VALUE; }
    return (long) d;
  }
  String s = x.toString().trim();
  if (s.length() > 10 && s.charAt(10) == (char) 'T') {
    try {
      return ZonedDateTime.parse(s).withZoneSameInstant(ZoneOffset.UTC).plusHours(12).getYear();
    } catch (Exception e) {
      try {
        return LocalDateTime.parse(s).plusHours(12).getYear();
      } catch (Exception e2) {}
    }
  }
  int i = 0;
  boolean negative = false;
  if (s.length() > 0 && s.charAt(0) == (char) '-') { negative = true; i = 1; }
  long y = 0;
  int digits = 0;
  while (i < s.length() && digits < 6 && Character.isDigit(s.charAt(i))) {
    y = y * 10 + (s.charAt(i) - (char) '0');
    i++;
    digits++;
  }
  if (digits == 0 || y > ${MAX_YEAR} || (i < s.length() && Character.isDigit(s.charAt(i)))) { return Long.MIN_VALUE; }
  return negative ? -y : y;
}

def field = params._source[params.field];
if (field == null) { return; }
def value = (field instanceof Map && field.containsKey('value')) ? field.get('value') : field;
if (value == null) { return; }
List values = value instanceof List ? (List) value : [value];
long lo = Long.MAX_VALUE;
long hi = Long.MIN_VALUE;
for (def item : values) {
  long s;
  long e;
  if (item instanceof Map) {
    s = year(item.get('start_date'));
    e = year(item.get('end_date'));
    if (s == Long.MIN_VALUE) { s = e; }
    if (e == Long.MIN_VALUE) { e = s; }
  } else {
    s = year(item);
    e = s;
  }
  if (s == Long.MIN_VALUE) { continue; }
  if (e < s) { e = s; }
  if (s < lo) { lo = s; }
  if (e > hi) { hi = e; }
}
if (lo == Long.MAX_VALUE) { return; }
if (params.part == 'start') { emit(lo); return; }
if (params.part == 'end') { emit(hi); return; }
long step = hi - lo < 99 ? 1 : (hi - lo + 98) / 98;
for (long y = lo; y < hi; y += step) { emit(y); }
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

  const attributeOf = (facet: any) => (typeof facet === 'string' ? facet : facet?.attribute);
  const fieldOf = (facet: any) => (typeof facet === 'string' ? facet : facet?.field || facet?.attribute);

  // The filter is `years` (the URL reads ?years=1800:1830) unless the atlas has
  // a facet of its own by that name (a "Years" category), then `og_years`.
  const taken = _.some(facetAttributes, (facet: any) => attributeOf(facet) === YEARS_ATTRIBUTE && fieldOf(facet) !== YEARS_FIELD);
  const attribute = taken ? YEARS_FIELD : YEARS_ATTRIBUTE;
  const hasAttribute = _.some(facetAttributes, (facet: any) => attributeOf(facet) === attribute);

  return {
    ...search,
    elasticsearch: {
      ...elasticsearch,
      facet_attributes: hasAttribute
        ? facetAttributes
        : [{ attribute, field: YEARS_FIELD, type: 'numeric' }, ...facetAttributes],
      sort_attributes: [
        ...sorts,
        ...[
          { name: 'date_asc', field: YEAR_START_FIELD, order: 'asc' },
          { name: 'date_desc', field: YEAR_END_FIELD, order: 'desc' }
        ].filter((sort) => !_.findWhere(sorts, { name: sort.name }))
      ]
    },
    facets: _.findWhere(facets, { name: attribute })
      ? facets
      : [{ name: attribute, type: 'range', label: search.dates.label }, ...facets],
    timeline: search.dates.timeline
      ? { ...search.timeline, date_range_facet: attribute }
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

const inRange = (year: number) => Math.abs(year) <= MAX_YEAR;

/**
 * The number of days in a month of the proleptic Gregorian calendar.
 *
 * @param year
 * @param month 1–12
 */
const daysInMonth = (year: number, month: number) => {
  const date = new Date(Date.UTC(2000, 0, 1));
  date.setUTCFullYear(year, month, 0);
  return date.getUTCDate();
};

/**
 * Reads one date-ish value into its parts, by the script's rules: a number is a
 * year; a timestamp is the UTC instant (one without an offset read as UTC)
 * rounded to the nearest day; otherwise the leading year, and the month and day
 * when they're real ones ("1983-99-99" is just 1983). Years beyond ±MAX_YEAR
 * are no date.
 *
 * @param value
 */
const toPart = (value: any): { part: DatePart, accuracy: DateRange['accuracy'] } | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && inRange(value) ? { part: { year: Math.trunc(value) }, accuracy: 'year' } : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const text = value.trim();

  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const time = Date.parse(/(z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}Z`);

    if (!Number.isNaN(time)) {
      const date = new Date(time + 12 * 3600 * 1000);
      return { part: { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }, accuracy: 'day' };
    }
  }

  const match = text.match(/^(-?\d{1,6})(?!\d)(?:-(\d{1,2})(?:-(\d{1,2}))?)?/);

  if (!match || !inRange(Number(match[1]))) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!(month >= 1 && month <= 12)) {
    return { part: { year }, accuracy: 'year' };
  }

  if (!(day >= 1 && day <= daysInMonth(year, month))) {
    return { part: { year, month }, accuracy: 'month' };
  }

  return { part: { year, month, day }, accuracy: 'day' };
};

const startKey = (part: DatePart) => (part.year * 100 + (part.month || 1)) * 100 + (part.day || 1);
const endKey = (part: DatePart) => (part.year * 100 + (part.month || 12)) * 100 + (part.day || 31);

/**
 * Any stored date value — `{ label, value }`, a fuzzy date, an ISO day or
 * timestamp, a year, partial text, or a list of them — as a start/end range,
 * or null. A list spans its earliest start to its latest end, as the script
 * does.
 *
 * @param raw
 */
export const toDateRange = (raw: any): DateRange | null => {
  let value = raw;

  if (value && typeof value === 'object' && !Array.isArray(value) && 'value' in value) {
    value = value.value;
  }

  if (Array.isArray(value)) {
    const ranges = _.compact(_.map(value, toDateRange)) as DateRange[];

    if (ranges.length < 2) {
      return ranges[0] || null;
    }

    return {
      start: _.min(ranges, (range: DateRange) => startKey(range.start)).start,
      end: _.max(ranges, (range: DateRange) => endKey(range.end)).end,
      accuracy: ACCURACY[Math.min(...ranges.map((range) => ACCURACY.indexOf(range.accuracy)))],
      range: true
    };
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

/**
 * One date at its precision. Year 0 and earlier read with their era, as the
 * locale writes it ("44 BC" for the ISO year -0043).
 *
 * @param part
 * @param accuracy
 * @param locale
 */
const formatPart = (part: DatePart, accuracy: DateRange['accuracy'], locale: string) => {
  const beforeCommonEra = part.year <= 0;
  const month = accuracy !== 'year' && part.month;
  const day = accuracy === 'day' && month && part.day;

  if (!month && !beforeCommonEra) {
    return String(part.year);
  }

  // Years 0–99 need setUTCFullYear; Date.UTC maps them to 1900–1999.
  const date = new Date(Date.UTC(2000, 0, 1));
  date.setUTCFullYear(part.year, (part.month || 1) - 1, part.day || 1);

  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    year: 'numeric',
    ...(month ? { month: 'long' } : {}),
    ...(day ? { day: 'numeric' } : {}),
    ...(beforeCommonEra ? { era: 'short' } : {})
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
 * What a hit carries for the timeline: core-data's `start_date`/`end_date`
 * convention, arrays of Unix seconds.
 *
 * @param raw
 */
export const toHitDates = (raw: any) => {
  const range = toDateRange(raw);

  if (!range) {
    return {};
  }

  return {
    start_date: [toUnixSeconds(range.start)],
    end_date: [toUnixSeconds(range.end, true)]
  };
};
