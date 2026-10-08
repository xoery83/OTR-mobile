# R3 same-project CLOSED-only DEV rebuild report

## Final Owner Acceptance PASS — 2026-10-08

Owner explicitly accepted the R3 Hosted DEV rebuild, committed forward Ledger
initialization and bounded seed/smoke: 36 Hosted checks, lineage/catalog/function,
historical68/Auth/Storage preservation, Backend health, synthetic financial/receipt
fixtures, Account isolation and CLOSED gates PASS; provider calls zero.

This acceptance supersedes earlier approval-required and stopped-stage status
statements below, which remain intact as historical evidence. Rebuild and forward
transactions each committed once; no rerun is authorized. No Hosted operation was
performed for this documentation closure. Old device outboxes remain quarantined;
device first-sync/re-enable is a separate unaccepted gate. No replay, wipe, reset,
logout or Account rebinding.

Current main is `c2f1524aa492ecf32982de6a52c7166bf45715e0`, incorporating accepted
P4a/C4a. R3 SQL origin/rebuild canonical/forward-base provenance remains unchanged.
See [closure proposal](OTR_R3_DOCUMENTATION_CLOSURE_PROPOSAL.md) and
[installed forward record](../../supabase/dev-forward/r3-v1/README.md).
Documentation is ready for scoped commit review; no commit/push has occurred.

STOP — R3 DOCUMENTATION CLOSURE / OWNER REVIEW REQUIRED.

## Profile assertion correction and bounded seed — PASS / Owner acceptance pending

Executed at 2026-10-08T01:05:09.778874+00:00. Only the private test-helper Profile assertion was
corrected to compare authenticated GET against explicit `id`, `display_name`,
`account_role` values. No product code, Profile overwrite, schema/RLS change,
forward SQL rerun, or original destructive cutover rerun.

### Actual Hosted results

- Exact DEV `tuqigdxrvrerfewsxqgm` pre/final read-only checks PASS. OTR catalog:
  `c9adf99f4818b32d6aca81d22d3a17bc7ccd935652b59f95016fa19cb9982906`.
  Function hash: `73de5cd814b1b1feafc4bf08418a3c402708c80fd87e38119b64f7d1104ada1c`.
  R3 parent lineage, historical68 full-row hash/tail, function owner/ACL/search_path,
  restricted roles, FORCE RLS, managed schema inventories and CLOSED verifier PASS.
- Account 1's existing Profile was re-read through its authenticated session and
  not recreated or overwritten. Account 2's Profile was absent and created with
  ordinary authenticated PostgREST using only its own ID and synthetic display
  name. Both exact owner reads PASS with default `free_user`. Cross-Account PATCH
  affected zero rows in both directions. Existing credentials reused; no Accounts
  or credentials created or changed.
- Both stable Trip IDs were absent before creation. Ordinary authenticated Trip
  creation returned201 for `b3a30000-0000-4000-8000-000000000001` and
  `b3a30000-0000-4000-8000-000000000002`. Each has exactly one linked owner membership
  and one NZD/scale2 Ledger settings row, confirmed by Backend bootstrap and final
  catalog-authorized read. Each also has one approved synthetic unlinked traveller
  with ordinary default ACTIVE/revision0; domain command gates remain CLOSED.
- Existing Backend Expense contracts created NZD1200 and800 minor-unit Expenses,
  each equally split between owner and synthetic traveller. Same idempotency key
  replay returned the same Expense ID; final verification shows revision1, correct
  split totals and exactly two Expense audit rows with after hashes.
- One 68-byte synthetic PNG Receipt was created idempotently, uploaded through
  Backend private Storage and finalized as UPLOADED. Authorized download matched
  exact bytes; foreign Account Backend and direct private Storage downloads denied.
  Stored uploaded SHA:
  `0e6546437f520f4b40c757f3ca04217e7abdf2f4cb29ec26b05c86e4bd338f9c`.
  OCR remains PENDING; no provider invocation or activation.
- Ordinary owner settlement preview/finalize PASS: one FINALIZED root settlement,
  one input, one transfer of NZD600 minor, one FINALIZED audit event. No payment was
  recorded; the transfer is OPEN/unpaid, which is its normal financial state and
  does not activate any domain/provider gate.
- Each Account sees only its own Trip; foreign Backend Ledger bootstrap is403.
  Direct protected Ledger/Expense/Receipt/Source/provider table reads denied.
  **36 bounded Hosted checks PASS**, followed by independent read-only financial,
  audit, receipt, catalog/history and preservation checks PASS. Existing Backend
  HTTPS `/health` is development/ok before and after seed. No deployment/restart
  or configuration change was needed.

### Final environment and limits

| Data | Actual count |
| --- | ---: |
| Synthetic Profiles | 2 |
| Trips | 2 |
| Members (2 linked owners + 2 unlinked travellers) | 4 |
| Ledger settings | 2 |
| Expenses / Expense audit events | 2 / 2 |
| Uploaded Receipts | 1 |
| Finalized settlements / settlement audit events | 1 / 1 |
| Auth users / sessions | 12 / 595 |
| Storage objects | 43 (42 existing + 1 synthetic Receipt) |
| Provider calls | 0 |

Historical68 full-row hash remains
`971037caca92c44f5f7b817b45ff62b8a27124025caa7347d41187ce75ff105c`;
tail20261004000300. Original591 sessions' full-row hash remains unchanged; this
continuation added two ordinary synthetic sign-in sessions (prior total593).
Original42 Storage objects' full-row hash and all bucket hashes are preserved.
No Auth users/sessions or Storage objects were deleted.

