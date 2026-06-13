/**
 * Post body renderer — TinaCMS removed (migration step 3, "drop Tina").
 *
 * This previously rendered a TinaCMS post's rich-text body (`<TinaMarkdown>`)
 * with live editing (`useTina`/`tinaField`) and inline place/media/visualization
 * inserts. Posts move to the user's WordPress in migration step 2 and arrive as
 * HTML (the `WordPressContent.astro` pattern: `set:html`), so the Tina rich-text
 * renderer no longer applies. The parent route (Post.astro) 404s until those
 * WordPress reads land, so this stub is never rendered live; it exists only so
 * the bundle builds with no `tinacms` / `@root/tina` dependency. Step 2 replaces
 * it with the WordPress post renderer.
 */
const PostContent = (_props: any) => null;

export default PostContent;
