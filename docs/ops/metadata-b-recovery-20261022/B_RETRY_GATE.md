# Metadata B-only Recovery — prepared, not authorized

**READY_FOR_B_RETRY** means isolated preparation is complete, subject to independent review and a NEW precise Owner B-only authorization. It does not mean DEV deployment or business Cloud E2E passed.

## Determined blocker and minimal fix

The current healthy old image runs `server.mjs`, which does not load the optional Capture custody runtime. The failed candidate's `server-capture.mjs` loads it before its startup try/catch. The existing unchanged mounted custody file is root:999/0440 but expires `2026-10-17T08:33:27.096Z`; the recovery read-only baseline found it expired. In a disposable network-none container, the exact old candidate bundle plus synthetic schema-valid expired custody exits1 with `CAPTURE_RUNTIME_UNAVAILABLE`. This proves a deterministic startup blocker. Historical failed-container logs were lost before rollback, so it does not reconstruct every possible cause of that historical failure.

Production fix `c0ab4677a796201074f30180f2fe12c64598e529` catches only optional custody initialization failure at the composition entry and logs CLOSED; the ordinary Backend starts without that capability. The loader itself, schema/owner/mode/TTL/binding checks, valid-custody cleanup, other Trip/Metadata gates and financial scanner remain unchanged. No configuration renewal, privilege relaxation, private Source material read or SQL change occurs.

Final source/qualification commit `12d6b2f27d66305bba0cbfc81c1a7969b3c37e95` also corrects the fixture's existing Catalog version header; it does not change the production bundle. Final local image is `sha256:4c8d6a04c7e31f5f38d972990a626168fedfe7611e2a32ec92209b5f7a120e14`, LABEL revision12d6b2f27d66305bba0cbfc81c1a7969b3c37e95, Capture bundle `a9124ac674e3c79003024d88a8123e2fb0cd766e80808e2f679d01898dde0dce`. Base remains approved prior image012f2d…; no network/pull/dependency change was used.

## Exact future Owner B-only gate

The companion `B_RETRY_GATE.json` fixes the DEV project, old image/bundle, current canonical environment hash, existing eight compose files/hashes, expired custody SHA, candidate image/bundle and a new release directory. `ownerAuthorizedBOnly=false`, Phase C false and UTC window placeholders intentionally prevent execution. Owner must authorize precisely that artifact/target, one deployment attempt and an explicit window<=900seconds. No automatic renewal/retry. Expected impact is one DEV Backend container recreation/restart with transient API unavailability; other services are unchanged. The operator must reserve at least240seconds before the UTC deadline before starting service mutation, accommodating the40second health deadline, bounded diagnostic capture and bounded rollback/verification inside the approved window<=900seconds. If insufficient time remains, do not start; this is an explicit execution prerequisite, not a claim that an unhealthy timeout diagnoses its cause. A change to any baseline, role/gate, custody content/expiry, mount or image stops execution; do not silently refresh inputs.

1. Preserve current healthy old service. Under the new B-only approval, reverify existing SQL gates/NOLOGIN via authorized read-only catalog checks only. A installed SQL is retained; do not reinstall, patch SQL, create Auth users or activate any Trip/Metadata/Source/Core/Provider capability.
2. Transfer ONLY the exact local image using Docker save/load over existing trusted SSH, verify image ID and source label; do not rebuild in DEV, transfer sessions or add mounts. Preserve the prior image/data/config.
3. Run the reviewed `scripts/dev/metadata_closed_retry.py` against the exact private Owner authorization packet. Default mode only prepares. Explicit execution separately requires the authorization flag and valid UTC window. Remote preconditions recheck window and exact still-expired custody hash immediately before service mutation. Only image/entry change; existing env/config/three mounts/user/HostConfig stay identical.
4. Capture startup stdout/stderr, Health.Output and State exit/OOM/error BEFORE rollback can replace the candidate. Only sanitized data is ever persisted/exported; environment secrets are compared in memory, canonical hashes/keyed hashes and changed key names are retained, values are not. Quoted credential fields, Bearer/JWT patterns and old/new secret values are redacted. Diagnostic read/write failure makes the attempt non-PASS and still invokes rollback. Health waiting is bounded40seconds, not a claim about why a timeout occurred.
5. Require actual DEV `/health` development/ok, exact candidate image/bundle, canonical env equality, unchanged mounts/user/HostConfig and no new runtime files. Follow with five safe no-Auth reads (Metadata snapshot/receipt, Trip receipt, Catalog with existing version1 header, Ledger bootstrap):401 is route/auth compatibility, never a business authorization success. The template's infrastructure receipt does not replace these independent compatibility read receipts or final operator verification.
6. If any failure, capture sanitized diagnostic first, then restore prior reviewed image/entry through the prevalidated rollback compose. Verify bounded healthy restoration, development/ok body, original bundle, canonical env/mount/user/HostConfig/config hashes. If transport/inspection/rollback cannot be verified, status is RECONCILE_REQUIRED; do not retry. Preserve all diagnostics/images/SQL/receipts and user data.

The existing private custody metadata stays physically mounted but remains expired and unusable; exact SHA+expired checks prevent this B attempt from accidentally loading a newly renewed capability. Credentials stay in the existing Backend only. No business/Profile/Auth/Source/financial/Admission mutation, C activation, Native GUI, Production or paid Provider call is authorized by this packet.

## Evidence and levels

- L1 Native: NOT_APPLICABLE / NOT_RUN for this Backend-only recovery. L2 isolated Backend evidence:61 focused Backend tests,9 Python operator fixtures, TS, scoped lint, UI guard and bundle compile PASS. Includes valid resource cleanup, expired/malformed/denied/missing capability closure, version/authority closed fixtures, secret injection, normalized env, capture/persist-before-rollback, capture failure, timeout, remote window and active-custody rejection.
- Actual local final image: health200/development/ok and five no-Auth401 responses in `FINAL_RETRY_IMAGE_ROUTES.json`, synthetic expired fixture/network-none. No real Auth or DEV business call.
- Earlier same-production-bundle provisional images tested expired/malformed/absent health200; c0ab-label image also denied health200. Their old Catalog426 is an explicit missing-version negative, not five401. These are distinguished from final image receipts.
- Existing scanner's network-none failures are expected isolation evidence, not Provider/FX/Runtime PASS; scanner was not changed.
- L3 actual DEV retry NOT_RUN; Phase A remains installed/dormant from the preceding authorized run, Phase B remains failed/rolled back there, Phase C BLOCKED. No SERVER_ACCEPTED/SERVER_VERIFIED/Cloud E2E claim.

| Data-path checklist | State |
|---|---|
| Data Ownership | Existing Trip/Core/Ledger/Capture authority unchanged; optional custody remains strictly qualified |
| Local Storage | No App SQLite/user/Keychain/photos/Source data change; disposable synthetic fixtures only |
| Sync Backend | Isolated startup recovery and V2 contract compatibility prepared; live deployment awaits Owner |
| Conflict/Offline | Existing CAS/queue/replay fixed receipts unchanged; no new live recovery claim |
| Required L1/L2/L3 | L1 Native NOT_APPLICABLE/NOT_RUN; L2 isolated Backend/container evidence PASS; DEV business L3 BLOCKED |
| Remaining Delta | New B-only authorization, exact image transfer, one closed deployment, diagnostic/rollback and route receipts; C separately closed |
