/**
 * Path (guided tour) viewer — TinaCMS removed (migration step 3, "drop Tina").
 *
 * This previously rendered a TinaCMS "path" — a stepped sequence of places with
 * rich-text descriptions (`<TinaMarkdown>`) and live editing (`useTina`/
 * `tinaField`) over a map. Paths/longform move to the user's WordPress in
 * migration step 2 (and their content model is being reconsidered there), so
 * the Tina rich-text renderer no longer applies. The parent route (Path.astro)
 * 404s until that lands, so this stub is never rendered live; it exists only so
 * the bundle builds with no `tinacms` / `@root/tina` dependency. Step 2 replaces
 * it with the WordPress-backed viewer.
 */
const PathViewer = (_props: any) => null;

export default PathViewer;
