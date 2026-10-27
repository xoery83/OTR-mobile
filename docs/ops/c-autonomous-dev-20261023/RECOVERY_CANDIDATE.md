# Bounded autonomous execution recovery candidate

Status: isolated candidate for independent Review; no password update or resumed DEV execution performed by this change.

The original run stopped before Create dispatch: original SQLite has one exact CREATE_TRIP, DEPENDENCY_BLOCKED, attempt_count 0. Service preflight incorrectly derived ordered Compose files from a sorted hash map and disabled interpolation. Readonly corrected rendering matches the current B image/command. Original failure and close-false receipts remain immutable. Subsequent actual readonly reconciliation proves B exact/healthy/original 3 mounts and all five gates false, four principals NOLOGIN and finite sessions zero. Evidence directory: `/private/tmp/otr-c-autonomous-dev-20261023` (`SAFE_RECONCILIATION_AND_BUDGET.json`, `EXACT_CLOSED_AGGREGATE_READONLY.json`, `RECONCILE_B_READONLY.json`, `ORDERED_INTERPOLATED_RENDER_READONLY.json`).

## Changes

- Preserve trusted container-label Compose order explicitly in `baseline.composeFiles`; require exact unique file set/hash and actual label order. Retain environment resolution protection but allow original interpolation. No replacement image, Schema, grants or capability change.
- Password recovery binds only the two identities created and exact-readback verified in this autonomous scope: A 3f629440-0e8e-4b7d-8177-3dcf89e86b88 and B d5fd339d-1a5e-478e-a901-1791512505d5. Fresh exact ID/email/created_at proof; original in-container credential; PUT body only password; max one each with durable fsynced reservation before wire; unknown never reissued. No new identities, role/email/metadata/link changes or real-user access. Passwords/private responses/credentials remain unpersisted.
- Resume only the original dedicated SQLite and exact original immutable QA operation, owner and fields, attempt_count0/no accepted receipt. No deletion, operation regeneration, pending conversion or counter reset. Independent new evidence directory avoids old watchdog/close markers.
- Carry 3 prior read charges. Pin new finite window <=900s and preserve existing watchdog/service-change reserve. Count actual sends before wire and always save budget on failure.

## Cumulative request budget

Prior conservative read charge 3 and business mutations 0 remain charged. Normal resumed case adds 12 reads, total 15 of16; mutations exactly8 of8. One additional receipt-only recovery read remains. Preview zero-finance qualification reuses this run's actual edited canonical readback (same exact Actor/Trip); between that readback and Preview only metadata replay/collision/denial, original receipt and local reopen occur, with no financial writes. Record proof source/counts explicitly; it is not a new readback. Any additional request still reserves its actual budget and stops before wire at cap. No repost for UNKNOWN.

Password-only recovery A/B <=1 each and new normal-password login/getUser <=2 each are separate bounded engineering-recovery counters, not budget refunds. Existing A/B creation A1/B1 stays charged; no further creation planned. Own-profile qualification uses normal existing bootstrap only and stays conservatively charged in the16-read internal budget. Exact original scalar QA requests/op hashes are unchanged.

## Validation

10 Node tests PASS (actual loopback SDK protocol fixtures, task-owned SQLite, exact resume/attempt rejection, budget carry, password-only guard/unknown); 15 Python tests PASS (8 service,5 controller,2 recovery reservation); 3 actual OS-flock tests PASS. TypeScript and touched ESLint PASS. No live Auth, DEV service activation or business request is implied by these isolated tests. Initial combined Python invocation from repository root failed module discovery; corrected task-directory invocation passed all15.

## Commands

`node --import tsx --test scripts/trip/c-execution/headless.test.ts scripts/trip/c-execution/recoverPasswordInPlace.test.ts`

From scripts/trip/c-execution: `python3 -m unittest service_test control_test recover_password_operator_test service_race_test`.

Password bundle: `npx esbuild scripts/trip/c-execution/recoverPasswordInPlace.ts --bundle --platform=node --target=node24 --format=esm --outfile=/private/tmp/otr-auth-401-diagnosis-20261023/recover-password-in-place.mjs --banner:js='import { createRequire } from "node:module"; const require = createRequire(import.meta.url);'`

Bundle SHA256: 9e66bf742645dea5d4ef82895050fdffc73c5d5b44ceed02a86ddc1761cdfbd4.

Future execution uses existing `recover_password_operator.py` with fixed gate/bundle hashes and private stdin; after both safe receipts, same outer memory controller retains new passwords through normal Auth and the existing Runner. No live action until independent Review of this combined boundary. No Native recovery claim; SQLite reopen uses a currently validated in-memory session. Operator-machine failure still requires reconciliation.

## Data Path Checklist

1. Ownership: existing Cloud-shared Trip/Ledger contracts unchanged; synthetic password and sessions transient/private only.
2. Local storage: original QA SQLite preserved; only dedicated safe operational receipts/journals persist, no secrets.
3. Sync/Backend: existing repository/queue/workers/transports; no Backend/SQL contract changes.
4. Conflict/offline: exact undispatched pending request only; same operation replay and receipts; cumulative cap and no UNKNOWN repost.
5. Evidence: isolated L2 checks above; L1 Native not run; L3 four paths still not run/accepted.
6. Remaining delta: independent Review, finite authorized recovery execution and actual accepted/readback/client recovery plus safe closure.
