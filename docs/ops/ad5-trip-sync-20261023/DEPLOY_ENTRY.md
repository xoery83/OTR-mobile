# Exact dormant installation and closed deployment entry

Prepared only. No actual SQL/SSH/Auth/deployment in this task. The old retry CLI still pins its historical baseline; do not invoke it for this target. New thin entry reuses its reviewed remote diagnostics/deploy/rollback functions with explicit optional parameters; old defaults retain old entry/path and exact comparison. Native QA activation and business writes are not part of this entry.

Fixed targets: B4c8d6a/capturea912 → candidate73d518d4/capture95b9 + serverd37a. Rollback uses `node server-capture.mjs`, never the former `server.mjs` baseline. New semantic mode compares the complete HostConfig and actual mount dictionaries, sorting only HostConfig.Mounts and mount-list order, never dropping fields/permissions. Baseline command/user/env/config file identities and hashes, three mount targets and expired custody SHA are pinned from retained B evidence; these are NOT a fresh live attestation. Fresh remote comparison is mandatory at execution.

Default safe command, no CLI/SSH:

```sh
python3 scripts/dev/trip_structured_deploy.py --gate docs/ops/ad5-trip-sync-20261023/DEPLOY_GATE.json
```

Following Owner approval only, Coordinator freezes an execution copy with `ownerAuthorized=true`, `authorizedPhases=["sql","deploy"]`, a fresh timezone-qualified positive window<=900s and exact file SHA256 (remaining fields unchanged). No old expired window is valid. Each phase independently reserves a durable, fsynced O_EXCL attempt at the fixed `/private/tmp/otr-ad5-structured-deploy-20261023` path; changing a failed receipt directory to retry is forbidden. Any outcome uncertainty requires reconciliation, not repeated dispatch.

```sh
python3 scripts/dev/trip_structured_deploy.py --gate OWNER_EXECUTION_GATE.json --approved-gate-sha256 APPROVED_BYTES_SHA256 --receipt-directory /private/tmp/otr-ad5-structured-deploy-20261023 --execute-approved sql
# Only after DORMANT_SQL_VERIFIED and its independent receipt review:
python3 scripts/dev/trip_structured_deploy.py --gate OWNER_EXECUTION_GATE.json --approved-gate-sha256 APPROVED_BYTES_SHA256 --receipt-directory /private/tmp/otr-ad5-structured-deploy-20261023 --execute-approved deploy
```

SQL uses only the existing local logged-in management CLI; no session/key extraction. Strict read-only catalog equality before/after pins function hashes/owners/ACL, table RLS/ACL, structured column and constraint definitions, all five closed gates, four NOLOGIN roles and zero role sessions. SQL itself checks accepted preimages and is one transaction. Expected before/after Trip catalog projections are from the disposable accepted PG fixture; its unrelated Source features are absent, therefore fixture omits the two Source predicates solely while generating that projection. Actual execution always runs the full five-gate query; absent/mismatched DEV objects stop. Installed Source implementation is not manufactured from fixtures.

Deployment requires the exact saved image already transferred/loaded and image ID verified; entry never builds/pulls a DEV image. Existing compose config file order/hashes and environment source retained. Remote clock rechecked immediately before compose; service change requires>=240seconds. Candidate actual health development/ok, both bundle hashes, five protected no-auth401 responses and full env/user/HostConfig/mount equality must pass. Sanitized logs, Health.Output and exit state are durably saved0600 before any rollback; failure to capture means failure, never PASS. Failed candidate rolls back exact B with health/bundle/env/config/user/mount verification. SSH/unknown restoration gives RECONCILE_REQUIRED and no retry. New SQL/data/protection remain installed through service rollback; do not drop the structured column/receipts/guard.

Local tests:13 shared-deploy fixtures (including nine historical behavior cases), seven new Gate/clock/catalog/one-attempt/SQL-flow/source-drift tests; real network-none PG30 and candidate actual closed-image receipt remain separate. Simulated deploy tests are not actual DEV deployment. Continuous Beta authority remains explicitly unimplemented as described in MIGRATION_GATE.md.

Approved migration bytes and extracted remote functions are pinned from the same hash-verified file reads before catalog I/O; changes while awaiting preflight refuse mutation/SSH, and subsequent dispatch only uses the pinned snapshot.
