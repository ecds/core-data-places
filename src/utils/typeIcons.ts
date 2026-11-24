import type { TypeIcons } from '@utils/tileStyles';
import _ from 'underscore';

/**
 * An atlas's icons by place type, for its search results and tiles: the
 * atlas-wide `map.type_icons`, else the first vector tile overlay's own
 * `type_icons` (so an atlas set up with icons on its tiles shows the same
 * icons on its results).
 *
 *   { "Church": { "icon": "church", "color": "#1e40af" } }
 */
export const atlasTypeIcons = (config: any): TypeIcons | undefined => {
  const own = config?.map?.type_icons;

  if (!_.isEmpty(own)) {
    return own;
  }

  const layer = _.find(config?.layers || [], (entry: any) => entry?.layer_type === 'pmtiles' && !_.isEmpty(entry?.type_icons));
  return layer?.type_icons;
};

/**
 * The icon and colour for a place with these types: the first type listed in
 * `typeIcons` that the place has (the order a curator set is the priority),
 * or none.
 */
export const iconForTypes = (types: string[] | undefined, typeIcons?: TypeIcons) => {
  if (!typeIcons || _.isEmpty(types)) {
    return null;
  }

  const entry = _.find(Object.entries(typeIcons), ([type, icon]) => !!icon?.icon && _.contains(types, type));
  return entry ? entry[1] : null;
};
