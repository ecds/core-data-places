import mdx from '@astrojs/mdx';
import netlify from '@astrojs/netlify';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, envField } from 'astro/config';
import { loadEnv } from 'vite';
import config from './public/config.json';

const { locales, default_locale: defaultLocale } = config.i18n;
const { STATIC_BUILD } = loadEnv(process.env.STATIC_BUILD, process.cwd(), '');

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
  adapter: netlify(),
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