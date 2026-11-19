# Renderer deploy assets (core-data-places)

The **Open Geographies SSR renderer** is a stateless, multi-tenant Astro + Node
app. One image serves **every** atlas: the middleware resolves a slug from the
`Host` subdomain (`<slug>.<OG_BASE_DOMAIN>`) and fetches that atlas's bundle from
Core Data per request. It holds **one secret**, a read-only Elasticsearch API key,
read from the environment on the server and never sent to the browser (searches
go through the renderer's own `/api/search.json`, which adds each atlas's project
filter).

> ⚠️ **Unvalidated against AWS.** The stack passes `cfn-lint` and the image builds,
> but neither has been applied to a live AWS account.

## Files

| File | What |
|---|---|
| `../Dockerfile` | Multi-stage build, `node:24-bookworm-slim`: `npm ci`, `npm run build:server` (SSR build + precompressed assets), then `scripts/serve.mjs` on `:8080`, which serves the Brotli/gzip copies of `/_astro/*`. Container `HEALTHCHECK` on `/health`. |
| `og-renderer.cfn.json` | CloudFormation stack, after ECDS's FairData template: execution and task roles, log group, target group (`GET /health`), a host-header listener rule, task definition and Fargate service with ECS Exec and circuit-breaker rollback. |
| `../.github/workflows/deploy-renderer.yml` | On push to `main`: tests, then build, push `og-renderer:stable` to ECR and force a new deployment of the `og-renderer` service. |

## Wiring it up (ECDS)

1. Create the ECR repository `og-renderer` and the renderer's secret (the read-only
   Elasticsearch key) in Secrets Manager.
2. Create the stack from `og-renderer.cfn.json` with `DockerImageVersion=stable`. Its
   parameters include the ECR image URI, the VPC, subnets and security groups, the
   shared ALB's HTTPS listener and a free rule priority, and the secret's full ARN.
3. Add the repository secrets `AWS_ROLE` (the GitHub OIDC deploy role) and
   `ECR_REGISTRY`. Until both exist, the workflow runs the tests and skips the deploy.

The stack owns the task definition: change settings by updating the stack, not
in the console. A deploy only pushes the image tag and restarts the service.

A dev service (`og-renderer-dev`, tag `latest`, from a `develop` branch) can be
added later as a second stack. It needs its own domain and certificate, since
`*.opengeographies.org` doesn't cover `*.dev.opengeographies.org`.

## Key env vars (set by the stack)

- `OG_BASE_DOMAIN` — apex domain; the middleware strips it to derive the slug. **Required.**
- `OG_CONSOLE_URL` — the Core Data console as the renderer reaches it. The server-side
  bundle fetch sends this as its `Host` header. **Required.**
- `OG_ELASTICSEARCH_URL` — the search index. **Required**: without it every search answers
  503 "Search is not configured".
- `OG_ELASTICSEARCH_API_KEY` — **secret** (Secrets Manager). A **read-only** key covering
  `open_geographies_v1*`, so it includes each atlas's own index
  (`open_geographies_v1_project_<id>`).
- `OG_TILE_SERVER` — optional: a vector tile server atlases load through their own address
  (`/map-tiles/<name>.json`). ECDS's is `https://pmtiles.ecds.io`.
- `OG_ATLAS_CACHE_TTL_MS` — bundle cache TTL; tune up to 60–120 s in prod to cut console load.
- `OG_ATLAS_ERROR_TTL_MS` / `OG_ATLAS_FETCH_TIMEOUT_MS` / `OG_WORDPRESS_TIMEOUT_MS` — resilience knobs.
- **Do not set `OG_SITE_SLUG`** — that pins the renderer to a single atlas.

The full checklist (proxy and CDN rules, TLS, caching, monitoring) is `PRODUCTION.md` in
[ecds/open-geographies-engine](https://github.com/ecds/open-geographies-engine/blob/main/PRODUCTION.md).

## Deploy preconditions (from the security review)

- **Restrict the task's egress** (no IMDS, no internal-network reach beyond the
  Core Data console, Elasticsearch and, if set, `OG_TILE_SERVER`). The WordPress fetch is SSRF-hardened in code, but defense in
  depth at the SG/egress layer matters because the renderer fetches tenant-supplied
  WordPress hosts.
- Have the **edge (ALB) strip any inbound `X-Atlas-Slug`** header from client
  requests (it's a trusted-proxy override only).
- If Core Data enables host-authorization, its `config.hosts` must permit the
  hostname in `OG_CONSOLE_URL` (else 403 → blank render).
