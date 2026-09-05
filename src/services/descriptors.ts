import { getAtlasConfig } from '@atlas/server';
import { getTranslationKey } from '@i18n/utils';
import _ from 'underscore';

/**
 * Default labels for an atlas's UUID-keyed descriptors — project models,
 * relationships (both directions) and user-defined fields — derived from Core
 * Data's public descriptors endpoint.
 *
 * Detail panels and pages read records from Core Data's public API, which keys
 * relationships by `project_model_relationship_uuid`; facet attributes on older
 * (Typesense-era) atlases are UUID-keyed too. Every one of those is labeled
 * through `t(<uuid>)`, so an atlas whose console has no translated strings
 * rendered them blank. The descriptors carry the curator's own names, which are
 * the right default; console-owned `i18n.strings` still override them.
 */

interface Descriptor {
  identifier: string;
  label: string;
  context?: string;
  inverse_label?: string;
}

interface CacheEntry {
  labels: { [key: string]: string };
  expires: number;
}

const CACHE_TTL_MS = Number(process.env.OG_ATLAS_CACHE_TTL_MS ?? 30_000);
const FETCH_TIMEOUT_MS = Number(process.env.OG_ATLAS_FETCH_TIMEOUT_MS ?? 5_000);
const INVERSE_SUFFIX = '_inverse';

const cache = new Map<string, CacheEntry>();

/**
 * Fetches the descriptors for one project. Any failure yields an empty list:
 * labels are a default, never worth failing a page for.
 *
 * @param baseUrl
 * @param projectId
 */
const fetchDescriptors = async (baseUrl: string, projectId: string | number): Promise<Descriptor[]> => {
  try {
    const response = await fetch(`${baseUrl}/core_data/public/v1/projects/${projectId}/descriptors`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });

    if (!response.ok) {
      return [];
    }

    const body = await response.json();

    return body?.descriptors || [];
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`[descriptors] failed to load project ${projectId}:`, error instanceof Error ? error.message : error);

    return [];
  }
};

/**
 * Flattens descriptors into `t_`-keyed translations, the shape
 * `buildTranslations` merges beneath the atlas's own strings.
 *
 * @param descriptors
 */
export const toLabels = (descriptors: Descriptor[]) => {
  const labels = {};

  _.each(descriptors, (descriptor) => {
    if (!descriptor?.identifier || !descriptor.label) {
      return;
    }

    labels[getTranslationKey(descriptor.identifier)] = descriptor.label;

    if (descriptor.inverse_label) {
      labels[getTranslationKey(`${descriptor.identifier}${INVERSE_SUFFIX}`)] = descriptor.inverse_label;
    }
  });

  return labels;
};

/**
 * Returns the descriptor labels for the current request's atlas, cached per
 * atlas for the same short TTL as the atlas bundle itself.
 */
export const getDescriptorLabels = async () => {
  const coreData = getAtlasConfig()?.core_data ?? {};
  const baseUrl = (coreData.url || '').replace(/\/+$/, '');
  const projectIds = _.compact(coreData.project_ids || []);

  if (!baseUrl || _.isEmpty(projectIds)) {
    return {};
  }

  const cacheKey = `${baseUrl}|${projectIds.join(',')}`;
  const cached = cache.get(cacheKey);

  if (cached && cached.expires > Date.now()) {
    return cached.labels;
  }

  const descriptors = await Promise.all(_.map(projectIds, (id) => fetchDescriptors(baseUrl, id)));
  const labels = toLabels(_.flatten(descriptors));

  cache.set(cacheKey, { labels, expires: Date.now() + CACHE_TTL_MS });

  return labels;
};
