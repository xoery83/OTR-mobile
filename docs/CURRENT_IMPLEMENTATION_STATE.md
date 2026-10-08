# Current Implementation State

Date: 2026-10-08 (Pacific/Auckland).

## Capture C2 — FINAL OWNER REVIEW PASS

- On 2026-10-08 the Owner accepted C2 local durable intake, SQLite51, native
  Files/Photos submission, atomic CP11 binding, idempotent recovery, offline
  local acceptance and scoped Job read/reopen. Device testing and the final
  read-only persistence audit are accepted. One local checkpoint commit is
  authorized on `codex/capture-c2-builder`; stop after commit. No push, merge,
  rebase or cherry-pick. C3 Activity, AI processing, canonical admission and
  runtime/provider gates remain unauthorized.
- Owner tested mixed Files/Photos **4/4 saved**, iCloud acquisition, duplicate
  submission disabling, Hide/navigation/restart and offline local submission.
  Audit found **7 Jobs /11 ACCEPTED Inputs /11 Captures /7 retained payloads**,
  exact bytes/hash/Account scope valid, zero integrity violations. Offline Job
  `afd3c134-a31c-4267-88fe-15214444a951` persisted **2/2**, attributed by Owner
  confirmation rather than inferred network telemetry. Three identical device DB
  snapshots and read-only repository reopen/Account checks passed with zero writes.
- Normal Capture opens an empty new staging tray; retained Jobs require exact
  Job reopening. C3 Activity discovery is not installed.

## Accepted C2 device gate evidence

- Engineering review accepted for device testing by the Owner on 2026-10-08.
  Signed `OTRMobile` Release arm64 with Team `U9D5C58Z94` and unchanged bundle
  `com.xoery.otrmobile` was overwrite-installed on Leon's iPhone16pro
  (iPhone 16 Pro / iOS 27.0.1). Startup and Capture reachability verified.
- Actual retained device database migrated **50 → 51**. Upgrade rehearsal preserved
  every old table/row exactly; actual startup preserved all 9,242 old rows and
  historical migration records. 83 old data tables are byte-equivalent as typed
  row projections; existing startup health scanning changed only scan timestamps
  and generation in one `data_health_state` row. No submission was made during installation checks; later Owner submissions
  and the accepted persistence audit are recorded above.
- Full device-gate evidence: `architecture/OTR_CAPTURE_C2_OWNER_DEVICE_GATE_REPORT.md`.
  No product code/configuration correction or uninstall/reset was required.
  Build uses local-only API configuration without Hosted credentials. Owner C2
  device acceptance is now PASS; C3 and runtime/provider gates stay closed.

## Accepted C2 implementation

- Isolated worktree `/private/tmp/otr-capture-c2-builder`, branch
  `codex/capture-c2-builder`, exact starting/parent HEAD
  `b6daffecedab1616b173fde3f5e2de5d54770eff`. The Owner authorizes the complete
  local checkpoint commit; existing worktrees remain preserved. No push, merge,
  rebase, deployment, Hosted access or provider activation.
- SQLite51 adds exactly two local tables: immutable Batch/Job header and ordered
  Input manifest. Distinct Batch/Job UUIDs are 1:1. Explicit Add freezes stable
  submission/context/Input/replay identities; registration persists the whole
  roster before reading bytes. Registration is intent, not saved evidence.
- CP11 storage/quota/dedup logic is factored into a narrow transaction-local seam.
  First verified content pins persist before acceptance; original and Input binding
  commit atomically. Exact-key readback recovers lost registration/pin/acceptance
  ACK. Unverifiable outcomes retain the original request rather than create new
  identities. Accepted originals and both manifest tables are deletion-protected.
- C1 Files/Photos now submit through the data operation and bounded read-only native
  URI adapter. UI displays selected/saved/failed/pending truth, safe reasons and
  local custody. Hide is always available and never cancels durable work. No
  automatic close or semantic-import success is shown.
- Explicit recovery uses immutable `continuesFromInputId` /
  `continues_from_input_id` to an older same-Account Input. New unpinned recovery
  is a distinct Batch/Job; pinned recovery requires verified original bytes.
  Forward/reverse lineage is checked; it transfers no acceptance or authority.
- Scoped register/submit/read/list/reopen/exact-key recovery/resume are available.
  Read models derive `allInputsAccepted`, intake settling and action availability;
  processing is NOT_INSTALLED, semantic result counts are zero/null. Current
  authorization and revisions are rechecked at invocation. One Account generation
  survives all async action phases; fresh A may reopen after A→B→A, old actions may
  not. Trip prior stays nullable/passive and originals enter INBOX.
- Validation: affected regressions **18 files /510 PASS**; independent final review
  **10 files /200 PASS**, no remaining CRITICAL/IMPORTANT/MINOR. Final serial full
  suite **212 files /2,737 tests: 2,721 PASS, 1 FAIL, 15 SKIP**. Exact-base archive
  (1,186 tracked files verified) reproduces the same architecture-boundary failure:
  **210 files /2,691 tests: 2,675 PASS, 1 FAIL, 15 SKIP**. The guard scans the literal
  forbidden-module name inside the pre-existing staging-test regex. No new final
  failed file/test; no global full-suite PASS claim. Earlier version50 assertions
  were updated for the additive migration and rerun.
