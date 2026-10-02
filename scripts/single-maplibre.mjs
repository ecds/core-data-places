import fs from 'node:fs';
import path from 'node:path';

/**
 * One MapLibre on the page.
 *
 * @peripleo/maplibre's build bakes in its own copy of MapLibre GL (4.7.1),
 * reached through a one-line module that does `export { require() as m }`.
 * The app imports `maplibre-gl` too (PMTilesLayer registers the pmtiles://
 * protocol on it), so the map page shipped two MapLibres, and a protocol
 * registered on the app's copy never reached the copy drawing the map
 * (`resolve.dedupe` can't merge code baked into a package's build).
 *
 * This serves that one-line module as a re-export of the app's `maplibre-gl`
 * instead, so Peripleo's map, the app's layers and the pmtiles protocol share
 * one instance and the baked-in copy is dropped. It matches by content — a
 * module that only requires a file carrying MapLibre's license header — so a
 * Peripleo release that bundles differently is simply left alone.
 *
 * Used by the build (Vite plugin) and by `astro dev`'s dependency
 * pre-bundling (esbuild plugin), so both behave the same.
 */
const PERIPLEO_DIST = /[\\/]node_modules[\\/]@peripleo[\\/]maplibre[\\/]dist[\\/][^\\/]+\.js$/;
const REQUIRE_ONLY = /^import \{ __require as (\w+) \} from "\.\/([\w.-]+\.js)";\s*var (\w+) = \1\(\);\s*export \{\s*\3 as (\w+)\s*\};/;

const shimFor = (file) => {
  if (!PERIPLEO_DIST.test(file)) {
    return null;
  }

  try {
    const match = fs.readFileSync(file, 'utf8').match(REQUIRE_ONLY);
    if (!match) {
      return null;
    }

    const required = fs.readFileSync(path.join(path.dirname(file), match[2]), 'utf8').slice(0, 2000);
    if (!required.includes('MapLibre GL JS')) {
      return null;
    }

    return `import maplibregl from 'maplibre-gl';\nexport { maplibregl as ${match[4]} };\n`;
  } catch {
    return null;
  }
};

export const singleMaplibreVite = () => ({
  name: 'og-single-maplibre',
  enforce: 'pre',
  load(id) {
    return shimFor(id.split('?')[0]);
  }
});

export const singleMaplibreEsbuild = () => ({
  name: 'og-single-maplibre',
  setup(build) {
    build.onLoad({ filter: PERIPLEO_DIST }, (args) => {
      const contents = shimFor(args.path);
      return contents ? { contents, loader: 'js', resolveDir: path.dirname(args.path) } : undefined;
    });
  }
});
