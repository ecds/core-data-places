import _ from 'underscore';

/**
 * Historic map overlays with years (`layers[].start_year`, optional
 * `end_year`, set in the console's Map layers tab). With two or more of them a
 * map gets a year slider instead of listing them as overlays: each position
 * shows the map(s) for that year, and the first position shows none.
 */

export interface DatedLayer {
  name: string;
  start_year?: number;
  end_year?: number;
  default?: boolean;
  [key: string]: any;
}

const isYear = (value: any) => typeof value === 'number' && Number.isInteger(value);

/**
 * The overlays that carry a year.
 *
 * @param layers
 */
export const getDatedLayers = <T extends DatedLayer>(layers: T[]): T[] => (
  _.filter(layers || [], (layer) => isYear(layer.start_year))
);

/**
 * The slider's stops: each dated map's first year, in order.
 *
 * @param layers
 */
export const getMapYears = (layers: DatedLayer[]): number[] => (
  _.uniq(_.map(getDatedLayers(layers), (layer) => layer.start_year as number)).sort((a, b) => a - b)
);

/**
 * The dated maps that cover `year`.
 *
 * @param layers
 * @param year
 */
export const getLayersForYear = <T extends DatedLayer>(layers: T[], year: number | null): T[] => {
  if (year === null) {
    return [];
  }

  return _.filter(getDatedLayers(layers), (layer) => {
    const end = isYear(layer.end_year) && layer.end_year! >= layer.start_year! ? layer.end_year! : layer.start_year!;
    return layer.start_year! <= year && year <= end;
  });
};

/**
 * Where the slider starts: the year of the first dated map shown by default,
 * else no map.
 *
 * @param layers
 */
export const getInitialMapYear = (layers: DatedLayer[]): number | null => {
  const shown = _.find(getDatedLayers(layers), (layer) => layer.default === true);
  return shown ? shown.start_year! : null;
};
