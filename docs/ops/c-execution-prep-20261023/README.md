# C execution preparation — isolated candidate

Preparation only. No DEV/Auth/SQL/SSH/deployment/business/Native operation was executed in this change. A/B remain the previously accepted dormant SQL and closed image. A fresh Owner C authorization and independent Review are still required.

## Fixed entry points

- `scripts/trip/c-execution/provision.ts --prepare <Auth gate>`: default no effects. Future `--execute` accepts only two exact dedicated emails, two new admin Auth responses, no user list/takeover/invite/profile/business writes. Normal authenticated profile reads/absent-own `free_user` INSERT happen only after server getUser proof in the Runner. Actual RLS/admin availability is an execution-time condition; failure stops with retained partial Auth receipts, never admin upsert.
- `baseline.py <approved Auth gate>`: future authorized read-only attestation of current B. Hashes environment in memory; exports only baseline metadata and the pinned nonsecret HostConfig needed for exact return. It never exports environment values or custody content.
- `plan.py <approved template> <actual provisioning receipt> <fresh B baseline> <private manifest output>`: local-only materialization. Bind actual newly-created A/B IDs, fixed QA payload hashes, exact helper/code hashes, complete baseline and fresh <=900-second window. Full manifest hash includes recovery configuration. This is not another authorization.
- `node --import tsx scripts/trip/c-execution/run.ts --prepare <manifest>`: no effects. Future `--execute` reads passwords, public key and actual new provision receipts from private stdin; secrets/tokens remain in memory. It runs only fixed QA operations through the existing Repository/Queue/worker/transport. Never runs a global queue or converts V1 pending work.
- `control.py prepare|arm|activate-create|activate-metadata|close <manifest> <private run directory> --manifest-sha <exact digest>`: detached watchdog and fixed finite administration, through the already logged-in **local** Supabase CLI Management API. No copied CLI token, remote PG admin credential, new grants/schema/authority. The service helper uses existing trusted SSH only for two private runtime mounts and current-B return.

The future CLI requires private directory `/private/tmp/otr-c-qa-<unique-run>/` mode0700 and `qa-state.sqlite` mode0600. A preexisting DB stops the one-shot driver; it never opens Native SQLite. In-process SQLite reopen reuses the still-lawful memory-only session; it is not Native or process-cold Auth recovery.

## Execution order and ceilings

After future exact approval: fresh B attestation; two new dedicated Auth identities; materialize actor-bound manifest; once each normal password login + actual `/auth/v1/user`, matching provision ID/email; own profile qualification; exact empty QA readback; arm/attest independent watchdog; offline Create + reopen; exact Create gate/mount; targeted worker receipt; independent canonical Trip/linked-owner/NZD readback; bind Metadata gate only when genuine revision0/before match; normal authenticated snapshot; explicit V2 draft/offline/reopen/account-switch; targeted Edit; immutable receipt/readback; replay/collision/B403; unchanged original Create receipt; zero-expense/payment/settlement readback; legitimate Currency Preview; exact commit/replay; independent USD readback; owning Ledger bootstrap application and SQLite reopen; close/return verification.

Ceilings are checked before actual HTTP or SQL readback dispatch, including rejected/unknown attempts: provision2, normal sign-in2, getUser2, own absent-profile INSERT2, business mutations8 (Create1/Metadata4/Preview1/Commit2), business/preflight reads16. No refund, hidden refresh or unmetered callback. Current gateway handles only scalar destination. Multi-destination semantics remain outside this receipt.

Unknown outcomes retain the existing queue/backoff. One bounded recovery waits the existing retry deadline and permits **receipt-only** recovery; missing receipt stops rather than another business POST. No direct queue rewriting or automatic rebase. Token401/expiry stops; Native refresh defaults are unchanged.

## Finite recovery

Independent `setsid` watchdog on the controlled Operator host is armed before LOGIN. Same-window advisory lock + exact actor/Trip/op/request/start/end comparison precede cleanup. NOLOGIN and termination of only two dedicated scoped role sessions happen before gate UPDATE, avoiding an in-flight RPC FOR SHARE deadlock. Mismatched/newer window stops before altering roles/gates/service. Create/Metadata only; no Core/Source gate mutation. Actual SQL role grants/schema/business receipts are preserved.

Close is a request to the existing independent watchdog, not a second competing closer. A dead watchdog may be reconciled by the same exact close command; a hung/failed close reports RECONCILE_REQUIRED, with no automatic retry. Service helper verifies exact baseline3 + own runtime source/target/RO, runtime body/hash, unchanged B image/entry/environment/user/HostConfig (only permitted Binds added), pinned configs, expired custody and HTTP development health. Sanitized diagnostics are captured before restoration; inability to capture/verify never reports PASS. Remove only own runtime secret files after verified return to current B4c8d. Never use historical012f rollback or SQL migration rollback.

Operator-machine/network total failure may prevent physical remote restoration. Existing SQL finite predicates and VALID UNTIL fail closed; physical cleanup must remain RECONCILE_REQUIRED until actually verified. Arbitrary malicious database credential holders remain outside the accepted trusted fixed-wrapper model.

## Evidence levels and remaining Gate

L1 Native: NOT_RUN / NOT_APPLICABLE to this operator preparation. L2: real loopback SDK protocol + actual SQLite/queue/worker/transport, disposable network-none PG/session/process fixture, and simulated service/SSH failure behavior. These fixtures are not genuine DEV Auth/Hosted data or actual B restart. L3 real DEV four-path receipt/readback/client recovery remains NOT_RUN.

Future Gate must pin fixed source/scripts, actual safe baseline, actual provision-derived actor IDs (no fixture IDs), private paths, fresh <=900s UTC and verified local admin/SSH channel. Owner approval must explicitly permit Auth-only provisioning, ordinary own-profile branch, finite LOGIN/gates, two mounts/same-service restarts, exact8/16 business limits and current-B closure. No permission is granted by this file.

Data Path Checklist: (1) existing Cloud Trip/Metadata/Ledger contracts; Auth secrets transient, QA DB/evidence local; (2) existing migrations/repositories/queue, no SQLite DDL changes; (3) existing owning Backend DTO/receipts, no new authority; (4) CAS/idempotency/offline/account-generation guards preserved, no old pending promotion; (5) L2 isolated only, L1/L3 unclaimed; (6) independent Review then exact authorized DEV execution and closure remain.
