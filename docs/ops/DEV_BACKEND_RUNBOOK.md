# Dev Backend Runbook

Domain: `https://api-dev.xoery.art`

Host: `root@178.105.151.143`

Directory: `/opt/otr/dev-backend`

Service/container: `backend` / `otr-dev-backend`

Always pass `-f deploy/dev-backend/compose.yml`; without it, Compose may discover the
unrelated `/opt/otr` AI/media project.

## R3 accepted installation and remaining device gate

2026-10-08: Owner accepted same-project DEV `tuqigdxrvrerfewsxqgm`, CLOSED-only
`otr-r3-dev-v1` and forward `otr-r3-dev-v1-ledger-init-1`. Existing Backend last
verified development/ok; 36 Hosted checks and final preservation checks PASS.
No Backend deployment/configuration change was needed for the forward correction.

The original destructive cutover and forward SQL each committed once. Do not rerun
either, reset DEV, repair migration history, or use normal historical migration
replay to emulate this separate R3 lineage. Server1–84 source files remain immutable;
Hosted historical records remain68. Installed catalog/hash/provenance and bounded
fixtures are recorded in [forward record](../../supabase/dev-forward/r3-v1/README.md)
and [execution report](../architecture/OTR_R3_SAME_PROJECT_DEV_REBUILD_REPORT.md).

This closure authorizes documentation only: no restart/build/deploy or Hosted write.
Operational commands below are existing procedures, requiring their applicable
Owner authorization. Historical CP15B/Server84 sections are future reference;
R3 has not activated OPEN/discovery or providers. All relevant gates remain CLOSED.

Old device outboxes stay quarantined; do not replay/wipe/reset/logout/rebind or
re-enable clients under this acceptance. Device first-sync acceptance is a separate
Owner gate. Use only approved ordinary Account/Trip contracts for any future
synthetic continuation; no service-role financial seed bypass or legacy import.

## Check

```sh
curl --fail https://api-dev.xoery.art/health
ssh root@178.105.151.143
cd /opt/otr/dev-backend/source
docker compose -f deploy/dev-backend/compose.yml ps
curl --fail http://127.0.0.1:8787/health
```

## Operate Only This Service

```sh
docker compose -f deploy/dev-backend/compose.yml restart backend
docker compose -f deploy/dev-backend/compose.yml stop backend
docker compose -f deploy/dev-backend/compose.yml start backend
docker compose -f deploy/dev-backend/compose.yml logs --tail=100 backend
```

Expected server env names: `OTR_DEV_SUPABASE_URL`,
`OTR_DEV_SUPABASE_PUBLISHABLE_KEY`, `OTR_DEV_SUPABASE_SECRET_KEY`, and
`OTR_DEV_BACKEND_PORT`. Never print or commit their values.

## Update

Replace `/opt/otr/dev-backend/source` with a clean canonical source snapshot, then:

```sh
cd /opt/otr/dev-backend/source
docker compose -f deploy/dev-backend/compose.yml build backend
docker compose -f deploy/dev-backend/compose.yml up -d backend
curl --fail https://api-dev.xoery.art/health
```

Rollback by restoring the previous source snapshot and rebuilding only `backend`.
Do not reboot the host, run the root `/opt/otr` Compose project, or touch Production.

## CP15B-LIVE-W — CLOSED; future LIVE-1 prerequisites

No activation/deployment is authorized by the wiring checkpoint. Default examples
leave transport and one-shot disabled, all secrets and acceptance/session refs empty.
Required future steps: Owner's one-call approval; official current model/family and
currency/price revalidation; dedicated Mobile DEV key; dedicated trusted workload
issuer and exact DEV primary call-gateway session; current Account/Trip/material
admission; immutable price/scope/grant/monetary approval; persistent private custody
mount. Provisioning uses the private `FlightLiveProvisioning` contract, never a
synthetic verifier or generic service_role. The Web key is never reused.

The proposed first-call maximum remains **4,915,200 USD nanos / USD0.0049152**;
it is not seeded, selected or activated. Bind one acceptance session to exact
Account/task/attempt/call/request before starting. A new process reads that same
private binding and Server84 responsibility; it cannot recreate an ACK. No automatic
next call or next-day opening. Missing/corrupt custody or uncertain mark requires
inspection, never resetting/removing the mount or allocating a replacement call.

