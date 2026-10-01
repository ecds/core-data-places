import { describe, expect, it } from 'vitest';
import { bounds, hasExtent } from '../src/utils/map';

const collection = (...geometries: any[]) => ({
  type: 'FeatureCollection',
  features: geometries.map((geometry) => ({ type: 'Feature', properties: {}, geometry }))
});

describe('hasExtent', () => {
  it('is false for a single point, which the maps show with room around it', () => {
    expect(hasExtent(collection({ type: 'Point', coordinates: [-84.3887, 33.7525] }))).toBe(false);
    expect(hasExtent(null)).toBe(false);
  });

  it('is true for a boundary, a route or several points, which the maps frame by their extent', () => {
    expect(hasExtent(collection({
      type: 'Polygon',
      coordinates: [[[-84.36, 33.76], [-84.35, 33.76], [-84.35, 33.77], [-84.36, 33.76]]]
    }))).toBe(true);
    expect(hasExtent(collection({ type: 'LineString', coordinates: [[-84.39, 33.75], [-84.38, 33.75]] }))).toBe(true);
    expect(hasExtent(collection(
      { type: 'Point', coordinates: [-84.39, 33.75] },
      { type: 'Point', coordinates: [-84.38, 33.76] }
    ))).toBe(true);
  });
});

describe('bounds', () => {
  it('spans every coordinate, nested or not', () => {
    expect(bounds(collection(
      { type: 'MultiPolygon', coordinates: [[[[-84.36, 33.76], [-84.35, 33.77], [-84.36, 33.76]]]] },
      { type: 'Point', coordinates: [-84.4, 33.7] }
    ))).toEqual([-84.4, 33.7, -84.35, 33.77]);
    expect(bounds(collection())).toBeNull();
  });
});
