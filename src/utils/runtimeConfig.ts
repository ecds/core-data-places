import _ from 'underscore';

/**
 * Normalizes the atlas config for peripleo's `<RuntimeConfig>`.
 *
 * Replaces `@performant-software/core-data`'s `Peripleo.normalize`, which
 * dereferences `search[].typesense` unconditionally and so throws (silently,
 * inside the config loader — the search island simply never renders) for an
 * atlas on the Elasticsearch path, where the search entry carries no
 * `typesense` block at all.
 *
 * @param config
 */
export const normalizeRuntimeConfig = (config: any) => {
  const url = config?.core_data?.url || '';

  return {
    ...config,
    layers: config?.layers || [],
    search: _.map(config?.search || [], (search) => ({ ...search })),
    core_data: {
      ...config?.core_data,
      // Remove trailing slash if any
      url: url.endsWith('/') ? url.substring(0, url.length - 1) : url,
      project_ids: Array.isArray(config?.core_data?.project_ids)
        ? config.core_data.project_ids
        : _.compact([config?.core_data?.project_ids])
    }
  };
};