Before transport: kill/runtime/scope/grant/budget/current material and secret checks
must pass independently. After mark, revoke/abort only contains future work and
fences disclosure/install; it does not prove the provider stopped or undo incurred
usage. Preserve UNKNOWN/START/hold/raw response/result. Rotation requires kill/disable,
revoking the old dedicated key, protected nonlogging secret entry and separately
authorized container recreation; never print env files, process env or Docker env.

Local acceptance (fake secret; network-denied/injected HTTP only):

```sh
NODE_OPTIONS="--require=$PWD/scripts/cp15/live-w-network-deny.cjs" npx vitest run backend/src/flightLiveHost.test.ts backend/src/deepSeekFlight.test.ts backend/src/flightDevDispatch.test.ts src/data/interpretation/flightInterpretation.test.ts --configLoader runner --maxWorkers=1 --no-file-parallelism
```

The optional actual-root test requires a **new** task-owned Docker container named
`otr-live-w-server84`, network none, no published ports, exact84 replay and disposable
synthetic data. `LIVE_W_SERVER84=1` selects its production-composition E2E only.
`scripts/cp15/live-w-server84-fixture.py` is test-only fixture administration, never
an application/session connector and never a Hosted command.

Safe readback: use host `readback` under fresh current authorization for custody,
continuation/install, witness and nullable usage. Use existing protected
`external_integration_admin_report` with COST_READER and
`external_integration_recover_exact` with SUPPORT_RECOVERY for server-safe projections.
For missing hold/price/START details, only an already authorized, audited DEV database
operator may run the following explicit read-only projection with its single approved
opaque call ID. No table grants, service-role workaround or raw content query:

```sql
BEGIN READ ONLY;
SELECT call_id, environment, dispatch_state, execution_certainty, row_revision,
       dispatch_marked_at, terminal_observed_at, publication_fence,
       provider_id, model_id, model_version, price_schedule_id, safe_reason
FROM public.external_integration_calls
WHERE call_id=:'call_id'::uuid AND environment='DEV';
SELECT observation_id, observation_kind, status, input_tokens, output_tokens,
       total_tokens, cached_input_tokens, reasoning_tokens, usage_quality,
       cost_nanos, currency, cost_quality, price_schedule_id, provider_request_id,
       response_sha256, supersedes_observation_id
FROM public.external_integration_usage_events
WHERE call_id=:'call_id'::uuid ORDER BY received_at, observation_id;
SELECT call_id, scope_id, scope_revision, grant_revision, admission_day,
       input_ceiling, output_ceiling, worst_cost_nanos, currency, price_schedule_id,
       scope_sha256, execution_pins_sha256
FROM public.flight_call_resource_holds WHERE call_id=:'call_id'::uuid;
SELECT p.price_schedule_id, p.schedule_version, p.currency, p.schedule_sha256,
       p.source_reference, p.source_version, p.effective_from, p.effective_until,
       p.rounding_policy, u.unit_key, u.measurement_unit, u.unit_quantity,
       u.price_per_quantity, u.unit_definition
FROM public.external_integration_calls c
JOIN public.external_integration_price_schedules p
  ON p.price_schedule_id=c.price_schedule_id
JOIN public.external_integration_price_schedule_units u
  ON u.price_schedule_id=p.price_schedule_id
WHERE c.call_id=:'call_id'::uuid AND c.environment='DEV'
ORDER BY u.unit_key;
SELECT count(*) AS starts FROM public.external_integration_usage_events
WHERE call_id=:'call_id'::uuid AND observation_kind='START';
COMMIT;
```

These instructions are future procedures, not evidence of Hosted readback or call
activation. No Admin Portal is added. Response-model policy version
`deepseek-flash-live0-20261007-v1` permits exact returned `deepseek-flash` or
`DeepSeek-V4.1-Flash`, requires a witness, and rejects all other identifiers. This
is a reviewed alias-family conformance policy; LIVE-1 must check current official
Chat API/models/pricing documentation before relying on it.

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

## R3-A3A dormant host-mode alternative — deployment not authorized

The standalone `compose.host.yml` preserves exact127.0.0.1:8787 application binding,
but requires an explicitly reviewed immutable image. Compose it with the accepted private API-key cutover override **before** a private
literal-ID copy of `compose.host-image.yml`; never merge the bridge file into forward
startup. The credential override currently pins the Bridge image, so the independently
reviewed forward image override must be last.
The original bridge profile and Dockerfile remain unchanged. No Driver, Auth or
Transport change is part of these F1/F2 corrections.

### Required Caddy administration prerequisite

