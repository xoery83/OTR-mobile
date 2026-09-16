# Public Dev Backend Deployment

Status: DEV-only deployment for `api-dev.xoery.art`.

Deployed and verified on 2026-09-16. Production was not accessed or modified.

## Architecture

```text
Mobile Release
  -> https://api-dev.xoery.art
  -> Caddy on 178.105.151.143:443
  -> 127.0.0.1:8787
  -> Docker container otr-dev-backend
  -> Hosted Supabase Dev (tuqigdxrvrerfewsxqgm)
```

The backend remains stateless. It validates Supabase-issued bearer tokens, writes only
through the approved Hosted Dev gateway, and stores receipt objects in the existing Dev
`ledger-receipts` bucket. Startup validates configuration but runs no migrations and
performs no database writes. The existing `/health` response contains only `status` and
the safe `development` environment name.

## Phase 0 Audit

- Backend entry point: `backend/src/server.ts`; Node HTTP server with TypeScript/Zod.
- Build: `npm ci`, then the checked-in `backend:build` script bundles the server with
  esbuild. Runtime: `node server.mjs` on Node 24.
- Default listener: `0.0.0.0:8787` inside the container. Docker publishes it only as
  `127.0.0.1:8787` on the host.
- Auth: bearer token validation is delegated to Supabase Dev Auth. Trip permissions are
  enforced server-side. `supabaseGateway.ts` hard-rejects every Supabase hostname except
  the approved Dev project.
- Filesystem: no persistent local filesystem dependency. Receipt content is stored in
  Supabase Dev Storage. The container root filesystem is read-only with `/tmp` as tmpfs.
- Logging: structured request id, redacted route, status, and duration only. Request
  headers, tokens, query content, and bodies are not logged.
- CORS: no browser CORS layer is required for the native Mobile client. No permissive
  browser origin was added.
- Server: Hetzner `otr-ai`, Ubuntu 24.04.4 LTS, Docker 29.1.3, Compose 2.40.3, Caddy
  2.6.2. Nginx is not installed. Existing services use localhost-only Docker ports and
  Caddy reverse proxying.
- Capacity at audit: 38 GB disk with 20 GB free; 3.7 GiB RAM with about 712 MiB
  available; no swap. The backend therefore uses one small bundled Node image and a
  384 MiB container limit.
- Network at audit: public listeners are SSH 22 and Caddy 80/443. `8787` was free.
  UFW is inactive; Docker nftables rules protect localhost-bound published ports.
- DNS: `api-dev.xoery.art` already resolves to `178.105.151.143`.
- TLS: Caddy owns automatic certificate issuance and HTTP-to-HTTPS redirect behavior.

## Server Layout

```text
/opt/otr/dev-backend/
  source/                 # deployment source snapshot and Compose file
  env/backend.env         # root:root, mode 0600, never committed
```

Container/service name: `otr-dev-backend` / `backend`.

## Required Server Variables

Only these names belong in `/opt/otr/dev-backend/env/backend.env`:

- `OTR_DEV_SUPABASE_URL`
- `OTR_DEV_SUPABASE_PUBLISHABLE_KEY`
- `OTR_DEV_SUPABASE_SECRET_KEY`
- `OTR_DEV_BACKEND_PORT`

`OTR_DEV_RECEIPT_OCR_ACCEPTANCE_FIXTURE` is optional and must remain `0` or absent for
normal Dev operation.

## Deploy Or Update

From a clean canonical checkout, copy a source snapshot without `.git`, local env files,
`node_modules`, native build output, or caches into `/opt/otr/dev-backend/source`, then
run:

```sh
cd /opt/otr/dev-backend/source
docker compose -f deploy/dev-backend/compose.yml build backend
docker compose -f deploy/dev-backend/compose.yml up -d backend
```

Validate Caddy before reloading it:

