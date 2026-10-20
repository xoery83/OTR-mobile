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

## CP15B-LIVE-W optional CLOSED wiring contract

The checked-in `.env.backend.example` adds names only: dedicated
`OTR_DEV_DEEPSEEK_API_KEY`, `OTR_DEV_FLIGHT_REMOTE_TRANSPORT`,
`OTR_DEV_FLIGHT_ONE_SHOT`, private custody directory, acceptance session/Account/task/
attempt/call/request digest and dedicated workload/SQL session logical references.
Both gates default `disabled`; all credential/identity/reference values are empty.
No new secret is read or provisioned by this checkpoint. The existing actual
`/opt/otr/dev-backend/env/backend.env`, Docker, Caddy and databases were not edited.

`compose.flight-custody.closed.yml` is an optional future DEV-only mount template,
not enabled by normal Compose. LIVE-1 must explicitly provision its private host
source directory with owner UID10001 and mode0700 and set the private target directory
`/var/lib/otr/dev-flight`. Never use `/tmp`, tmpfs or the ephemeral read-only container
root for durable custody. Keep the mount across recreation/restart; never erase it
to reopen an acceptance session. No mount/deployment action was performed here.

Normal startup supplies no actual issuer/session/workflow provisioning and remains
CLOSED even if someone sets the host flags/key. The trusted provisioning contract
requires a dedicated authenticated workload verifier and exact dedicated call-gateway
SQL connection; no driver/credential/issuer is synthesized from broad Dev secrets.
Real provisioning remains for LIVE-1. The Backend build now includes the pure domain
and Account-context source required by the CLOSED composition.

### Linux-only anchored custody and restart admission

Real provider filesystem custody requires Linux Node24, genuine procfs and successful
runtime capability tests under UID10001 (use the built image's actual GID; currently999).
Container ancestors are walked from `/` through retained parent descriptors: no symlink,
root/service owner, no group/other write; final root must be service-owned0700.
All generated leaves are opened/linked/unlinked through the retained root FD. File0600,
bounds/hash/schema/association and both file/directory fsync remain enforced.
An existing instance continues on its original inode after rename/parent retargeting;
it never switches namespaces. Deleted/nonprivate admitted roots deny operations.

Before starting any future authorized container, independently provision host bind source
`/opt/otr/dev-backend/private/flight-custody` and container mount `/var/lib/otr/dev-flight`.
The override uses `create_host_path: false`; Docker must not create an empty substitute.
Provide a private0600 `store-identity.json` containing exactly
`{"version":1,"store_id":"<provisioned opaque UUID>"}`. Supply the expected UUID plus
mount device/inode through trusted `FlightLiveProvisioning.custody.identity` outside
that replaceable root, and the exact retained request pin through `requiredRequest`.
The app never initializes that marker or obtains its expected identity from the marker.
Startup verifies marker, current mount metadata, runtime capabilities and required
request bytes before constructing transport. Do not infer new expected values from a
replacement mount. Reboot/restore may need separately authorized host reattestation of
metadata and retained associations; device/inode alone is not durable store identity.
Absent continuity/content leaves transport CLOSED and responsibility UNKNOWN, with no
hold release/reset/replacement call/replay. No new dispatch journal is added.

Host bind-source ancestors/ACLs are operator provisioning responsibility; container
admission cannot certify them. No protection is claimed against compromised host root,
Docker administrators or malicious Backend-UID code. Use read-only root, dedicated
writable mount, normal private procfs/PID namespace, no privileged/extra capabilities;
the optional override drops ALL. macOS/Windows reject real filesystem custody.
Protocol tests can explicitly inject test custody and intercepted HTTP; startup never
uses that seam. Capability failure never falls back to pathname custody.
