import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Canary for ListView's workaround. core-data's SearchList prints the
 * number of items it was handed (not the search total) in its first child;
 * ListView hides that child with `[&>div:first-child]:hidden` and shows
 * ResultsCount (nbHits) instead. That was checked against the version
 * below. Before upgrading core-data, look at SearchList again
 * (src/components/SearchList.js in performant-software/react-components):
 * if the count line is still its first child, update the version here; if
 * not, change the selector in ListView (or use a `count` prop, if SearchList
 * has gained one, and drop the workaround).
 */
const VERIFIED_VERSION = '3.1.18';

describe('core-data SearchList workaround (ListView)', () => {
  it(`was checked against core-data ${VERIFIED_VERSION}`, () => {
    // Read by path: the package's "exports" don't include package.json.
    const file = new URL('../node_modules/@performant-software/core-data/package.json', import.meta.url);
    const { version } = JSON.parse(readFileSync(file, 'utf8'));

    expect(version, 'core-data was upgraded: re-check ListView\'s SearchList workaround (see this file)').toBe(VERIFIED_VERSION);
  });
});