The current DEV workflow uses `systemctl reload caddy`, whose ExecReload calls the
Admin API. `admin off` would break that workflow and require restarts for later
configuration changes. Retain reload through a permissioned Unix socket instead.
Before any host-mode Backend deployment, separately authorize these Caddy changes:

- Add `admin unix//run/caddy-admin/admin.sock` inside the existing Caddyfile global
  options block (create that block only if absent), with `origins localhost ""` in the
  admin sub-block for operator requests using Host localhost and the installed
  Caddy2.6.2 reload CLI, which sends an empty Host on Unix sockets. Preserve every site, upstream,
  TLS, certificate-storage and logging directive, including127.0.0.1:8787.
- Install `deploy/dev-backend/caddy-admin-isolation.conf` as
  `/etc/systemd/system/caddy.service.d/admin-isolation.conf`, root:root0644. It creates
  a caddy-owned0700 RuntimeDirectory, applies UMask0077 and replaces ExecReload with
  an explicit Unix address. Host caddy is UID996/GID988; reattest rather than assume
  those numeric IDs on another host. Backend UID10001 must not join that group.
- Require `/etc/caddy` root:root0755 and Caddyfile root:caddy0640 (follow the Caddyfile symlink and validate its target/ancestors; the
  observed target is root:root0644). No Backend mount of the socket, directory, Caddy config, certificate
  state, host `/run`, Docker/containerd sockets or host root is allowed.
- Back up Caddyfile, unit/drop-ins and original metadata privately; validate the
  candidate config and systemd unit before a separately approved maintenance window.
  Applying RuntimeDirectory/UMask requires daemon-reload and a Caddy service restart
  in this procedure. This interrupts **all Caddy sites**, not only DEV Backend;
  active connections can end. No zero-downtime or measured-duration claim.
- After restart require no TCP Admin listener on any host address, socket/ancestor
  ownership and permissions, Backend-UID denial, authorized operator GET/reload using
  the Unix address, public verifiedHTTPS/health/Auth and other-site checks.
  `systemctl reload caddy` remains supported by the drop-in; root may use
  `caddy reload --config /etc/caddy/Caddyfile --force --address unix//run/caddy-admin/admin.sock`.
- Inventory all host-local TCP/UDP and Unix/abstract listeners. An equivalent
  unauthenticated privileged management endpoint is a STOP condition. Keep Docker
  and containerd control sockets unmounted; host mode does not share their filesystem.

No live Caddy edit, unit installation, restart or reload is authorized here.
Caddy rollback must occur while Backend remains on bridge: if host Backend has been
started, first stop it and complete immutable bridge rollback. Only then restore the
accepted Caddyfile/unit backup, validate and restart in an approved all-site window.
Do not restore TCP administration while host Backend is running. Retain safe config
ownership/mode and the reviewed original symlink layout. Symlink0777 is not
world-writable target-file evidence.

### Immutable forward preflight and replacement

Use exact DEV host178.105.151.143 and cwd `/opt/otr/dev-backend/source`. The following
commands are a future procedure, **not deployment authorization**. Obtain the new
image ID from independently reviewed build/source evidence; do not infer acceptance
from a tag or from passing health. Build/stage it before stop, retain the original
source/profile and immutable rollback image, and set the Owner maintenance timeout.

1. Record all containers/networks, Caddy/config/unit/Compose hashes, sockets/routes,
   sysctls and normalized firewall baseline. Verify existing container belongs to
   project `dev-backend`, with exactly the expected original image and bridge profile.
   Confirm the Caddy prerequisite above is already accepted. Verify the accepted
   private `api_key_override=/opt/otr/dev-backend/env/backend-api-key.cutover.yml`
   and `credential_file=/opt/otr/dev-backend/env/backend.rotated.env`, root:root0600,
   regular/no symlinks/single links beneath root:root0700 custody. Freeze their
   identity/selection through startup without printing contents. Original `backend.env`
   retains the exposed credential and must never be selected, forward or rollback.
   Future rotation requires separate verified private publication/consumer acceptance
   and explicit approved `backend.rotated.<version>.env` contract; never infer a file
   from a glob, silently accept a stale selection or render credential values.
   Owner confirms old Modern key deletion; authoritative verification PENDING and
   authenticated member Ledger bootstrap DEFERRED. Repeat disposable
   credential-free Direct IPv6/TLS positives and hostname/chain negatives.