Old device outboxes remain quarantined. No mobile/device first-sync acceptance
was performed. Do not replay, wipe, reset, logout or rebind old device data; any
future client re-enable/fresh-client validation needs a separate Owner decision.
This report claims only the bounded Hosted contracts tested, not OPEN/discovery
or historical Server73 OPEN equivalence. All such gates remain CLOSED.

Actual task-owned evidence: `/private/tmp/otr-r3-forward-execution-20261008/`:
`assertion-pre-state.json`, `assertion-seed-progress.json`,
`assertion-final-state.json`, `assertion-final-details.json`,
`seed-acceptance-readonly.json`, `seed-continuation-final-state.json`.
Earlier failed helper evidence is preserved separately. Old R3 worktree/private
backups untouched. No Production, protected-table seed bypass, migration, new
credential, provider call, deployment, commit/push or cloud upload.

STOP — R3 HOSTED DEV SEED AND SMOKE / FINAL OWNER ACCEPTANCE REQUIRED.

## Synthetic Profile continuation — partial initialization / STOP

Owner authorized ordinary self-Profile initialization for only the two retained
synthetic Auth Accounts, followed by the existing bounded seed. Immediate DEV
read-only catalog, lineage, history68, roles/RLS and CLOSED checks PASS.

- Target `tuqigdxrvrerfewsxqgm`; approved catalog remains
  `c9adf99f4818b32d6aca81d22d3a17bc7ccd935652b59f95016fa19cb9982906`.
  Neither the forward transaction nor original destructive cutover was rerun.
- Account 1 authenticated with its retained fixture credentials. Its ordinary
  self-Profile read was empty; authenticated POST `/rest/v1/profiles` returned201
  and created just `id` / `display_name`, with existing defaults. Read-only final
  evidence confirms Account `3cb7e67d-1a30-4ca4-aa39-aebca067c324`, display name
  `R3 synthetic Account 1`, role `free_user`. No privileged INSERT or Auth change.
- The next owner GET returned200, but the required equality assertion failed:
  the helper compared POST's complete row against GET's selected three fields
  (`id,display_name,account_role`). This is an erroneous response-shape comparison
  introduced in the continuation helper. Exact response bodies were not retained;
  owner-read acceptance is therefore NOT claimed. The final catalog read verifies
  the stored row, but does not substitute for an authenticated RLS smoke PASS.
- Stopped immediately at `owner Profile read 0`. No script correction/retry,
  Account 2 authentication/Profile write, cross-Account mutation test, Trip write,
  Ledger/Receipt/Storage seed, or settlement occurred. No unexpected HTTP error was
  recorded in this run. All later smoke checks remain NOT REACHED.
- Final verified state: Profiles1, Trips0, members0, Ledger settings0, Expenses0,
  receipts0, provider calls0. Auth users12 / sessions593: one normal synthetic
  sign-in added a session. Original591 sessions' full-row hash is unchanged.
  Storage42 and original full-row object/bucket hashes unchanged. Managed schema
  inventories, approved function/catalog, lineage and historical68 full-row hash
  preserved; all CLOSED gates PASS. Existing DEV Backend HTTPS health is
  `development/ok` before and after the stop.

Minimum next Owner checkpoint: approve correcting only the read-check comparison
to the same three fields and resuming ordinary authorized reads/seed. Re-read the
existing first Profile without overwriting it; create only the missing second
Profile. Reconfirm empty stable Trip IDs before continuation. No SQL, migration,
privilege change or new credential is needed. Do not rerun committed forward SQL.

Evidence: `/private/tmp/otr-r3-forward-execution-20261008/` contains
`profile-pre-state.json`, `profile-pre-details.json`, `profile-seed-progress.json`,
`profile-final-state.json`, `profile-final-details.json`,
`profile-final-backend-health.json` and `profile-execution-final-state.json`.
One automatic precheck review timed out without execution; the permitted single
retry succeeded. All actual Hosted calls used only approved DEV paths.
Old R3 worktree/private backup artifacts and device outboxes remain untouched;
outboxes stay quarantined. No replay, logout, rebind, Production, provider call,
deployment, credential change, commit/push or cloud upload.

**Acceptance NOT COMPLETE.**
STOP — R3 HOSTED DEV SEED AND SMOKE / FINAL OWNER ACCEPTANCE REQUIRED.

## Hosted forward committed — verification PASS / seed stopped at missing Profiles

2026-10-08T13:51:06.397344+13:00. Owner authorized resumption through the verified existing
Supabase CLI mechanism. Immediate read-only prechecks passed. Executed the exact
approved forward transaction **once**, CLI exit0, with an exclusive local attempt
marker. No retry, repair or original destructive cutover rerun.

- DEV: `tuqigdxrvrerfewsxqgm`.
- Forward SQL SHA-256: `983674336ac12bffb7746a4d76fc0c79c53b7b3dfec307aaf1875d00aa55f4f2`.
- Resulting OTR catalog: `c9adf99f4818b32d6aca81d22d3a17bc7ccd935652b59f95016fa19cb9982906`.
- New function definition: `73de5cd814b1b1feafc4bf08418a3c402708c80fd87e38119b64f7d1104ada1c`.
- Post-commit read-only PASS: function owner postgres, original EXECUTE ACL,
  SECURITY DEFINER and `search_path=public`, FORCE RLS, restricted roles and
  protected boundaries, parent R3 lineage and historical68 full-row hash unchanged.
