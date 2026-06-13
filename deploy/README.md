# Renderer deploy assets (core-data-places)

The **Open Geographies SSR renderer** is a stateless, multi-tenant Astro + Node
app. One image serves **every** atlas: the middleware resolves a slug from the
`Host` subdomain (`<slug>.<OG_BASE_DOMAIN>`) and fetches that atlas's bundle from
Core Data per request. It holds **no secrets** — the Typesense host and per-atlas
search-only key are embedded in the atlas bundle the console emits.

> ⚠️ **Unvalidated against AWS.** These templates were authored and statically
> validated (JSON/YAML parse, `docker build` of the image) but **not** applied to a
> live AWS account. Treat ARNs, account IDs, regions, cluster/service names, and
> subnet/SG IDs as placeholders to fill in. See the parent repo's
> `deploy-templates/` for the shared infra (ECR, ALB, ACM wildcard, Route 53) and
> the full env-var reference, and `EMORY_HANDOFF.md` for the deploy plan (WS2).

## Files

| File | What |
|---|---|
| `../Dockerfile` | Multi-stage build, `node:24-bookworm-slim`, `SSR_ADAPTER=node astro build` → standalone server on `:8080`. **Already proven** (`og-renderer:slim`, ~1.97 GB). |
| `ecs-task-def.renderer.json` | ECS Fargate task definition. Port 8080, `/health` node-based container healthcheck, env only (no `secrets`). |
| `../.github/workflows/deploy-renderer.yml` | `workflow_dispatch`-only deploy: build → push ECR → render task def → deploy ECS. Environment-gated (`staging`/`production`). |

## Wiring it up (Emory)

1. Create ECR repo `og-renderer` and an ECS cluster + service behind the wildcard
   ALB (see `deploy-templates/`).
2. In repo **Settings → Environments**, create `staging` and `production`
   (add required reviewers on `production`). Per environment set repo **variables**:
   `AWS_REGION`, `AWS_DEPLOY_ROLE_ARN` (OIDC), `ECR_REPOSITORY=og-renderer`,
   `ECS_CLUSTER`, `ECS_SERVICE`.
3. **Settings → Actions → run "Deploy renderer"**, pick the environment.

## Key env vars (see `ecs-task-def.renderer.json`)

- `OG_BASE_DOMAIN` — apex domain; the middleware strips it to derive the slug. **Required.**
- `OG_CONSOLE_URL` — **internal** Core Data URL (private ALB / service-discovery
  name). The server-side bundle fetch sends this as its `Host` header. **Required.**
- `OG_ATLAS_CACHE_TTL_MS` — bundle cache TTL; tune up to 60–120 s in prod to cut console load.
- `OG_ATLAS_ERROR_TTL_MS` / `OG_ATLAS_FETCH_TIMEOUT_MS` / `OG_WORDPRESS_TIMEOUT_MS` — resilience knobs.
- **Do not set `OG_SITE_SLUG`** — that pins the renderer to a single atlas.

## Deploy preconditions (from the security review)

- **Restrict the task's egress** (no IMDS, no internal-network reach beyond the
  Core Data console). The WordPress fetch is SSRF-hardened in code, but defense in
  depth at the SG/egress layer matters because the renderer fetches tenant-supplied
  WordPress hosts.
- Have the **edge (ALB) strip any inbound `X-Atlas-Slug`** header from client
  requests (it's a trusted-proxy override only).
- If Core Data enables host-authorization, its `config.hosts` must permit the
  hostname in `OG_CONSOLE_URL` (else 403 → blank render).
