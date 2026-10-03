import { describe, expect, test, vi } from 'vitest';
import { createShowMoreGate } from '../src/apps/search/map/showMoreGate';

/**
 * The map's progressive loader asks for the next page once per response
 * (MapSearchProvider): a re-render of the same response asks again; a new
 * response — even of an identical search — must be able to ask.
 */
describe('one show-more per response', () => {
  const page0 = () => ({ page: 0, hitsPerPage: 20, _state: { query: 'house', page: 0 } });

  test('the same response re-rendered asks for the next page once', () => {
    const gate = createShowMoreGate();
    const showMore = vi.fn();
    const results = page0();

    gate.see(results);
    expect(gate.request(results, showMore)).toBe(true);
    gate.see(results); // re-render, same response
    expect(gate.request(results, showMore)).toBe(false);
    expect(showMore).toHaveBeenCalledTimes(1);
  });

  test('an identical search sent again (a retry, a letter typed and deleted) can ask again', () => {
    const gate = createShowMoreGate();
    const showMore = vi.fn();
    const first = page0();

    gate.see(first);
    gate.request(first, showMore); // page 1 asked for... and it never arrives

    const again = page0(); // the same search, a new response
    gate.see(again);
    expect(gate.request(again, showMore)).toBe(true);
    expect(showMore).toHaveBeenCalledTimes(2);
  });

  test('a callback still holding older results asks nothing', () => {
    const gate = createShowMoreGate();
    const showMore = vi.fn();
    const older = page0();
    const newer = { ...page0(), page: 1 };

    gate.see(older);
    gate.see(newer);
    expect(gate.request(older, showMore)).toBe(false);
    expect(gate.request(newer, showMore)).toBe(true);
    expect(showMore).toHaveBeenCalledTimes(1);
  });
});
