# Dev Backend Runbook

Domain: `https://api-dev.xoery.art`

Host: `root@178.105.151.143`

Directory: `/opt/otr/dev-backend`

Service/container: `backend` / `otr-dev-backend`

Always pass `-f deploy/dev-backend/compose.yml`; without it, Compose may discover the
unrelated `/opt/otr` AI/media project.

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