2. Set `OTR_DEV_BACKEND_REVIEWED_IMAGE_ID` to the exact accepted new `sha256:<64 lowercase hex>`
   and `rollback_image` to the exact retained old image ID. Neither is a credential.
   Both images must already exist. Reject equal IDs; the old wildcard image must never
   run in host mode. The host profile has no build fallback and fails without the
   explicit variable. Stage a private copy of `compose.host-image.yml` with that reviewed ID literally;
   the repository template intentionally contains an invalid placeholder.
3. Resolve **both forward files together**, with `--no-env-resolution --no-interpolate`, excluding
   credential-bearing env-file values, then validate **before stopping anything**:

   ```sh
   set -eu
   cd /opt/otr/dev-backend/source
   umask 077
   api_key_override=/opt/otr/dev-backend/env/backend-api-key.cutover.yml
   credential_file=/opt/otr/dev-backend/env/backend.rotated.env
   export OTR_DEV_BACKEND_REVIEWED_IMAGE_ID
   # forward_image_override is the private, reviewed literal-image file.
   test "$(docker image inspect "$OTR_DEV_BACKEND_REVIEWED_IMAGE_ID" --format '{{.Id}}')" = "$OTR_DEV_BACKEND_REVIEWED_IMAGE_ID"
   test "$(docker image inspect "$rollback_image" --format '{{.Id}}')" = "$rollback_image"
   docker compose -p dev-backend -f deploy/dev-backend/compose.host.yml -f "$api_key_override" -f "$forward_image_override" config --no-env-resolution --no-interpolate --format json > /opt/otr/dev-backend/env/otr-reviewed-host-config.json
   node scripts/dev/backend-host-image-check.mjs "$OTR_DEV_BACKEND_REVIEWED_IMAGE_ID" "$rollback_image" "$credential_file" host < /opt/otr/dev-backend/env/otr-reviewed-host-config.json
   ```

   On this installed Compose version, `--no-env-resolution` alone still resolves
   service env-file values; both flags are mandatory. Never render resolved credentials.
   The checker requires only Backend, project `dev-backend`, exact reviewed ID distinct
   from rollback, host mode, no build/ports/networks, exact loopback HTTP variables and
   exactly one required env-file matching the explicitly verified rotated credential path.
   Missing/stale/mixed/wrong credential selection or override order rejects before stop.
   Config does not resolve secret values.
   Inspect retained limits/read-only/tmpfs/user/health/log parity separately. Freeze the
   reviewed files/variables through startup; any drift requires repeating preflight.

Before maintenance, syntax-check the maintained combined acceptance probe:
`node --check scripts/dev/backend-host-private-smoke.cjs`. Use its exact checked
bytes inside the accepted running container (`docker exec -i otr-dev-backend node
-e '<checked public script source>'`), with only the approved public CA on stdin.
The credential stays in the already configured container; never pass it in command
arguments or render its environment. The probe discards API response bodies and
emits only status/connectivity results. Execute it only under deployment acceptance
authorization, not as part of a source-only diagnosis. Do not rebuild an inline copy.

Snapshot the replaced Backend's host-side veth identity before stop and the new
attachment after startup/rollback. Preservation may exclude only those attested
service-owned interfaces and their routes; compare every unrelated veth, interface,
route, network and host setting exactly. Do not discard all veth entries. The retained
one-time retry controller must call `preserved()` from
`scripts/dev/backend_host_network_guard.py` using fresh reciprocal namespace peer
indexes, endpoint ID/MAC/IP and bridge attestation before stop and after rollback.
For an instrumented attempt, call `preserved_with_evidence(before, after, direction,
backup)` instead of the raw `preserved()` call in both forward and rollback paths.
The backup must be a fresh owner0700 directory. Before evaluating the guard, this
wrapper writes/fsyncs bounded sanitized interface projections to exclusive0600
`preservation-<direction>-interfaces.json`. The wrapper also writes sanitized bounded container inputs to
`preservation-<direction>-containers.json`. Every comparison failure writes/fsyncs
`preservation-<direction>-mismatch.json` before raising the unchanged assertion.
Container records include ID, collected name (or explicit not_collected/redacted),
ownership, normalized field path, presence/type and safe before/after values.
Addresses/routes, Docker networks, firewall, sysctls and daemon use the same bounded
diff of their actual normalized comparison operands. Validation failures use clearly
marked snapshot context, not an assertion of which operand caused the failure.
Limits:32 rows,4096 visited nodes,128 keys/list items per traversal, exclusive0600
file and256KiB cap; truncation explicit. Unsafe values/keys redact. Firewall rules,
mount paths and arbitrary labels are not printed. Evidence failure never permits PASS.
The prepared controller collects Docker .Name and persists fixed phase/assertion/
timestamp before rollback for failures outside the snapshot guard as well.
Read/emit that bounded mismatch record before entering automatic rollback; retain
both files. Do not reuse a prior evidence filename or print a raw full snapshot,
resolved environment, arbitrary unknown field or exception. Diagnostics include
normalized field path, safe expected/observed values, interface ownership and indexes;
unknown values redact and truncation is explicit. Diagnostic failure never authorizes
acceptance or suppression of preservation failures. All existing guard rules remain.

