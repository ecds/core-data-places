import ServiceFactory from '@services/coreData/factory';
import { CoreData as CoreDataUtils } from '@performant-software/core-data/ssr';
import { getAtlasConfig } from '@atlas/server';
import config from '@config' with { type: 'json' };
import type { Models } from '@types';
import { hasDetailPage } from '@utils/detailPagePaths';

export const getDetailPagePaths = async (model: Models) => {
  let routes = [];

  // Build-time path generation uses the static defaults superset.
  if (hasDetailPage(model, config)) {
    return routes;
  }

  const service = ServiceFactory.getService(model);
  const records = await service.getAll();

  for (const lang of config.i18n.locales) {
    for (const { uuid } of records[model]) {
      routes.push({ params: { lang, uuid } });
    }
  }

  return routes;
};

export const getCoverImage = (mediaContents?: any[]) => {
  if (mediaContents && mediaContents.length > 0) {
    return mediaContents[0].content_iiif_url
  }

  return null
}

export const getDisplayFields = (record: any, fields: { label: string, uuid: string }[]) => {
  const result = [];

  if (record.user_defined) {
    for (const field of fields) {
      if (record.user_defined[field.uuid]) {
        result.push({ label: field.label, value: record.user_defined[field.uuid] });
      }
    }
  }

  return result;
}

export const getRelatedGeometry = (places?: any[]) => {
  if (places && places.length > 0) {
    return CoreDataUtils.toFeatureCollection(places)
  }

  return null
}

export const getRelationshipFields = (model: Models, t: any) => {
  // Per request: the CURRENT atlas's relationship-field config (this is called
  // only from server-rendered detail-page islands). Reading the static @config
  // here made every atlas use the default (which has none).
  const relationshipFields = getAtlasConfig().detail_pages?.relationship_fields;

  if (relationshipFields) {
    return (relationshipFields[model] || []).map(uuid => ({
      label: t(uuid),
      uuid: uuid
    }));
  }

  return [];
}

const INVERSE_SUFFIX = '_inverse';

/**
 * Groups a set of related records (e.g. related people) by relationship UUID.
 * @param relatedRecords
 * @param excludes
 */
export const groupRelationships = (relatedRecords: any[], excludes: string[]) => {
  const relations = {}

  relatedRecords.forEach(rel => {
    if (excludes.includes(rel.project_model_relationship_uuid)) {
      return
    }

    const key = rel.project_model_relationship_inverse
        ? rel.project_model_relationship_uuid + INVERSE_SUFFIX
        : rel.project_model_relationship_uuid;

    if (relations[key]) {
      relations[key].push(rel);
    } else {
      relations[key] = [rel];
    }
  })

  return relations
}