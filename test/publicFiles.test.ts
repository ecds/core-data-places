import { describe, expect, it } from 'vitest';
import { isPublicFile } from '../scripts/publicFiles.mjs';

describe('isPublicFile', () => {
  it('opens map styles and the icon sprite to any site', () => {
    expect(isPublicFile('/styles/simple.json')).toBe(true);
    expect(isPublicFile('/sprites/og.json')).toBe(true);
    expect(isPublicFile('/sprites/ATTRIBUTION.md')).toBe(true);
  });

  it('keeps pages, API routes and tiles to the atlas itself', () => {
    expect(isPublicFile('/en/search/places')).toBe(false);
    expect(isPublicFile('/api/search.json')).toBe(false);
    expect(isPublicFile('/map-tiles/hrcga.json')).toBe(false);
    expect(isPublicFile('/stylesheet.css')).toBe(false);
  });
});