```sh
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

Do not run `docker compose down` from `/opt/otr`; that is the unrelated AI/media stack.
Always pass the explicit Dev Backend Compose path shown above because Compose otherwise
walks up to `/opt/otr` and may select that unrelated project.

## Operations

```sh
cd /opt/otr/dev-backend/source
docker compose -f deploy/dev-backend/compose.yml start backend
docker compose -f deploy/dev-backend/compose.yml stop backend
docker compose -f deploy/dev-backend/compose.yml restart backend
docker compose -f deploy/dev-backend/compose.yml ps
docker compose -f deploy/dev-backend/compose.yml logs --tail=100 backend
curl --fail http://127.0.0.1:8787/health
curl --fail https://api-dev.xoery.art/health
```

Docker uses `unless-stopped`. JSON logs are bounded to three 10 MB files.

## Rollback

Keep the previous source snapshot until the new health check passes. To roll back,
restore the previous `source` directory, rebuild `backend`, and run
`docker compose -f deploy/dev-backend/compose.yml up -d backend`. If only the proxy
change must be reverted, restore the Caddy backup, validate it, and reload Caddy. Never
restart unrelated containers.

## Mobile Online Dev Configuration

The ignored Mobile environment must contain:

```text
EXPO_PUBLIC_OTR_API_BASE_URL=https://api-dev.xoery.art
EXPO_PUBLIC_OTR_SYNC_TRANSPORT=dev
```

Mobile may contain the approved Supabase Dev URL and publishable key for Auth, but must
never contain `OTR_DEV_SUPABASE_SECRET_KEY` or another server credential.

To temporarily return to the Mac backend, change only the ignored
`EXPO_PUBLIC_OTR_API_BASE_URL` to the Mac's reachable LAN URL, keep transport `dev`, and
rebuild the app. Do not commit that address.

## Troubleshooting

- Public health fails: check DNS, `systemctl status caddy`, Caddy logs, then localhost
  health in that order.
- Localhost health fails: inspect `docker compose ps` and the bounded backend logs.
- Container exits during startup: verify all required variable names are present and
  that the URL is the approved Dev project; do not print values.
- `401`: refresh the Mobile Supabase Dev session. Token expiry is not logout and must
  not block cached local data.
- `403`: confirm Dev Journey membership; do not bypass backend authorization.
- `503`: confirm Hosted Dev availability and server egress before restarting anything.

Production is outside this deployment. There is no schema migration, Production
credential, Production endpoint, or Mobile-to-database path in this setup.

## Deployment Validation

- HTTPS `/health` returns 200; HTTP redirects to HTTPS.
- Caddy obtained a valid certificate for `api-dev.xoery.art`.
- Host port 8787 is reachable only on loopback and is blocked publicly.
- The container runs as `otr`, with read-only root filesystem, healthcheck, restart
  policy, memory limit, and bounded logs active.
- Restarting only `otr-dev-backend` recovered to healthy without changing UI Polish or
  Replay fixture counts. The shared Docker daemon and host were deliberately not
  restarted.
- Existing `ai.xoery.art` and `media.xoery.art` health checks remained successful.
- The Mac had no listener on port 8787 during Mobile acceptance. Simulator A,
  Simulator B, and the physical iPhone reached `/v2` through the public domain; Dev
  Auth and expired-token refresh passed.
- A created the single explicit UI Polish acceptance Expense through the normal
  repository/queue path. B and iPhone pulled it, iPhone updated it, and both Simulators
  converged. A then saved revision 4 while the container was stopped; its durable
  operation was `RETRYABLE`, then completed automatically after the container recovered.
  A, B, and iPhone all displayed the final revision.
- Background/foreground reconciliation, Journey switching, finalized UI Polish
  Settlement, and focused Transfer detail passed on Release builds.
- Final Hosted Dev counts were UI Polish: 134 Expenses, 1 Settlement, 7 Transfers,
  4 Payments, and 2 Discharges. The one-Expense increase is the explicit acceptance
  record. Replay remained read-only at 126 Expenses and zero Settlement lifecycle rows.
- Credential-free public-Dev Release builds were reinstalled on both Simulators and the
  physical iPhone after diagnostics. Bundle checks found the public URL and no actual
  test credential, server secret, localhost Backend, or old LAN Backend value.
- Request logs contain route templates, status, duration, and request IDs only; no auth
  token, Supabase secret, or sensitive payload was found.
