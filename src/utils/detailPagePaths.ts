import { Models } from '@types';

/**
 * Returns true if the passed atlas config defines a detail page for the model.
 *
 * The config is supplied by the caller (rather than imported here) so this stays
 * correct on both sides of the SSR boundary: server code passes
 * `getAtlasConfig()` and client islands pass peripleo's `useRuntimeConfig()` —
 * each resolves the CURRENT atlas's config. (Reading the static build-time
 * `@config` here made every atlas fall back to the default, which has no
 * detail_pages, so detail-page links never appeared.)
 *
 * @param model
 * @param config the current atlas config
 */
export const hasDetailPage = (model: Models, config: any) => {
  const models = config?.detail_pages?.models;
  return Boolean(models && Object.keys(models).includes(model));
}
