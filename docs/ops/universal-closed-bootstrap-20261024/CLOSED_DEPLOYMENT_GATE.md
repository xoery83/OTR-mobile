# Minimal closed deployment — prepare real Native Source command pins

**INDEPENDENT_REVIEW_PASS / READY_FOR_CLOSED_DEPLOYMENT_AUTHORIZATION. Not authorized or deployed.** This package closes the current live6b missing-context-route prerequisite only. Source registration, Run/Task, Provider and Admission remain CLOSED. No SQL, ACL, new credential, Auth identity or Native install is included.

## Fixed artifacts and actual drift

Executable source: `e9afb98a5cf78d03a048ff12510d96cfcdf363a9` (includes accepted Trip/P1 code7253c12). New image: `sha256:99966a4069268e8f0bc4c200d08b7ac8443e35aa4858fac03cec1869c46091e4`.

| Artifact | SHA256 |
|---|---|
| server.mjs | 90015fb2a1f87b5604419f4be24b75e579e53029282ecbec56a36244c0b6b058 |
| server-capture.mjs | 08dbb04259de5372e667c1f2da7ab69a3179c84d1d5eb1276ddb9590b3968b27 |
| universal-prepare.mjs | 2f8c65bb7b68a0e5b66aebddd5e79a9dea0f8da322697386ee1b690e62d67eeb |

Do not reuse older68f image: the actual compiled inputs changed. esbuild metafiles identify requestBoundary in all three entries and client/nativeFetchDiagnostic/nativeQaReadBudget in Capture/Operator. Backend source and owning Trip/P1 runtime implementations did not change; changed Native client code is transitively bundled by existing repositories. [Exact drift](EXECUTABLE_DRIFT.json), [build manifest](manifest.json), [local smoke](CLOSED_IMAGE.json). COPY-only image uses the previously fixed healthy73d runtime, no install or networked build. Local Docker failure before approval was sandbox socket access, not a candidate startup error; the subsequent isolated build/smoke succeeded.

## One closed-only deployment scope

Owner may approve **one image-only replacement** of the existing DEV `otr-dev-backend`, preserving its current Trip/P1 continuous runtime and configuration. Supabase DEV remains `tuqigdxrvrerfewsxqgm`; SQL changes and Provider activation are **zero**. Image rollback must use the actual currently healthy live6b baseline and its captured configuration, never historical PhaseC configuration. This is preparation for a later single finite Source/Task/Provider authorization after real pins exist.

Execution uses the existing trusted SSH/Compose operator, not a new deployment authority:

1. Under Root's service lease, inspect current health, image ID, command/User, ordered Compose files+hashes, environment hash, HostConfig and mount fingerprints **in memory**. Persist hashes and sanitized metadata only. Pin the actual live6b image/config; stop on unexpected drift. Preserve all current sustained Trip/P1 files/mounts/roles, their normal QA Account, and original data. Reserve at least240s rollback time in a maximum900s transition window. Independent transition rollback targets this captured baseline; it must not invoke old Trip SQL close or disable successful sustained services.
2. Transfer only the fixed image through existing trusted SSH (no remote build). `docker image inspect` must match the exact image ID above. Render the existing Compose files using `OTR_DEV_BACKEND_REVIEWED_IMAGE_ID=<fixed image>`; render must change only image (and command only if current command is not already `["node","server-capture.mjs"]`, in which case stop for Root reconciliation). No added Universal mount/env/credential/custody directory is permitted. Compare full User/HostConfig/env/mounts before replacement; use the reviewed `scripts/import/universal_closed_image.py` image-only operator below, which reuses only metadata diagnostics/redaction and the same shared service lock. The old `metadata_closed_retry.remote_deploy` and `service.py` deployment entry points are incompatible and MUST NOT be used for this swap.
3. Apply once with existing `docker compose -p dev-backend <same -f files> up -d --no-build --pull never backend`. Unknown outcome: inspect/health once, no blind second `up`. On health/config/hash incompatibility, preserve candidate startup logs, Health.Output and exit metadata **before** one baseline restoration. If baseline restoration cannot be independently verified, stop `RECONCILE_REQUIRED`.
4. Verify `/health` development/ok, image+three bundle hashes, unchanged environment/mounts/User/HostConfig, existing Trip/P1 startup compatibility and existing protected routes401 without credentials. Verify Universal capability mount `/run/otr/universal-runtime.json` is absent, `OTR_DEV_UNIVERSAL_REMOTE_TRANSPORT` is not enabled, no new catalog/custody credential is provisioned, and existing finite Universal scopes remain CLOSED/absent. Do not retire existing Trip/P1 mounts or roles. The explicit Operator `--recover-only` must remain CLOSED and **must not run** `--prepare-once`.
5. With the existing normal synthetic QA login, allow up to2 GETs on the actual C3 Batch context route. Expect **503 `UNIVERSAL_IMPORT_CLOSED`**, not old404. Normal Auth validation is still required; no copied Session or management token. No Task ID is returned/minted. A failed401/404/network result does not authorize substitutes or remote activation.

