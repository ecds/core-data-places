import ServiceFactory from '@services/coreData/factory';
import _ from 'underscore';

/**
 * Returns the Response object for the passed data.
 *
 * @param data
 */
export const buildResponse = (data) => {
  const headers = {
    'Content-Type': 'application/json'
  };

  const status = 200;

  return new Response(JSON.stringify(data || ''), { status, headers });
};

/**
 * Some Core Data deployments generate IIIF manifest/collection ids without a
 * URL scheme (e.g. "coredata.ecds.io//core_data/public/v1/..."), which the
 * browser then resolves relative to the page and 404s. Normalize such ids to
 * absolute https URLs. Absolute ids pass through untouched.
 */
export const fixManifestId = (id: any) => {
  if (typeof id !== 'string' || !id || /^https?:\/\//.test(id)) {
    return id;
  }

  return `https://${id.replace(/^\/+/, '').replace('//', '/')}`;
};

/**
 * Applies fixManifestId to the `id` of a IIIF collection and each of its items.
 */
export const fixManifestIds = (data: any) => {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const result = { ...data, id: fixManifestId(data.id) };

  if (Array.isArray(result.items)) {
    result.items = result.items.map((item: any) => ({ ...item, id: fixManifestId(item.id) }));
  }

  return result;
};

interface Params {
  [key: string]: string
};

/**
 * Builds the API static paths.
 *
 * @param params
 */
export const buildStaticPaths = async (params: Params = {}) => {
  const routes = [];

  const models = ServiceFactory.getModels();

  for (const model of models) {
    const service = ServiceFactory.getService(model);
    const records = await service.getAll();

    _.each(records[model], ({ uuid }) => {
      routes.push({ params: { model, uuid, ...params } });
    });
  }

  return routes;
};


