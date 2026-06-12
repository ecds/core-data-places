import { buildResponse } from '@utils/api';
import { APIRoute } from 'astro';
import { getOne } from '@services/gallery';
import { fetchJson, truncateManifestId } from '@utils/galleries';
import config from '@config' with { type: 'json' };

export const GET: APIRoute = async ({ params }) => {
  const { manifestId } = params;

  const { data } = await getOne(decodeURIComponent(manifestId));

  return buildResponse(data);
};

export const getStaticPaths = async () => {
  // Sites without a gallery have no manifest routes to prerender.
  if (!config.gallery) {
    return [];
  }

  const topLevel = await fetchJson(config.gallery);

  return topLevel.items.map(({ id }) => ({
    params: { manifestId: encodeURIComponent(truncateManifestId((id))) }
  }));
};