- Across the forward transaction, Auth users/sessions and Storage object/bucket
  hashes remained unchanged. Managed inventories and all CLOSED gates PASS.

### Bounded seed actual result — STOP, not acceptance PASS

Existing DEV Backend health passed; the first approved synthetic Account signed
in with its existing credentials. The first ordinary authenticated
`POST /rest/v1/trips` for Trip `b3a30000-0000-4000-8000-000000000001` returned
**HTTP409 / PostgreSQL23503**. Stopped immediately; no retry or privileged bypass.
The HTTP error code was retained; the original response's exact constraint-name
field was not retained. Subsequent read-only evidence confirms both approved
Accounts lack `public.profiles` rows (total profiles0); `trips_created_by_fkey`
requires `created_by` to reference a Profile. Journey-member user and Ledger
settings attribution also reference Profiles. The prerequisite is missing before
fresh-Trip initialization can be accepted through the Hosted creation contract.

Current verified data: **Trips0, members0, Ledger settings0, Expenses0,
receipts0, provider calls0**. Auth users12; sessions592 (one approved synthetic
sign-in added a session; prior591 sessions' full-row hash remains unchanged).
Storage objects42 and bucket/object hashes unchanged. First Trip failed atomically;
no business fixture remains. Backend HTTPS health after the stop is development/ok.

Hosted positive Trip/Member/Ledger/Receipt/Storage and cross-Account smoke tests
were **not reached**. Local correction tests remain valid, but do not substitute
for Hosted seed acceptance. Final read-only catalog/security/CLOSED checks still
PASS. A multi-SELECT diagnostic wrapper initially assumed multiple result sets;
the CLI returns only its last SELECT. Saved diagnostic data was read and the
unchanged read-only state query was run separately. No database repair occurred.

### Minimum next decision

Separately authorize ordinary self-Profile initialization for just the two
approved synthetic Accounts through existing authenticated RLS-bound contracts,
then resume the same bounded seed. The retained ordinary policy is
`Users can insert their own profile`, WITH CHECK `id = auth.uid()`; no privilege
escalation, financial-table bypass or new SQL/schema is proposed. No Profile was
created during this stopped run. Do not rerun the now-committed forward SQL.

Actual evidence is retained in `/private/tmp/otr-r3-forward-execution-20261008`:
`hosted-pre-state.json`, `hosted-forward-attempt.json`, `hosted-forward-response.json`,
`hosted-post-state.json`, `seed-progress.json`, `final-database-state.json`,
`final-diagnosis.json`, `final-backend-health.json`, `execution-final-state.json`.
Old R3 worktree and private backup artifacts untouched. Old device outboxes remain
quarantined; no replay, wipe, logout or Account rebinding. No Production, provider
call/activation, new credential, deployment, commit/push or cloud upload.

STOP — R3 HOSTED DEV FORWARD CORRECTION / FINAL OWNER ACCEPTANCE REQUIRED.

## Operator access recovery — PASS / read-only checkpoint complete

2026-10-08T13:35:45.984035+13:00. The previously successful Supabase CLI2.117.0 mechanism
remains accessible in the current Codex environment. Reused the installed CLI's
existing Management API authentication resolver, explicit DEV project ref
`tuqigdxrvrerfewsxqgm`, and the previously approved nonsecret DB-password placeholder
that avoids temporary PostgreSQL-login initialization. No credential value was
retrieved into our helper, printed, copied, exported or exposed. No login, token
rotation, role creation, permission change or alternate privileged path.

The prior Python helper's manual generic-password lookups returned item-not-found
for its assumed `default` and `access-token` references. The native CLI nonetheless
resolved existing authentication and completed the approved READ ONLY/ROLLBACK
query successfully (exit0). Those failed manual lookups do not establish that the
CLI's existing credential is missing or expired; no credential recovery/reset is
required from Owner. The exact private entry value was deliberately not inspected.

Read-only results, against the explicit approved DEV target:

- Existing R3 lineage is unchanged, including installed timestamp, artifact-origin
  source commit and original baseline SHA.
- Original full OTR catalog/role/security verifier PASS:
  `59757774873268ad85c4ea5a5c23a4af37b19c38c96fb964d6d75c850d3d9b47`.
- Original function hash PASS:
  `6aff434d161f063678984d1f7df712c9706e52bf81d79be1ac71b0baae8ba746`.
- History68/tail `20261004000300` and full history hash unchanged.
- CLOSED gates and protected boundaries PASS; provider calls0.
- Database postgres / operator postgres / transaction_read_only on.
- Trips0, Ledger settings0. No Backend operation or seed attempt.

**Forward SQL executions: 0. Seed requests: 0.** New Owner checkpoint expressly
prohibits either operation here. Evidence:
`/private/tmp/otr-r3-forward-execution-20261008/access-recovery-state.json` and
`access-recovery-read-only-result.json`. The forward apply-attempt marker remains
absent. Prior private backups, old execution worktree and old outbox quarantine
remain untouched. No Production, Hosted mutation, provider, deployment, commit,
push or cloud upload.

STOP — R3 OPERATOR ACCESS RECOVERY / OWNER REVIEW REQUIRED.

## Latest Hosted forward attempt — stopped before any request

2026-10-08T13:32:26.215501+13:00. Owner approved the exact forward SQL and later bounded
ordinary-contract seed. **Forward transactions submitted: 0. Seed requests: 0.
Hosted identity/catalog/lineage/CLOSED verification: not run.**

The first permission review timed out before the process started. One permitted
retry exited during discovery of the existing Supabase operator credential:
`BLOCKED: existing Supabase operator credential unavailable; no credential created`.
No request reached DEV; no SQL, schema, Auth, Storage, seed or Backend operation
occurred. No alternate access path, repair, new credential, deployment, provider,
Production, commit or push.

Local forward SHA-256 reconfirmed: `983674336ac12bffb7746a4d76fc0c79c53b7b3dfec307aaf1875d00aa55f4f2`. Expected post-catalog remains
`c9adf99f4818b32d6aca81d22d3a17bc7ccd935652b59f95016fa19cb9982906`.
No apply-attempt marker exists. Evidence:
`/private/tmp/otr-r3-forward-execution-20261008/stopped-state.json`.

Last accepted Hosted state: R3 committed, Backend healthy, two synthetic Auth
Accounts, empty Trips/Ledger/receipts. This is prior evidence, not freshly verified.
Old outboxes remain quarantined; no replay, wipe, logout or rebind. Restore access
to the existing operator credential before resuming approved read-only prechecks.
No cloud report update, per Owner.

Automatic review rejected writing the old R3 execution-worktree report because
of the earlier no-modification restriction. That operation did not run. This copy
of the execution report records the current stop in the isolated correction
worktree; the original report/source/private backups remain unchanged.

STOP — R3 HOSTED DEV FORWARD CORRECTION / FINAL OWNER ACCEPTANCE REQUIRED.

## Backend restarted seed partial stopped at missing Ledger initializer

2026-10-08. Owner accepted the independent read-only PASS and approved Backend-before-seed
ordering. Approved R3 lineage/catalog hash/CLOSED evidence was reconfirmed. Only existing
`otr-dev-backend` was started using the existing Compose file/service; no image build,
deployment or configuration change. Localhost and public HTTPS health both return
`development/ok`; final container readback is **running healthy**.

All protected/provider gates and original lineage were independently reconfirmed unchanged
after startup. The approved two ordinary synthetic Auth Accounts were created through
existing DEV Auth admin service and authenticated through password sign-in. Their fixture
IDs and passwords/tokens are privately retained0600; no existing user was overwritten,
deleted or logged out. Existing Backend/platform/provider credentials were not changed.
This is **partial seed**, not a complete synthetic acceptance fixture.

**STOP dependency:** normal Trip creation adds linked owner memberships but does not
initialize `ledger_settings`. Existing Backend `readLedgerBootstrap` requires a settings
row with `.single()` and fails when missing (`backend/src/supabaseGateway.ts:6348`).
The installed canonical baseline's sole settings INSERT is in
`ledger_import_stage9_v1_pre_settlement_participation`, under the excluded legacy Stage9
import path. No ordinary existing Backend initialization endpoint was found. The seed plan
missed this prerequisite. Direct protected settings insertion or a legacy import would
exceed the reviewed Backend seed procedure. Execution stopped **before Trip/Member/Ledger
or receipt writes**; no known-failing bootstrap was deliberately sent and no fix improvised.

Final read-only exact approved verifier with `search_path=pg_catalog` still **PASS**, including
catalog/global OTR privileges and every CLOSED boundary. Recorded state:

- **Backend RUNNING HEALTHY**, same service/image/config; both health surfaces PASS.
- **12 Auth users /591 sessions**: original10/589 plus2 approved synthetic Accounts/sessions.
- **Trips0, members0, ledger settings0, expenses0, receipt assets0, provider calls0**.
- **42 Storage objects**; existing bucket config hash unchanged; no synthetic object uploaded.
- All68 historical records/full-row hash unchanged; tail `20261004000300`; exact R3 marker
  unchanged; managed relation/routine inventory counts unchanged.
- Ledger/Receipt/Storage and full Account/Trip isolation smoke **NOT RUN**. Auth fixture
  sign-in and health alone are not a complete Hosted acceptance claim. Device-local Capture
  examples and device acceptance remain pending. Old outboxes remain quarantined.

No destructive SQL rerun, migration repair, Production access, provider activation/call,
existing credential change, deployment, commit or push. New synthetic Auth identities are
retained; no cleanup/deletion/retry attempted. Private evidence:
`/private/tmp/otr-r3-private-20261008/continuation-final-state.json`,
`seed-blocked-state.json`, `restarted-lineage-closed.json`, `seed-auth-private.jsonl`.
The last file contains fixture login secrets and must not be uploaded or printed.

Next Owner checkpoint: review the missing fresh-Trip Ledger initialization contract and
approve a bounded initialization procedure or a separately reviewed implementation.
Do not run the destructive transaction again. No direct financial-table bypass is authorized.
Earlier stopped-Backend/ordering sections below are historical and superseded by this state.

STOP — R3 HOSTED DEV REBUILD CONTINUATION / FINAL OWNER ACCEPTANCE REQUIRED.


## Bounded continuation read only acceptance passed

2026-10-08. Owner accepted the committed cutover and authorized bounded continuation.
The exact unchanged approved verifier (SHA25645444aba…c6561) was rerun with
`BEGIN READ ONLY; SET LOCAL search_path=pg_catalog`; catalog, global OTR roles/privileges
and CLOSED checks **PASS**. Independent lineage readback matches the committed marker
exactly. All68 historical records/full-row hash/tail, recorded Auth/Storage counters,
bucket hash and managed inventories reconfirmed unchanged. All CLOSED gates remain
closed, Trips0/provider calls0. The destructive transaction was not rerun.

**Held at seed:** the approved Ledger/receipt seed uses existing Backend HTTP contracts,
while the latest ordered instructions place seed/service smoke before restarting the
stopped Backend. Source evidence: `backend/src/app.ts` createLedgerExpense/mutateReceipt;
approved seed plan below explicitly requires existing Backend contracts. No direct
protected-table installer or replacement Backend has been introduced. A focused Owner
question requests restart of only the existing Backend after database acceptance, then
approved seed/smoke. Await that sequencing decision before dependent action.

Backend remains **STOPPED**; no seed, new synthetic Auth account or Hosted service smoke
has run. Old clients/outboxes remain quarantined. No Production, provider call/activation,
secret change, deployment, migration repair, destructive rerun, commit or push.
Private evidence: `/private/tmp/otr-r3-private-20261008/continuation-state.json` and
`continuation-approved-verification.json`, `continuation-preservation.json`,
`continuation-lineage-closed.json`.


## Hosted execution — committed; stopped for Owner acceptance

Owner explicitly approved the existing DEV project `tuqigdxrvrerfewsxqgm`, canonical
`b6daffecedab1616b173fde3f5e2de5d54770eff` and exact transaction SHA-256
`c65d5c2c5b0b21eb22f82da96654c0254714496f5535fd23cb22b8f4062878c2`.
Owner confirmed all DEV clients stopped and old outboxes quarantined. Exact source,
backup bytes/hashes/private permissions, linked DEV identity, old68 OTR catalog/history
and existing Backend Supabase binding passed preflight. Only the existing DEV Backend
was stopped. The frozen transaction was executed **once**, CLI exit0; lineage readback
confirms commit at **2026-10-07T22:33:45.460115Z** (October8 NZDT).

**STOP condition:** the subsequent read-only verification wrapper raised
`R3_FINAL_OTR_CATALOG_DRIFT`. Execution stopped immediately. Read-only diagnosis shows
this wrapper omitted the catalog's required `SET LOCAL search_path=pg_catalog`, changing
catalog rendering. No database repair or destructive rerun occurred. Under the frozen
canonical catalog context the native SHA-256 is exactly
`59757774873268ad85c4ea5a5c23a4af37b19c38c96fb964d6d75c850d3d9b47`;
parsed expected/actual catalogs have **zero differences**. The transaction's own mandatory
catalog/privilege/CLOSED checks completed before COMMIT. This diagnostic does not resume
execution after the required check failed.

Committed `otr-r3-dev-v1` lineage retains the approved baseline hash, original artifact
source a817e8e and CLOSED-only/Server73-deferred scope. All68 historical rows including
names/statements retain their exact native hash; tail remains `20261004000300`.
Before/after counters match: **10 Auth users,589 Auth sessions,42 Storage objects**;
private bucket configurations retain their hash; managed relation/routine inventory counts
match. These counters are preservation evidence, not a full Auth/Storage row comparison.
Catalog is151 public tables+1sequence,323 functions,23 OTR roles,310 policies including7
OTR Storage policies. Person/Event/Source/Import gates remain CLOSED; provider runtime
remains killed/disabled, provider calls0. Trips0: no synthetic seed has run.

**Operational state:** `otr-dev-backend` remains stopped. Synthetic Auth/Trip/Ledger/receipt
seeding, Hosted Auth/RLS/Storage/domain smoke and device acceptance are **NOT STARTED**.
Keep DEV clients stopped and old outboxes quarantined. No device wipe/logout/queue deletion,
Production access, provider call/credential change, deployment, commit or push occurred.
Private evidence: `/private/tmp/otr-r3-private-20261008/execution-state.json`,
`cutover-result.json`, `execution-before.json`, `execution-failure-state.json`,
`execution-failure-catalog.json`, `execution-catalog-diff.json`,
`execution-canonical-catalog-hash.json`, `execution-lineage-closed.json`.
Preparation manifests below remain pre-execution evidence; their approval-required fields
are historical snapshots, superseded by this execution record.

**Next checkpoint:** Owner review of the failed verification context and committed state.
Do not rerun destructive SQL. A separately reviewed continuation must validate the corrected
read-only verification context before the existing Backend restart and approved seed/smoke.

STOP — R3 HOSTED DEV REBUILD EXECUTION / OWNER ACCEPTANCE REQUIRED.


2026-10-08. **READY for the separate destructive-operation Owner approval gate.** This is preparation
for DEV `tuqigdxrvrerfewsxqgm`, not a completed Hosted rebuild. No Production contact,
Hosted destructive operation/deployment, provider activation/call/credential creation,
new cloud project, device reset, commit or push occurred.

## Source and authority

The Owner approved CLOSED-only Beta, deferring Server73 OPEN/discovery/provisioning
without historical equivalence. [ADR](../adr/2026-10-08-r3-closed-only-dev-baseline.md)
and [design](OTR_R3_CLOSED_BASELINE_DESIGN.md) record this scope. On source drift, work
stopped. The Owner subsequently explicitly adopted canonical
**`b6daffecedab1616b173fde3f5e2de5d54770eff`** and authorized bounded completion.
Final remote main matches that commit. The isolated R3 task branch was fast-forwarded
from `a817e8e881e2fa2e094696b13bc4df2eca7e2db2`; no rebase, new commit or push occurred.
Other accepted branches/checkouts were not changed. Existing artifacts/backups were
preserved; the prior handoff/manifest were also privately retained before adoption.

Exact comparison:23 changed paths across8 retained commits, comprising Capture staging/
picker/UI, its Account-generation subscription, locale/guard/tests and Capture docs.
Every Server1–84 byte, SQLite1–50 registry/migration, existing runtime DB/API contract,
backend, repository, sync/provider module and dependency manifest is identical.
Protected roles derive from the unchanged84 SQL files. C1 stores transient picker
metadata only; Add remains disabled. No durable intake/upload, Source/Run/Review/domain
writer, scheduler or DB authority is added. Future P1/C2 contract documentation remains
implementation-gated; it does not change installed R3 semantics or introduce Server85/
SQLite51. [Canonical comparison/provenance](../../supabase/dev-baselines/r3-v1/canonical-provenance.json)
contains exact paths and byte-preservation evidence.

**Provenance is deliberately split:** current canonical/application source is b6daffec;
the unchanged SQL artifact was derived at a817e8e. Its installed lineage `source_commit`
truthfully remains a817e8e, and canonical adoption is recorded separately in the manifest/
provenance evidence. No SQL byte/hash/history was rewritten merely to relabel origin.
Source-chain SHA-256 remains
`08539e166ef1e823a1f93a3353f16f3b49b56a0f1fd4dd8c4650be9884947966`.

Worktree: `/private/tmp/otr-r3-lightweight-dev-rebuild`, branch
`codex/r3-lightweight-dev-rebuild`, HEADb6daffec. Older dirty canonical checkout,
Capture/Experience and other worktrees were preserved. R3 authors no UI/product expansion
and adds no dependency; accepted C1 source is retained without alteration.

## Baseline and lineage

[Manifest](../../supabase/dev-baselines/r3-v1/preparation.json) binds every source file,
artifact, target and test. [Source mapping](../../supabase/dev-baselines/r3-v1/source-mapping.json)
distinguishes actual historical bytes from separately marked disposable derivation inputs.
The final artifact has151 public tables/1 sequence,323 public functions,23 restricted
OTR NOLOGIN roles,310 policies including exactly7 OTR Storage policies, and five CLOSED
initialization tables. Financial constraints, audit/receipt immutability, Review privacy,
Trip links, Source/admission boundaries and call/journal responsibilities are retained.
All business/provider tables start empty. Existing buckets are retained and checked against
four approved private configurations; mismatch aborts.

No old DEV business rows transfer. Obsolete UI-polish fixture installers/repair helpers
are omitted. Empty-baseline backfills have no old-row work. Permanent Ledger schema stays;
this is not a legacy Ledger migration. Server73 OPEN roots, managed inventory/root and
activation generations are absent. Person retains CHECK(not enabled); all domain/provider
gates remain CLOSED. No platform-managed function body hash is pinned in R3.

Reserved-role checks require restricted flags/membership/ownership/schema rights and exact
OTR routine/table/column/index/sequence/policy ACLs. Non-OTR privileges are rejected across
all non-system namespaces, including unexpected schemas, column/sequence/default grants.
An inaccessible managed routine must have the exact managed schema owner and no schema
CREATE, with no USAGE or event-trigger-only invocation; actual extension members retain
established exemptions. Namespaces/owners/PUBLIC EXECUTE alone are insufficient. Final
verification is mandatory, independent of intermediate derivation guards. PostgreSQL
canonical-jsonb SHA commitments concern OTR objects only; full inventories remain reviewable.
They are new-lineage drift checks, not a recomputed historical Server73 acceptance root.
Sequence bigint metadata uses decimal strings to avoid Management API JSON rounding.

The exact68 cleanup drops explicit OTR policies and foreign keys, then triggers,
remaining constraints, defaults/generated expressions, grouped functions/tables,
owned sequence and enum types. All drops use RESTRICT; an unexpected external dependency
aborts. IF EXISTS covers constraint-trigger/owned-sequence auto-removal only after exact
preflight. No DROP SCHEMA, CASCADE, DROP OWNED or managed platform reset is used.

Actual `supabase_migrations.schema_migrations` stays68, unchanged names/statements/versions.
A private `otr_dev_migrations.lineage` records one actual R3 installation, artifact-origin source/hash,
old68 versions and explicit CLOSED-only scope. Fresh disposable installs record no fake
historical migrations. Future R3 updates must use an explicit reviewed new-lineage artifact;
ordinary CLI push/reset/repair is not the cutover mechanism.

This uses standard PostgreSQL DDL and preserves the managed service ownership boundary.
It is a custom OTR cutover, not a claim that Supabase certifies this cleanup or guarantees
restoration. Relevant primary documentation: [migration history](https://supabase.com/docs/guides/deployment/database-migrations),
[backup limits](https://supabase.com/docs/guides/platform/backups) and
[restore guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

## Backup and access evidence

Fresh private JSON exports completed2026-10-07T21:12:29Z, schema/data observed21:12:05Z/
21:12:12Z. Directory0700/files0600: `/private/tmp/otr-r3-private-20261008`.

| File | Bytes | SHA-256 |
|---|---:|---|
| fresh-schema-catalog.json | 4,329,914 | `383914233b7c87198e05e67c88cfd73b02ab921b848de40fb9f266e0977aa919` |
| fresh-business-auth-storage-history.json | 18,857,894 | `54f5e2ca891ae6fc3a460d40b3a38dc07137aee5a524e0152445c061b3dc440b` |
| retained-20261007-dev-schema-pre.sql | 781,734 | `3e1d402a80af9daee51e173b65158abaa4146fc555a37a31c274bb96da0b50c0` |
| retained-20261007-dev-data-pre.sql | 9,776,882 | `ffc6507831000001eb43be1e332d4ebaa33bd265f645591626cd8c13af4a1ac2` |
| retained-20261007-dev-roles-pre.sql | 431 | `0decd601faa70260a3a31e8ce63208cc4a4c1f99921bc6f3ed4faf1cd980da3a` |

Coverage148 tables:112 public,27 Auth,8 Storage,1 history. Four bucket configurations
and42 object metadata records are retained. Exclusions: Storage bytes, managed routine
bodies, provider credentials, a native executable archive, a cross-export snapshot and
restore rehearsal. Management API JSON numeric transport may also limit general-purpose
lossless restoration. These are verified readable nonzero logical evidence exports,
not a demonstrated restorable backup. Owner accepted possible non-restorability.

Installed CLI2.117.0 query resolver/source was read before use. A nonempty **nonsecret**
password placeholder bypasses temporary-login initialization, then uses existing Management
API authentication. Every Hosted request used explicit DEV ref and READ ONLY/ROLLBACK.
Existing `cli_login_postgres` expiry stayed2026-10-07T17:57:56.884149+00:00. Backend health
reported development/ok. No secrets/payloads were printed. The initial oversized4.4 MB
transport probe returned413. Duplicated inventories were replaced with exact OTR commitments;
a2.8 MB harmless read-only request succeeded, exceeding the proposed JSON payload2,719,553 bytes.
Exact compact cleanup preflight passed read-only in DEV as postgres with CREATEROLE.

## Local acceptance

Real disposable local Supabase stacks use Auth2.197.0, Storage1.73.1, Realtime2.130.0 and
PostgreSQL17.6.1.167; no broad platform emulator was built. All fixtures are new synthetic
local data. SQL suites roll back; no provider gate is activated. Exact final baseline
SHA-256 is `f065259a9cda07cc3c43008be06a975b42ce8534be16d35b7d83987852e01f52`.

| Check | Result |
|---|---|
| Two final baseline clean installs | PASS, fresh proof-a/proof-b; approximately1.1/1.2s |
| Existing financial mutation/conflict/evidence/receipt/settlement/payment/adjustment suites | PASS |
| Review, protected Source, Person reads/CLOSED participation, Event collection, CLOSED Flight Import security | PASS |
| Focused SQL total, including R3 CLOSED assertions | **16 files /647 assertions PASS** |
| Actual Auth signup/JWT REST isolation, profile-role escalation denial, private Storage upload/download/list and cross-Account denials | PASS |
| Deliberate privilege/function/default/membership drift | **8 checks PASS**, rolled back |
| Capture, SQLite, Import closure and provider-lifecycle tests | **6 files /228 tests PASS**, external network denied |
| Scheduler ownership and all five C operation denials | **24 tests PASS**, external network denied |
| Typecheck / UI guard | PASS; no UI modified |
| Exact unchanged historical1–68 replay and Hosted68-shaped ACL alignment | PASS |
| Complete68→R3 transaction before inventory compaction | PASS,1.842s;68 history rows and managed function/relation counts unchanged |
| Unexpected external dependency | RESTRICT rejected and transaction rolled back |
| Compacted OTR preflight / final catalog negatives | PASS, read-only DEV / local |
| Exact final compact-wrapper full rehearsal | **PASS,1.466s**, unchanged transaction hash; all68 history records, managed inventories and synthetic Auth/Storage sentinels preserved |
| Affected b6daffec Capture/Account/SQLite checks | **12 files /127 tests PASS**, external networking denied |
| Focused real service/privilege rerun | **16 Auth/Storage checks +8 SQL checks PASS**; valid-MIME Source originals access denial included |
| Current canonical build checks | Typecheck/UI guard PASS (78 roots); Backend build/isolation PASS (197 inputs, no Capture/native/test/fixture input) |
| Realtime subscriptions | Not applicable: no actual `.channel()`/`postgres_changes` OTR subscription found in data/features |
| Hosted post-cutover behavior / device QA | PENDING, separate approval absent |

Test adaptation is explicit: receipts get their missing pgTAP/search path; the obsolete
Server73 verifier assertion becomes the structural CLOSED-only assertion; the old Person
participation grant assertion becomes the stricter final CLOSED no-update restriction.
Original test/migration files are unchanged. Collection tests use superuser only to establish
synthetic NOLOGIN session authorization; Source SET ROLE negatives run as non-superuser postgres.
The earlier Source-original HTTP check used an unsupported MIME. Its bounded test correction
now uses an allowed PDF MIME and requires a row-level-security/permission denial; the real
localhost rerun PASS closes that local gap. Hosted post-cutover smoke still remains pending.

Historical `verify-baseline-artifacts.test.mjs` still expects74 migrations against84 and
fails unchanged. One exploratory historical Stage9 Europe-import test failed; legacy replay
is outside the approved Beta seed/data scope and is not claimed as an R3 PASS. CLOSED Source,
Import and provider runtime activation/positive live transport are intentionally not tested
as OPEN; UNKNOWN/no-resend is exercised by network-denied injected backend/mobile regressions.
No historical Server73 OPEN test is represented as equivalent.

## Proposed cutover commands

**Preview only. Local preparation is complete; do not execute until a separate explicit
destructive Owner approval binds this DEV target, final hashes and scope.** Reverify source,
identity and current OTR/history drift checks immediately before any later execution. The prepared transaction is
`/private/tmp/otr-r3-private-20261008/cutover.sql`,2,631,502 bytes, SHA-256
`c65d5c2c5b0b21eb22f82da96654c0254714496f5535fd23cb22b8f4062878c2`.
Cleanup SHA `5e643ea1597914f7adcdaeff86134a0a02357c4569efd42d3c4c1fa4dc90a170`.

Offline inspection/generation from the chosen source worktree:

```sh
python3 scripts/supabase/check-r3-preparation.py
python3 scripts/supabase/build-r3-apply.py --cleanup --output /private/tmp/otr-r3-private-20261008/cutover.sql
shasum -a 256 /private/tmp/otr-r3-private-20261008/cutover.sql
```

After separate approval: reverify ref/endpoint/source/backups/hash/history/closed boundaries;
coordinate all DEV clients/outboxes. On the existing DEV Backend host, use only the
[approved operations](../ops/DEV_BACKEND_DEPLOYMENT.md), from `/opt/otr/dev-backend/source`:

```sh
docker compose -f deploy/dev-backend/compose.yml stop backend
```

On the approved operator Mac, from the chosen R3 worktree:

```sh
umask 077
SUPABASE_DB_PASSWORD=R3_NONSECRET_PREFLIGHT_PLACEHOLDER /Users/xoery/Project/otr-mobile-canonical/node_modules/.bin/supabase db query --linked --project-ref tuqigdxrvrerfewsxqgm --file /private/tmp/otr-r3-private-20261008/cutover.sql --output json --agent no > /private/tmp/otr-r3-private-20261008/cutover-result.json
```

The script has one BEGIN/COMMIT, lock timeout3s, statement timeout120s, exact old68 drift/
history preflight, RESTRICT cleanup, baseline install, new lineage, final OTR privilege/
CLOSED checks and transactional PostgREST schema notification. Abort on every unexpected
object/permission/dependency/lineage/bucket discrepancy. Do not use CLI dump/reset/push/repair
or remove any managed namespace. Check command exit **and actual readback**, not stdout alone.

After committed readback/closed checks and approved synthetic seeds, on that same DEV host:

```sh
docker compose -f deploy/dev-backend/compose.yml start backend
curl --fail http://127.0.0.1:8787/health
curl --fail https://api-dev.xoery.art/health
```

No image build/source deployment/proxy reload or unrelated service restart is included.
Reserve10 minutes for coordinated cutover and acceptance;1.842s local SQL duration is not
Hosted downtime evidence. A failed pre-commit transaction restores old OTR state. Post-commit
backup restoration is best effort, with no recovery guarantee. Retained Storage bytes may
lose old business links. Keep clients paused on failure; do not auto-reset devices/queues.

## Synthetic seed plan and continuity

After the later approved cutover, reuse two explicitly chosen existing synthetic Auth
accounts or create them through the existing Auth service; never overwrite Auth identities,
create privileged platform credentials or print passwords. Record their UUIDs privately.
Use new R3 Trip IDs, never old Trip IDs: TripA/B `b3a30000-0000-4000-8000-000000000001/2`.
Each Account owns one isolated Trip, with an ordinary linked owner and one unlinked
traveller/Person. Ordinary Person defaults stay ACTIVE/0; no participation command is opened.
Review and record membership through existing contracts before device reenrollment.

Create two small NZD Expenses1200/800 minor units with600/600 and400/400 splits, same-currency
valuation and one small settlement/receipt linkage through the existing Backend contracts.
Use synthetic bytes only in the existing private ledger-receipts bucket; no OCR/provider
activation or old Ledger data migration. Use existing validated fixtures as examples, not
an unreviewed direct protected-table installer. Record idempotency keys and actual IDs.

Device-local Capture examples cover one exact-clock Flight and one unresolved temporal
input; local interpretation/review works without provider calls. No canonical Source/Run/
Review/admission fixture bypass is installed while those gates are CLOSED. Positive admission
and Server73 OPEN/discovery need future separately reviewed work. This gate is database
baseline preparation, not full Beta launch/device acceptance.

Project ref, Auth identities, Backend URL and SQLite1–50 stay fixed. Public profiles/Trips/
memberships are replaced; retaining an Auth session does not retain authorization to old
Trips. Explicitly coordinate cached data, cursors, receipts and outstanding queues. Do not
silently retry old identities against new Trips, wipe SQLite, log users out or discard queues.
All five C scheduler denials/provider gates remain CLOSED.

## Terminal status

Backup, canonical adoption and local baseline/domain evidence are recorded. **READY: YES —
OWNER DESTRUCTIVE APPROVAL REQUIRED.** No database-authority or migration-input change was
found; the pending exact compact-wrapper rehearsal and affected checks passed. Existing
647 SQL assertions/228 regression tests/24 scheduler tests are retained evidence, not
represented as new reruns. Stop for approval of the exact plan in the Owner gate.
No Hosted SQL mutation or deployment has been performed. Task-owned local containers
were stopped at the gate; proof volumes and private evidence remain. The temporary
node_modules symlink was removed without touching the original dependency directory.