The sole-port bridge's derived carrier/linkdown state may follow that attachment;
its administrative UP, MTU, MAC, addresses and routes remain unchanged. Only the
three exact Docker-managed8787 publication rules may disappear in Host mode and
return in Bridge mode; unrelated firewall rules/policies remain exact. No firewall
configuration command belongs to this procedure.

4. In the separately approved Backend maintenance window, stop only the old service:
   `docker compose -p dev-backend -f deploy/dev-backend/compose.yml stop backend`.
   Confirm8787 free, then use exactly the validated forward files and values:
   `docker compose -p dev-backend -f deploy/dev-backend/compose.host.yml -f "$api_key_override" -f "$forward_image_override" up -d --no-build --pull never backend`.
   No broad down, unrelated service, tag movement, rebuild, pull, Docker restart or
   live Caddy reload belongs to this Backend replacement step.
5. Immediately assert `docker inspect otr-dev-backend --format '{{.Image}}'` equals
   the accepted new ID; assert project/service, host mode/no published ports and one
   actual application listener127.0.0.1:8787. Require Docker health plus local and
   verified-publicHTTPS health200, protected401 and independent publicIPv4/IPv6 ingress
   negatives. Repeat Caddy Admin denial/operator access and Direct IPv6/TLS. Any identity,
   bind, health, exposure, deadline or preservation failure triggers rollback.

Downtime runs from Backend stop to validated startup. Requests may502/terminate;
there is no graceful-drain or zero-downtime certification. Actual combined host8787
startup and public replacement acceptance remain pending because the old Backend
currently owns that port.

### Immutable bridge rollback

Stop only candidate Backend using the exact forward project/files; confirm8787 free.
Restore the retained original source/bridge profile at its original directory layout.
Use a private **single-service literal** override:

```yaml
services:
  backend:
    image: sha256:<retained-old-image-id>
```

Resolve the original bridge file, accepted private API-key override, then this
rollback image override last, using both
`--no-env-resolution --no-interpolate`, without env-file values;
assert exact old ID, bridge networking, no host mode and original127.0.0.1:8787
publishing before starting. Validate with the same checker in `bridge` direction:

```sh
docker compose -p dev-backend -f deploy/dev-backend/compose.yml -f "$api_key_override" -f "$rollback_image_override" config --no-env-resolution --no-interpolate --format json > /opt/otr/dev-backend/env/otr-reviewed-bridge-config.json
node scripts/dev/backend-host-image-check.mjs "$OTR_DEV_BACKEND_REVIEWED_IMAGE_ID" "$rollback_image" "$credential_file" bridge < /opt/otr/dev-backend/env/otr-reviewed-bridge-config.json
```

The checker requires the exact approved rollback image, original default Bridge and
loopback publishing, no Host HTTP overrides, sole Backend and exclusive rotated env.
Never drop the private credential override or start base-only Compose. Use explicit `-p dev-backend`, all three rollback `-f` paths in that order,
`up -d --no-build --pull never backend`. Inspect the actual started `.Image` again,
bridge attachment, published port, health/Caddy and unrelated-container/host baseline.
Never use the forward image variable/host profile for rollback, rebuild the old image,
rely on a mutable tag, prune the bridge or modify credentials to make checks pass.
Caddy Unix isolation can remain in place during Backend rollback. Remove only private
preflight files after evidence retention; no deployment command ran in the correction.

### Attested Backend bridge carrier flag — R3-A3A correction

The empty attested dev-backend bridge may add NO-CARRIER after its Backend veth
is removed. The guard validates administrative UP, operstate/LOWER_UP against
remaining ports and rejects NO-CARRIER on an active bridge. Only this bridge's
empty-port NO-CARRIER is normalized; all other flags/fields and unrelated
interfaces remain exact. Rollback attests the fresh peer and validates restored
carrier. Persist diagnostics before rollback; never suppress unrelated drift.
