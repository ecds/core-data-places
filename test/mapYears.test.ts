import { describe, expect, test } from 'vitest';
import { getDatedLayers, getInitialMapYear, getLayersForYear, getMapYears } from '../src/utils/mapYears';

const layers = [
  { name: 'Streets', overlay: true },
  { name: 'Sanborn 1911', overlay: true, start_year: 1911 },
  { name: 'Bird\'s eye 1871', overlay: true, start_year: 1871, default: true },
  { name: 'Atlas 1928–1932', overlay: true, start_year: 1928, end_year: 1932 },
  { name: 'Typo', overlay: true, start_year: 1900.5 }
];

describe('historic map years', () => {
  test('only whole years date a layer; stops are in order', () => {
    expect(getDatedLayers(layers).map((l) => l.name)).toEqual(['Sanborn 1911', 'Bird\'s eye 1871', 'Atlas 1928–1932']);
    expect(getMapYears(layers)).toEqual([1871, 1911, 1928]);
  });

  test('a year shows the maps that cover it', () => {
    expect(getLayersForYear(layers, 1911).map((l) => l.name)).toEqual(['Sanborn 1911']);
    expect(getLayersForYear(layers, 1930).map((l) => l.name)).toEqual(['Atlas 1928–1932']);
    expect(getLayersForYear(layers, 1950)).toEqual([]);
    expect(getLayersForYear(layers, null)).toEqual([]);
  });

  test('the slider starts at the map shown by default, else none', () => {
    expect(getInitialMapYear(layers)).toBe(1871);
    expect(getInitialMapYear(layers.map(({ default: _d, ...l }) => l))).toBeNull();
  });
});
