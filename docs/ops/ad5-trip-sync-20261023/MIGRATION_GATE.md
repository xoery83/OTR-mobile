# Structured new Trip — proposed exact DEV Gate (NOT AUTHORIZED)

Candidate code a2323395 + f40466a2; final SQL protection 9017e2694c7c3434be4778ee44a434df3fa6351d.
No DEV connection, installation, Auth operation, permission activation or deployment occurred in this task.

## Artifacts and prerequisites

- Only DEV project `tuqigdxrvrerfewsxqgm`. Existing Backend deployment/container and owning principal contracts are reused.
- SQL `supabase/dev-forward/trip-destinations/20261023000100_trip_structured_destinations.sql`, SHA256 `59e88813b58983b435f7647e46d387daba91ee3456f1ffd9a90acf80ffab6410`.
- Local candidate image `sha256:73d518d4aa573590a9fe43aa48b767b180d998d5cb6e341221ce2eed8e80ef30`; production source label f40466a22b08124ced33a267937d7dccc2b55bb4. Later 9017 contains SQL/test only; no image bundle difference.
- Candidate server SHA256 `d37a587df58108554f6bc13c99f0f5e73641204c579268e304459e8c97a853f1`; capture entry SHA256 `95b9c8018b8bc516cf5fc27b5d6c857836d15ee3d44a4a3f092da8dc22ad3aec`.
- Last previously verified B image `sha256:4c8d6a04c7e31f5f38d972990a626168fedfe7611e2a32ec92209b5f7a120e14`, source12d6b2f, capture SHA256 a9124ac674e3c79003024d88a8123e2fb0cd766e80808e2f679d01898dde0dce. NOT fresh-attested in this task. Fresh image/env/HostConfig/three mounts/config hashes/health/closed gate/NOLOGIN/session preflight is required before any future change.
- Migration requires postgres, exact accepted definitions below, dormant finite gates, four owning roles NOLOGIN and no sessions. Operator must also prove all five Source/Core/Create/Metadata business gates CLOSED; this candidate does not activate them. Any drift STOP, no on-site SQL adjustment.

Exact `md5(pg_get_functiondef(...))` preimages from isolated accepted base:

| Function | MD5 |
| --- | --- |
| trip_create_result(uuid,uuid) | ad2c2778f5a15811b6ef806a6ba2d8d0 |
| trip_create_finite_scope_allowed(uuid,uuid,uuid) | 4915f242e9e98a31800669b91d81b9bf |
| trip_metadata_revision_guard() | f387200202891b93b90e01119a511a3b |
| trip_metadata_snapshot(uuid,uuid,uuid) | ed57d227810145d5da847346b57503dd |
| trip_metadata_update_command(uuid,uuid,uuid,jsonb) | 8d7cdc0f81877718e8d785fc9f8ff991 |

## Exact schema/ACL delta requiring approval

1. Nullable `public.trips.destinations jsonb`, strict input-only validation CHECK; no DEFAULT/backfill/history rewrite. Array order and stable destinationId preserve approved source/place fields. Old NULL means legacy scalar contract.
2. Version-aware constraints on existing finite activation request JSON. Same actor/trip/op/request/UTC binding and <=900-second lifetime; old payload caps retained.
3. New JSONB Create overload `trip_create_command(uuid,uuid,uuid,jsonb)` EXECUTE only existing `otr_trip_create_gateway`; original scalar overload retained.
4. Existing Metadata command/result/snapshot and revision trigger updated for V3 list CAS, retained identity rules, original Create immutable result and old-client fail-closed. No new server receipt/queue/role/table/RLS policy. Table ACL/RLS unchanged.
5. New pure `trip_destinations_valid(jsonb)` EXECUTE for authenticated/service_role solely so existing table writes can evaluate the input CHECK; no table read/write inside validator. PUBLIC/anon/private-role direct access revoked. SECURITY INVOKER trigger rejects a non-postgres effective role introducing/changing destinations; owning SECURITY DEFINER RPCs retain postgres owner. Legacy scalar privileges are not broadened. This is an explicit grant/trigger behavior delta, not a claim that inherited table privileges vanished.
6. SQLite72 is local-only confirmed proof cache: exact accepted Create/Metadata receipt or owning snapshot + revision. No historical backfill, no fabricated confirmed version. Native candidate application still pending separate exact Gate.

## Future execution order (not runnable activation authorization)

Approve/install the exact dormant SQL; verify definitions/ACL/RLS/closed gates and preserve receipts. Deploy exact image with existing env/user/HostConfig/mounts retained, pre-rollback sanitized diagnostics, closed health and protected route checks. Then Native creates a NEW QA Trip locally using opt-in CreateV2 and legal normal Auth. Read only its generated operation IDs/payload hashes; freeze a NEW account/trip/op/UTC/request manifest and independent watchdog/close packet before enabling targeted dispatch. Existing old fixed-QA Phase C control.py must not be run against this Trip. No invented Source/Actor metadata or proposed DTO can stand in for a genuine baseline.

New finite scope must enumerate Create operation, each V3 add/remove/reorder/change operation and conflict/replay requests, original and independent readbacks, Ledger/Currency actions and all bootstrap reads. Budget must be computed from actual request graph and approved; old Phase C 20 reads/5 mutations cannot be reused. Source/Core/provider stay CLOSED. At least240 seconds remain before service change; total window<=900s. Exact future IDs/budgets/activation artifact are NOT_YET_FIXED, so this is candidate/Gate preparation, not READY_FOR_DEV_EXECUTION.

## Preserve-data rollback

Close exact gates, temporary LOGIN/sessions and runtime capabilities; restore exact previously attested B image/three mounts/env/HostConfig, preserving business data and receipts. Disable new Native opt-in/target dispatch. Keep SQLite72 confirmations, new nullable column and all accepted structured lists/receipts. Once structured data exists, do NOT drop the column or revert to an old trigger/function that permits scalar flattening. Any schema downgrade requires separate data-aware approval. Failure to verify closure is RECONCILE_REQUIRED, never retry automatically.

## Remaining formal authority gap: continuous Beta

Current `loadDevTripCreateRuntime` / Metadata runtime and SQL finite predicates intentionally authorize one exact Actor/Trip/operation/request for <=900s. Root's Native QA manifest likewise only targets fixed operations. These contracts permit a bounded Native E2E, not automatic cloud sync for arbitrary future newly created Trips. Persistent Beta requires a separately approved change from operator finite admission to existing Backend normal-Auth Create and owner/organizer Edit authorization (including scope, provisioning, lifecycle, abuse and rollback policy), and corresponding Native composition. This is NOT implemented/authorized here; do not remove finite checks, enable account-wide wildcards or call a demonstration a Beta release.

Closed SQL/deploy execution preparation is now concrete: `DEPLOY_GATE.json` and `scripts/dev/trip_structured_deploy.py` pin the current B Capture rollback, exact SQL/catalog/ACL and candidate hashes. See DEPLOY_ENTRY.md for separate dormant SQL and closed deployment commands. Default remains prepare/no SSH. This closes the deployment-entry preparation gap only; new Native finite targets/budget/activation and continuous Beta authority are still separate unresolved Gates.