- Typecheck, lint/UI/terminology guard, changed-file format, whitespace, Backend
  build and offline iOS bundle export PASS. Repository-wide format retains the
  same 25 unchanged exact-base issues; all changed files pass. All **88 historical migration files**
  are byte-preserved; registry adds only the SQLite51 import/entry. The later signed
  device Release/install evidence is recorded above; Owner acceptance applies only to the stated C2 scope.
- Limitations: actual Files/Photos provider URI lifetime/readability/fidelity and
  device accessibility/visual acceptance remain unverified. Inaccessible handles
  fail safely. C3 Activity/Recent Imports is not mounted; scoped list/reopen and
  `/capture?jobId=<UUID>` are seams, not a discoverable Activity surface.
- Reports: `architecture/OTR_CAPTURE_C2_IMPLEMENTATION_REPORT.md` and
  `architecture/OTR_CAPTURE_C2_INDEPENDENT_REVIEW.md`; decision:
  `adr/2026-10-08-capture-c2-local-intake.md`. Next checkpoint: stop after the authorized local C2 commit. C3 and runtime
  gates require separate authorization.

## Accepted foundation and active schema

- C1 was owner device-accepted at Capture `79237cbd993792100ed51468e31671e4a2b59888`
  and integrated into exact canonical `b6daffe…`. Preserve its independent report,
  seven original commits and generation subscription. Current C2 uses the canonical
  integrated baseline; it does not execute on the old Capture HEAD.
- Owner acceptance of P1 ↔ C2 Revision 1 and final lineage naming is recorded in
  `adr/2026-10-08-c1-integration-owner-decision.md`. External historical handshake
  and amendment retain PROPOSED wording; that record preserves their exact paths
  and hashes. Current C2 authorization supersedes the historical persistence gate.
- Active local migrations are **1–51**. SQLite48 originals, SQLite49 Import
  admission, SQLite50 continuations/attempts and their owners remain unchanged.
  Server remains **1–84**, tail `20261007000100_flight_dev_dispatch_foundation.sql`,
  SHA-256 `46e80899f14817d5162f255383e303232a12276e662f34b2cb16156c34d4f2a9`.
- CP13A/B reviewed Flight interpretation/closure/preparation, CP14 final CLOSED
  A2/C2/B2 integration and CP15B final F1–F4/R1-C1 corrections remain accepted.
  SQLite50 continuation C2 is a separate owner from Capture C2. Generic five C
  queue-operation dispatch denials remain unconditional. READY/preparation is not
  accepted canonical output; no new Source/Representation/Run/Import writer.
- CP15B/LIVE-W startup remains CLOSED. Linux anchored private custody, exact
  one-call mark/recovery, portable fixture isolation and strict input grammar keep
  their accepted contracts. LIVE-1 remains unauthorized. No issuer/session/workflow,
  private mount, monetary policy, credentials or provider is provisioned here.

## Authoritative references and remaining gates

Read this handoff first; inspect only task-relevant dependencies. No legacy Web
reaudit or independent redesign of accepted decisions.

- Capture: five accepted UX/Resolution/Review/Custody/End-to-End documents,
  `architecture/OTR_CAPTURE_IMPLEMENTATION_READINESS_AUDIT.md`, C1 reports,
  `architecture/OTR_CAPTURE_C2_DURABLE_INTAKE_PREFLIGHT.md` and the C2 reports above.
- Platform: `architecture/CP15B_LIVE_WIRING_IMPLEMENTATION_REPORT.md`, independent
  targeted rechecks, `architecture/CP15B_REAL_DEV_DISPATCH_IMPLEMENTATION_REPORT.md`,
  `architecture/CP15B_LIVE_W_LINUX_CUSTODY_SPIKE.md` and accepted CP14 final
  integration/closure reports. Historical headings do not reopen accepted findings.
- Owning contracts: PRODUCT, ARCHITECTURE, DATA_MODEL, API_CONTRACT, OFFLINE_SYNC;
  Import architecture/contract/schema registry and accepted CP13A/B reports.
- UI uses `architecture/ui-foundation.md` and normative terminology glossary.

C3 Activity, Guest/adoption, whole-batch semantic assessment, Review/Banner/OS
notifications, Photo cloud, Wallet, Ledger side effects and final Experience shell
remain deferred. No new scheduler, startup polling, queue draining or remote AI.
Source IO_UNKNOWN/provider terminality and safe I/O retry remain blocked; completion
or retained lineage never authorizes evidence release or retry of unknown execution.

Cached valid local sessions retain offline access; background refresh failure pauses
sync instead of blocking app launch. Current Account/Trip/material authorization and
exact immutable pins govern disclosure and execution independently of retention.
Production is not a development target; no Hosted Dev/Production access occurred.

STOP AFTER THE AUTHORIZED C2 COMMIT. C3 AND RUNTIME GATES REMAIN UNAUTHORIZED.
