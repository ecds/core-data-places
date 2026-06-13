# syntax=docker/dockerfile:1
#
# Multi-tenant Open Geographies SSR renderer.
#
# One image serves EVERY atlas: at request time the middleware resolves a slug
# (from the Host subdomain in production — `<slug>.<OG_BASE_DOMAIN>`) and fetches
# that atlas's config/branding/navigation from the Core Data console
# (OG_CONSOLE_URL) per request. The image is therefore stateless and carries no
# atlas/slug, so it scales horizontally behind a load balancer with wildcard DNS.
#
#   docker build -t og-renderer .
#   docker run -p 8080:8080 \
#     -e OG_BASE_DOMAIN=opengeographies.org \
#     -e OG_CONSOLE_URL=https://coredata.opengeographies.org \
#     og-renderer
#
# Omit OG_SITE_SLUG for the multi-tenant deploy; set it only to pin one atlas
# (single-tenant). Liveness probe: GET /health (200, no console call).

# ---- build stage: install deps + produce the standalone Node server ----
FROM node:24-bookworm-slim AS build
WORKDIR /app

# Deps first for layer caching. patch-package runs in `npm ci`'s postinstall and
# needs patches/ present, so copy it before the install.
COPY package.json package-lock.json ./
COPY patches ./patches
RUN npm ci

# Build the standalone Node SSR server. astro.config selects @astrojs/node when
# SSR_ADAPTER=node; output defaults to 'server'. We call `astro build` directly
# rather than the npm "build" script, which runs the retired scripts/build.mjs —
# `astro build` alone is the proven keystone build.
COPY . .
ENV NODE_ENV=production
ENV SSR_ADAPTER=node
RUN node_modules/.bin/astro build

# Slim node_modules now that the build is done — the standalone server loads
# none of this. The Netlify adapter + CLI exist only for the (unused) Netlify
# build path; netlify-cli alone is ~840 MB and drags in solana/viem/hermes.
# `npm uninstall` is dependency-aware, so it also drops their exclusive
# transitive deps while keeping anything a runtime package still needs. Then
# prune the remaining devDependencies (astro/vite/vitest/playwright/…).
# (Runs only inside the image build; the committed package.json is untouched.)
# Netlify (unused build path) + Clerk (console auth — the public renderer's built
# server imports neither; client islands that use Clerk are already bundled into
# dist/client). Removing Clerk also sheds its web3 deps (solana/viem). react-icons
# is build-only too (icons are bundled at build). All confirmed 0 server-side
# imports; @astrojs/node externalizes node_modules, so 0 refs = safe to drop.
RUN npm uninstall --ignore-scripts \
      netlify-cli @netlify/functions @netlify/edge-functions @astrojs/netlify \
      @clerk/backend @clerk/clerk-js @clerk/ui \
 && npm prune --omit=dev \
 && rm -rf node_modules/react-icons node_modules/@solana-mobile node_modules/viem

# ---- runtime stage: Node + the built server + its production deps ----
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

# @astrojs/node standalone externalizes dependencies, so the (pruned, prod-only)
# node_modules tree ships alongside dist/.
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

EXPOSE 8080
CMD ["node", "./dist/server/entry.mjs"]
