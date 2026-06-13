import mdx from '@astrojs/mdx';
import netlify from '@astrojs/netlify';
import node from '@astrojs/node';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, envField } from 'astro/config';
import { loadEnv } from 'vite';
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
    optimizeDeps: {
      esbuildOptions: {
        // Node.js global to browser globalThis
        define: {
          global: 'globalThis',
        },
      },
      ssr: {
        noExternal: ['clsx', '@phosphor-icons/*', '@radix-ui/*']
      }
    },
    plugins: [tailwindcss()],
    resolve: {
      // A single maplibre-gl instance app-wide: @peripleo/maplibre and
      // @allmaps/maplibre nest their own 4.7.1 copies, which breaks
      // module-global registries like maplibregl.addProtocol ('pmtiles' tiles
      // silently never load because the protocol is registered on a different
      // copy than the one rendering the map).
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