## Exact Native local preparation prerequisite

The currently installed App must already include **PublicationCatalogReceive contractVersion1**, iOS `receive/cancel/release`, and the existing JS sealed factory `createPublicationCatalogNativeFetch()`. Factory initialization must succeed **before** `recoverUniversalOriginalPlans`/Source admission. It accepts only `https://api-dev.xoery.art/v2/trips/<uuid>/source-import-catalogs`, GET, strict two headers and native bounded receive; do not substitute global fetch or a true/false capability flag. If the module is absent/incompatible, report `PUBLICATION_MEMBERSHIP_TRANSPORT_UNAVAILABLE` and stop: this closed deployment does not install a Native binary.

No catalog HTTP request or Reader credential is needed merely to initialize that factory. After exact context503, the existing explicit Start does: local C3 reopen → stable admissionKey → existing Source Repo command IDs/queue for all3 retained inputs → **first Source result lookup**. With no Universal Source runtime, that lookup returns503 `SOURCE_CAPABILITY_CLOSED` before queue claim/acquire/catalog apply. Thus local prepared commands can exist while all remote Source/Provider gates stay closed. The expected user-facing outcome is unavailable, not AI/Source success. Do not repeatedly tap: at most1 explicit Start, at most1 closed Source result lookup, **0 acquire/Run/Task/Provider calls** in this phase. Recovery stays read-only. No global pending queue is enabled.

Root then uses the already reviewed read-only pin tool against the same App DB, exact approved original hashes and actual QA Account/Trip/job. Export real Batch/input/submission/Source command pins; missing pins remain null. No DB/Session copy, manual Source/Run/Task IDs or fixture rows. A prepared local command is not Source proof.

## Next finite Gate remains blocked

Only after those real local pins exist: seal the existing proposed packet with normal Auth/Actor/Trip scope, current SQL preimages/ACL and candidate hashes, finite Source command pins/Run/Task/Attempt/Call bindings, Provider config/price/credential eligibility, <=900s window,1 call/USD1 cap and independent92acdd1 watchdog/service preimages. Existing loader `/run/otr/universal-runtime.json` is root:999/0440, exact SHA through `OTR_DEV_UNIVERSAL_RUNTIME_SHA256`; missing file remains CLOSED. Source-only stage uses the same version1 config+sourcePg/catalogPg pins without TaskSQLite bootstrap; Task stage follows only actual Source receipts and owning Run begin. This phase does **not** open that loader, renew catalog custody, install the five SQL candidates, enable roles, createAuth, or call DeepSeek. Formal Review/Admission remains its separate owning blocker.

Local evidence: six existing targeted test files,47 tests PASS; actual isolated image health,4protected-route401, UID10001, exact bundles, no mounts and Operator CLOSED PASS. No real DEV/readback/Native Source/AI PASS is asserted. Root seals actual service/window preimages and requests only the closed deployment authorization above; later finite authorization remains separate and ungranted.

## Executable image-only operator correction

`metadata_closed_retry.remote_deploy` hard-codes the old three-mount/no-Trip state; Trip `service.py` changes runtime mounts, not images. Neither implements this Gate. The new image-only adapter imports only the existing `redact/environment_projection/diagnostics` functions. It does not modify those helpers or any Trip/P1 code. The executable SHA bindings are in [template](IMAGE_ONLY_GATE.template.json); actual baseline/window remain deliberately unset and `ownerAuthorized=false`.

Root runs these only under the existing trusted service lease after independent Review; **this Writer has not run any SSH command**:

```sh
# Explicit read-only current baseline capture: emits hashes/metadata, no Env/runtime body.
python3 scripts/import/universal_closed_image.py --capture-baseline
# Root seals the template with this exact baseline, fresh UUID/release path and <=900s UTC window.
# Default verifies hashes/plan only; never runs SSH/Docker or changes the service.
python3 scripts/import/universal_closed_image.py --gate "$SEALED_PLAN" --gate-sha256 "$PLAN_SHA256"
# Only after exact Owner CLOSED-only authorization, set ownerAuthorized=true and bind its new plan SHA.
python3 scripts/import/universal_closed_image.py --gate "$SEALED_PLAN" --gate-sha256 "$PLAN_SHA256" --execute-approved-closed-image-only
# Unknown transport: read-only reconcile the SAME release; do not execute again.
python3 scripts/import/universal_closed_image.py --gate "$SEALED_PLAN" --gate-sha256 "$PLAN_SHA256" --read-only-reconcile
```

