import { buildBaseFilters } from '@search/elasticsearch/filters';
import _ from 'underscore';

/**
 * What a search engine may list for an atlas: its home and standalone
 * pages, its searches, and the detail page of every published record its
 * searches cover — for every locale. Read from the shared index with the
 * same tenant, model and visibility filters as the search handler, so it can
 * only ever list this atlas's own published records.
 */

// A sitemap file holds at most 50,000 addresses; stay well under.
export const URLS_PER_FILE = 40_000;
const PAGE = 5_000;

// Detail-page route → the index's model_type.
const MODEL_TYPES: Record<string, string> = {
  places: 'place',
  people: 'person',
  organizations: 'organization',
  events: 'event',
  works: 'work',
  items: 'item',
  instances: 'instance'
};

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
}

/**
 * The address visitors reach the atlas at, from the request (a proxy's
 * forwarded host and scheme win over the renderer's own).
 */
export const publicOrigin = (request: Request): string => {
  const url = new URL(request.url);
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host).split(',')[0].trim();
  const proto = (request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '')).split(',')[0].trim();

  return `${proto}://${host}`;
};

const locales = (config: any): string[] => {
  const list = config?.i18n?.locales;
  return Array.isArray(list) && list.length ? list : [config?.i18n?.default_locale || 'en'];
};

/**
 * The atlas's own pages and searches.
 */
export const pageUrls = (origin: string, config: any, content: any): SitemapUrl[] => {
  const pages = _.pluck(content?.pages || [], 'slug').filter(Boolean);
  const searches = _.pluck(config?.search || [], 'name').filter(Boolean);

  return _.flatten(locales(config).map((locale) => [
    { loc: `${origin}/${locale}/` },
    ...pages.map((slug) => ({ loc: `${origin}/${locale}/pages/${encodeURIComponent(slug)}` })),
    ...searches.map((name) => ({ loc: `${origin}/${locale}/search/${encodeURIComponent(name)}` }))
  ]));
};

const recordQuery = (config: any) => {
  const projectIds = config?.core_data?.project_ids || [];
  const modelIds = _.uniq(_.flatten((config?.search || []).map((search: any) => search?.elasticsearch?.model_ids || [])));
  const models = Object.keys(config?.detail_pages?.models || {}).filter((model) => MODEL_TYPES[model]);

  if (!models.length) {
    return null;
  }

  return {
    models,
    query: {
      bool: {
        filter: [
          ...buildBaseFilters({ projectIds, modelIds }),
          { terms: { model_type: models.map((model) => MODEL_TYPES[model]) } }
        ]
      }
    }
  };
};

const indexName = (config: any): string | null => (
  _.find((config?.search || []).map((search: any) => search?.elasticsearch?.index_name), Boolean) || null
);

const connection = () => ({
  host: (process.env.OG_ELASTICSEARCH_URL || process.env.ELASTICSEARCH_URL || '').replace(/\/+$/, ''),
  apiKey: process.env.OG_ELASTICSEARCH_API_KEY || process.env.ELASTICSEARCH_API_KEY
});

const search = async (index: string, body: any) => {
  const { host, apiKey } = connection();
  const response = await fetch(`${host}/${encodeURIComponent(index)}/_search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `ApiKey ${apiKey}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) {
    throw new Error(`Elasticsearch answered ${response.status}`);
  }

  return response.json();
};

/**
 * How many record addresses the atlas has (records × locales).
 */
export const countRecordUrls = async (config: any): Promise<number> => {
  const plan = recordQuery(config);
  const index = indexName(config);

  if (!plan || !index || !connection().host) {
    return 0;
  }

  const data = await search(index, { size: 0, track_total_hits: true, query: plan.query });
  return (data?.hits?.total?.value || 0) * locales(config).length;
};

/**
 * Record addresses `skip` .. `skip + limit` (in uuid order), each record
 * once per locale.
 */
export const recordUrls = async (origin: string, config: any, skip = 0, limit = URLS_PER_FILE): Promise<SitemapUrl[]> => {
  const plan = recordQuery(config);
  const index = indexName(config);

  if (!plan || !index || !connection().host) {
    return [];
  }

  const routes = _.invert(_.pick(MODEL_TYPES, plan.models));
  const langs = locales(config);
  const urls: SitemapUrl[] = [];
  let seen = 0;
  let after: any[] | undefined;

  while (urls.length < limit) {
    const data = await search(index, {
      size: PAGE,
      _source: ['uuid', 'model_type', 'date_modified'],
      sort: [{ uuid: 'asc' }],
      query: plan.query,
      ...(after ? { search_after: after } : {})
    });

    const hits = data?.hits?.hits || [];

    for (const hit of hits) {
      const { uuid, model_type: type, date_modified: modified } = hit._source || {};
      const route = routes[type];

      for (const lang of langs) {
        if (seen++ < skip || !uuid || !route) {
          continue;
        }

        if (urls.length < limit) {
          urls.push({ loc: `${origin}/${lang}/${route}/${encodeURIComponent(uuid)}`, lastmod: modified });
        }
      }
    }

    if (hits.length < PAGE) {
      break;
    }

    after = hits[hits.length - 1].sort;
  }

  return urls;
};

const escapeXml = (value: string) => value.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string));

export const urlsetXml = (urls: SitemapUrl[]) => [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls.map((url) => `<url><loc>${escapeXml(url.loc)}</loc>${url.lastmod ? `<lastmod>${escapeXml(url.lastmod)}</lastmod>` : ''}</url>`),
  '</urlset>'
].join('\n');

export const indexXml = (locs: string[]) => [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...locs.map((loc) => `<sitemap><loc>${escapeXml(loc)}</loc></sitemap>`),
  '</sitemapindex>'
].join('\n');
