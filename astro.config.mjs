import mdx from '@astrojs/mdx';
import netlify from '@astrojs/netlify';
import node from '@astrojs/node';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, envField } from 'astro/config';
import { loadEnv } from 'vite';
import { singleMaplibreEsbuild, singleMaplibreVite } from './scripts/single-maplibre.mjs';
// Build-time i18n routing defaults. The live per-atlas config is resolved at
// request time (see src/middleware.ts + src/atlas/server.ts); this only seeds
// Astro's static i18n routing (the set of valid [lang] prefixes).
import config from './src/config.defaults.json';

const { locales, default_locale: defaultLocale } = config.i18n;
const { STATIC_BUILD } = loadEnv(process.env.STATIC_BUILD, process.cwd(), '');

// The Open Geographies platform deploys the server build to its own
// self-hosted SSR runtime (a standalone Node server), so SSR_ADAPTER=node
// selects the Node adapter. The default keeps upstream's Netlify adapter.
const useNodeAdapter = process.env.SSR_ADAPTER === 'node';

// Packages whose built JavaScript modules have no side effects on import
// (see vite.build.rollupOptions.treeshake below).
const SIDE_EFFECT_FREE_PACKAGES = /node_modules\/(@performant-software\/(core-data|geospatial|shared-components)|@peripleo\/(maplibre|peripleo))\/dist\//;

// https://astro.build/config
export default defineConfig({
  i18n: {
    defaultLocale,
    locales,
    routing: {
      prefixDefaultLocale: true
    }
  },
  output: STATIC_BUILD === 'true' ? 'static' : 'server',
  adapter: useNodeAdapter ? node({ mode: 'standalone' }) : netlify(),
  integrations: [mdx(), sitemap(), react()],
  vite: {
    build: {
      rollupOptions: {
        treeshake: {
          // Performant's and Peripleo's packages ship one module per file but
          // don't declare `sideEffects: false`, so Rollup keeps every module
          // their index imports — a citation processor, a Zotero translator,
          // OpenSeadragon, hls.js and spare MapLibre copies on a map page
          // that uses none of them. Their JavaScript is treated as free of
          // side effects (unused imports dropped); their CSS is kept.
          moduleSideEffects: (id) => !SIDE_EFFECT_FREE_PACKAGES.test(id) || /\.css(\?|$)/.test(id)
        }
      }
    },
    optimizeDeps: {
      esbuildOptions: {
        // Node.js global to browser globalThis
        define: {
          global: 'globalThis',
        },
        plugins: [singleMaplibreEsbuild()]
      },
      ssr: {
        noExternal: ['clsx', '@phosphor-icons/*', '@radix-ui/*']
      }
    },
    plugins: [singleMaplibreVite(), tailwindcss()],
    resolve: {
      // A single maplibre-gl instance app-wide: @peripleo/maplibre and
      // @allmaps/maplibre nest their own 4.7.1 copies, which breaks
      // module-global registries like maplibregl.addProtocol ('pmtiles' tiles
      // silently never load because the protocol is registered on a different
      // copy than the one rendering the map). Peripleo's build also bakes a
      // copy in, which dedupe can't reach: see scripts/single-maplibre.mjs.
      dedupe: ['maplibre-gl'],
      preserveSymlinks: true,
      mainFields: [
        'browser',
        'module',
        'main',
        'jsnext:main',
        'jsnext'
      ]
    }
  },
  env: {
    schema: {
      DISABLE_CACHE: envField.boolean({
        access: 'public',
        context: 'client',
        default: false,
        optional: true
      }),
      CONTENT_MODE: envField.string({
        access: 'public',
        context: 'client',
        default: 'update',
        optional: true
      }),
      PRELOAD_MAP: envField.boolean({
        access: 'public',
        context: 'client',
        default: false,
        optional: true
      }),
      STATIC_BUILD: envField.boolean({
        access: 'public',
        context: 'client',
        default: false,
        optional: true
      }),
      USE_CONTENT_CACHE: envField.boolean({
        access: 'public',
        context: 'client',
        default: false,
        optional: true
      })
    }
  }
});