The operator pins exact6b baseline/a221Capture and99966candidate/three bundles. Preflight and both-direction verification require identical raw HostConfig hash (no semantic sorting), entire environment hash, the exact four authoritative bind mounts including the writable custody directory, three private files' SHA/uid/gid/mode, and custody directory device/inode/uid/gid/mode only, original ordered Compose files/hashes, command and User. Only an `image` overlay is rendered; changed volumes/config are rejected. Compose gets one attempt, and an UNKNOWN reply is independently inspected instead of resent. Candidate stdout+stderr, Health.Output and exit state are redacted in memory and fsynced before rollback; a diagnostic gap is explicitly recorded if collection fails.

A detached independent watcher acknowledges readiness before changing the service. Both image deployment and restoration use `/run/lock/otr-c-finite-service.lock`. The watcher persists and validates its exact program/plan SHA and private0700/0600 release. At expiry it either re-verifies a fully fsynced acceptance or restores the original ordered Compose files and captured6b image, preserving all sustained runtimes. Inline failure and watchdog share one exclusive restore claim; they never retry an uncertain restore. Restoration failure or foreign config/image drift returns `RECONCILE_REQUIRED`. Its close operation performs **zero SQL, role changes, Source/Provider Gate changes, runtime deletion or old Trip shutdown**. Successful closed handoff remains active with existing Trip/P1 service preserved; only the transition watcher retires.

Evidence:21 local isolated operator tests PASS, including exactfour-mount/raw-HostConfig preservation, forbidden config/env/runtime drift, one attempt, unknown reply readback, failed rollback/no retry, concurrent restore once, generated remote program self-containment, default prepare without SSH, and a real detached watcher process surviving its launcher exit. Docker/remote rollback in those operator tests is simulated; this is not a DEV deployment/restore receipt. Existing actual network-none image smoke and47 targeted application tests are unchanged. Do not finalize executable activation until Root supplies actual read-only baseline/window pins and this adapter's independent Review passes.

Review corrections preserve the actual sustained runtime, rather than changing mounts to fit a fixture. Authoritative receipts are `FINAL_DEV_BACKEND_INITIAL_DIAGNOSTIC.json`, `DEV_RUNTIME_MOUNT_RESUME_ATTEMPT4.json` and `FINAL_DEV_BACKEND_EXACT_RECONCILED.json` in the accepted Trip/P1 receipts directory. The latter fixes raw HostConfig SHA `df2d008d29c14129954ca39acc650d5b0ca58dfdee1a01d57f9ead60532ebce5`; fresh read-only capture must reconcile to it before Owner seals the plan. The exact `/run/otr-r3a5-catalog/catalog-reader.json` source is permitted, never arbitrary `/run`. Custody `/opt/otr/dev-backend/private/capture-custody` → `/var/lib/otr/capture-custody` stays **RW** and is treated as a directory: only `fstat` metadata, no listing, reads of content, hashes of content, chmod or writes. The other three exact mounts remain RO regular files. Tests use the actual four Source/Destination/RW tuples from the accepted receipt and reject changes to RW, Type or catalog source. Original contents and data lifecycle are unchanged.

Acceptance now rechecks both UTC and a monotonic bound after diagnostics, immediately before atomic marker publication and after publication. The acceptance includes a within-window UTC timestamp and elapsed bound. A publication that completes late is retained as `rejected-acceptance.json` and rolled back; the watcher independently rejects a saved late timestamp and restores instead of preserving it. Added negative tests cover diagnostic delay past UTC/monotonic expiry, an atomic link completing after expiry, and the watcher receiving a late marker. These are local operator regression results, not DEV receipts.

## Root sealed execution request — 24 October 2026

Independent fixed review aea8ce37 PASS: [report](reviews/FIXED_REVIEW.md). Fresh read-only capture confirms the accepted sustained baseline (environment cf397ec1…, raw HostConfig df2d008d…, original four mounts/runtime unchanged). [Sealed plan](IMAGE_ONLY_GATE.sealed.json), SHA256 `435143ff557bd2c59b3c89f1e413ea6fe3f01fa4137922a5c3d942b5979964b2`, passed default PREPARED_NOT_EXECUTED; ownerAuthorized remains false.

Requested one attempt: 2026-10-24 08:50:00–09:05:00 UTC (maximum900 seconds), Coordinator as Operator and independent detached transition watcher as rollback owner. Stop without deployment if unapproved/expired or preimages drift. Only the ownerAuthorized flag may become true after explicit approval; recompute and retain that authorized plan hash. Candidate image99966…; successful handoff preserves the existing sustained Trip/P1 service. Failure restores captured6b once; an unverifiable result is RECONCILE_REQUIRED. No SQL/ACL/Auth/Source acquire/Run/Task/Provider/business mutation. Up to two normal synthetic context GETs and one closed Source-result GET are included only to qualify this prerequisite; local Source commands remain proposal pins, never Source proof.
