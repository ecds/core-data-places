import { getAtlasConfig } from '@atlas/server';
import ServiceFactory from '@services/coreData/factory';
import { buildResponse, buildStaticPaths } from '@utils/api';
import { findSlugs } from '@utils/recordAddress';
import type { APIRoute, GetStaticPaths } from 'astro';

export const GET: APIRoute = async ({ params }) => {
  const { model, uuid } = params;

  const service = ServiceFactory.getService(model);
  const [data, slugs] = await Promise.all([
    service.getOne(uuid),
    findSlugs(getAtlasConfig(), model as string, [uuid as string])
  ]);

  // Core Data's record has no slug; the index's lets the panel link to the
  // record's page by it.
  const record = data?.[service.param];

  if (record && slugs[uuid as string]) {
    record.slug = slugs[uuid as string];
  }

  return buildResponse(data);
};

export const getStaticPaths = (async () => await buildStaticPaths()) satisfies GetStaticPaths;
