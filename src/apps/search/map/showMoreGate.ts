/**
 * One "show more" per response received, for the map's progressive loader.
 *
 * `useProgressiveSearch` can ask twice for the same page (its effect runs
 * again when the same results re-render), and InstantSearch's showMore
 * requests the page after the one last *requested*: a second call skipped a
 * page, whose response the helper then dropped as outdated (a search with a
 * query and a filter listed 20 of 37).
 *
 * The gate is keyed on the results object itself, not on what it describes:
 * every response is a new object and a re-render keeps the same one, so an
 * identical search sent again (a letter typed and deleted, or a retry after
 * a failed page) opens the gate again instead of finding it closed.
 */
export const createShowMoreGate = () => {
  let current: unknown;
  let requested = false;

  return {
    /** The results being shown, on every render: a new response reopens the gate. */
    see(results: unknown) {
      if (results !== current) {
        current = results;
        requested = false;
      }
    },

    /** Asks for the next page once for these results; false when it already has (or they're no longer shown). */
    request(results: unknown, showMore: () => void) {
      if (results !== current || requested) {
        return false;
      }

      requested = true;
      showMore();
      return true;
    }
  };
};
