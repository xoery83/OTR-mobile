# Current Implementation State

Date: 2026-10-08 (Pacific/Auckland).

## R3 Hosted DEV rebuild — Final Owner Acceptance PASS

2026-10-08. Owner accepted the committed CLOSED-only rebuild, one Ledger forward
correction and bounded Hosted fixtures. This is documentation/Git closure only.

- DEV `tuqigdxrvrerfewsxqgm`: 36 Hosted checks PASS. Final catalog
  `c9adf99f4818b32d6aca81d22d3a17bc7ccd935652b59f95016fa19cb9982906`;
  function `73de5cd814b1b1feafc4bf08418a3c402708c80fd87e38119b64f7d1104ada1c`.
  Historical68, R3 lineage, roles/FORCE RLS, Auth/Storage preservation and CLOSED
  gates PASS. Original rebuild and forward each committed once; never rerun.
- Accepted fixture state: Profiles2, Trips2, members4, Ledger settings2, Expenses2,
  uploaded Receipt1, finalized settlement1. Transfer NZD600 minor OPEN/unpaid;
  OCR PENDING; provider calls0. Backend development/ok. Last verified Auth users12 /
  sessions595 and Storage43 (original42 preserved plus1 synthetic Receipt).
- SQL origin a817e8e; rebuild approved canonical b6daffe; forward local base4f97bb6.
  Current canonical main c2f1524 includes P4a/C4a. Historical migration files are
  unchanged; Hosted historical records remain68, without invented Server69–84 rows.
- Old device outboxes remain quarantined. Device first-sync/client re-enable is
  NOT accepted or authorized; no replay/wipe/reset/logout/rebind. Future device
  acceptance and OPEN/discovery/provider work require separate Owner decisions.
- Execution: architecture/OTR_R3_SAME_PROJECT_DEV_REBUILD_REPORT.md; forward:
  architecture/OTR_R3_FRESH_TRIP_LEDGER_INITIALIZATION_CORRECTION_REPORT.md and
  ../supabase/dev-forward/r3-v1/README.md. Environment/ops documents reflect R3.
- Documentation closure proposal: architecture/OTR_R3_DOCUMENTATION_CLOSURE_PROPOSAL.md.
  No Hosted/device/provider operation, commit or push in this closure. STOP for
  scoped commit review. Existing P4a/C4a handoff below is retained byte-for-byte.

## C4a canonical integration — Final Owner accepted

- Fresh isolated worktree `/private/tmp/otr-c4a-canonical-integration-20261008`, branch
  `codex/c4a-canonical-integration-20261008`. Ordinary two-parent merge:
  first parent accepted canonical P4a `4f97bb6f96daaab7f96f19d192683f63846a413b`,
  second parent accepted C4a `f3c54c3dbeda1a0613fade89c560718231c83db6`.
  Common ancestor `b6daffecedab1616b173fde3f5e2de5d54770eff`.
- Final Owner authorization accepts the prepared merge and permits one merge commit,
  safe canonical fast-forward and normal push only after final/post-merge checks.
  Local/fetched remote main must still equal the first parent before promotion.
- P4a and C4a acceptance/review history below is retained. All accepted runtime/test
  bytes and original reports/rechecks are preserved; only this shared handoff is
  reconciled. C4a stays dormant JSON-text pure assessment, separate from the accepted
  read-only Operations projection. No new runtime composition or authority.
- Bounded integration smoke: 21 files /432 tests PASS; typecheck, lint/UI guard,
  Backend build, formatting/whitespace and 90 schema/migration preservation checks
  PASS. Both accepted implementation/review trees retain exact bytes.
- Integration evidence: `architecture/OTR_PLATFORM_P2_C4A_CANONICAL_INTEGRATION_REPORT.md`.
  **C4a accepted for canonical integration. STOP after authorized closure/push.
  Integrated durable C4/C5, migrations, Hosted access and provider activation remain
  unauthorized.**

## P4a local Operations — Final Owner accepted / local closure

- Existing isolated worktree `/private/tmp/otr-platform-p4a-local-operations`, branch
  `codex/platform-p4a-local-operations`, accepted parent baseline
  `b6daffecedab1616b173fde3f5e2de5d54770eff`. Final Owner acceptance authorizes
  one local closure commit; main is unchanged and no push is authorized.
  No other active worktree edited.
- DEV diagnostics retains its Debug-gated, memory-only Account projection over
  Data Health, SQLite50 operational metadata and sync_operations. Six states,
  semantic/operator attention, explicit coverage, nullable usage/cost and measured
  compatible age remain. No new scheduler, route, endpoint or provider capability.
- Diagnostic session/identity uses read-only adopted v2 lookup, failing closed
  for unadopted/mismatched sessions; normal Auth legacy adoption is preserved.
  Screen preference reads now use the initialized DB handle too, with no cold
  open/migration path even for Debug Mode OFF. No listPending wake, network Auth
  refresh, Health run/repair, resume/dispatch or provider recovery from display.
- All contributing non-shadow attempt responsibility labels are schema-validated;
  corrupt older labels make the continuation source unavailable. Current terminal
  FAILED requires operator attention despite retained RUNNING; retry eligibility
  remains deferred, and older UNKNOWN dominates. Both locales reserve empty copy
  for a successfully read row source.
- Operations and Foundation observations use Account generation/current identity
  and focus/active/supersession/cleanup fences, including A→B→A. Cached Trip actor
  absence denies continuation metadata without IDs/counts. No evidence, Import
  admission, retained result or remote capability is disclosed/certified.
- Final focused validation: 17 files /297 tests PASS; typecheck, lint/UI guard,
  formatting, whitespace and 90 exact-base schema/sync preservation files PASS.
  Independent recheck also passed five files /24 external checks (overlapping
  coverage), closing all F1–F6 with zero remaining required findings.
  Original six negative scenarios reproduced before correction. No focused
  baseline failures; no full-suite, native/device or live-provider claim.
- Report correction section:
  `architecture/OTR_PLATFORM_P4A_LOCAL_OPERATIONS_BUILDER_REPORT.md`.
  Independent review retains its original findings and appended targeted PASS:
  `architecture/OTR_PLATFORM_P4A_LOCAL_OPERATIONS_INDEPENDENT_REVIEW.md`.
  Owner acceptance/closure is recorded in
  `adr/2026-10-08-p4a-read-only-local-operations.md`.
  STOP at local P4a closure. No Hosted/Production access, real AI call, deployment,
  migration, push or integration. P4b/P4c remain gated.

## Platform P2 / Capture C4a — final Owner review PASS / local closure

- Resumed `/private/tmp/otr-p2-c4a-pure-assessment-20261008`, branch
  `codex/p2-c4a-pure-assessment-20261008`, unchanged exact base
  `b6daffecedab1616b173fde3f5e2de5d54770eff`. Final Owner review PASS authorizes one
  local closure commit; external main advancement was not incorporated. Original
  Independent Review and appended targeted recheck PASS are preserved.
- R1: caller `INDEPENDENT` assertions now add `DEPENDENCY_UNKNOWN`; observed evidence
  remains visible, while supported semantics/Review promotion stays blocked.
- R2: primitive JSON-text input only, strict lossless grammar before schema/hash;
  raw objects including nested exotic data/Proxies reject without inspection.
  Valid synthetic fixture data is serialized by test callers. No Node domain import.
- Current Owner authorization supplies all five Capture constraints, recorded in the
  appended correction section of `architecture/OTR_PLATFORM_P2_C4A_IMPLEMENTATION_REPORT.md`.
- Validation: 4 files /135 tests PASS (87 C4a); 16 Builder targeted recheck checks
  PASS, plus 25 independent targeted checks PASS; typecheck, full lint/UI guard,
  formatting, whitespace and preservation PASS.
  Preparation/domain admission remain denied; no runtime composition or activation.
- **C4a accepted. STOP after the authorized local closure commit; no push/main
  advancement. Integrated durable C4/C5 remain unauthorized.**

## C1 canonical integration — prepared / independent review pending

- Isolated pending merge at `/private/tmp/otr-c1-canonical-integration`, branch
  `codex/c1-canonical-integration`: first parent Platform
  `a817e8e881e2fa2e094696b13bc4df2eca7e2db2`, proposed second parent Capture
  `79237cbd993792100ed51468e31671e4a2b59888`. All seven Capture commits retained.
- Automatic merge had no textual conflicts; this handoff is reconciled semantically.
  C1 and final CP15B/LIVE-W acceptance coexist. Owner Revision 1 acceptance/naming
  is recorded as a current decision, without a historical acceptance artifact.
- Bounded macOS matrix: 30 files, 670 PASS, 15 intentional skips. Linux custody,
  host and HTTPS: 63 PASS, 2 intentional skips. Typecheck/lint/UI guard/Backend
  build/bundle isolation and 88 schema/sync preservation hashes PASS. Counts
  overlap; no new full-suite, SQL environment or device acceptance is claimed.
- Report: `architecture/OTR_CAPTURE_C1_CANONICAL_INTEGRATION_REPORT.md`.
  Stop for independent review. No C2, SQLite51/Server85, Hosted access, provider
  activation, integration commit/push or main advancement.

## Capture C1 — owner iPhone device acceptance PASS

- Worktree `/Users/xoery/Project/otr-mobile-capture`, branch `trip/capture`, retained
  base HEAD `92b87bd20f0d4baf23d3b4da8934d3142133e765`; starting status clean.
  Owner accepted the complete C1 checkpoint and authorized a local commit only; no push.
- Authenticated temporary Capture route now mounts identity-neutral reusable content.
  Installed Files/Photos pickers compose ordered session-local metadata, support
  removal/cancel and preserve a fixed invocation prior. Leaving/unmounting discards
  staging. Final Add is disabled and explicitly says nothing has been saved.
- Existing Account generation gains subscription only; current request/apply gate
  fences callbacks and waits for local session installation. StrictMode effect replay,
  Account A→B→A/transition/blur, Trip-prior rerender and late picker results are tested.
- Independent C1 review fixed F1–F3 and final recheck PASS with **zero remaining
  CRITICAL/IMPORTANT/MINOR**. C1 **13 tests**; final scoped **16 files /175 tests PASS**.
  Typecheck, scoped lint/format, UI/terminology guard and whitespace PASS.
- Signed Release installed on owner iPhone 16 Pro / iOS 27.0.1 with existing data
  preserved; startup and Capture reachability verified. On 2026-10-08 the owner
  reported device acceptance **PASS**: add/remove Files, add/remove Photos in the
  same tray, Cancel, and intentionally unavailable durable submission. No broader
  VoiceOver, large-text, permission or native visual acceptance is claimed.
- Camera deferred because installed permission descriptions are receipt-specific;
  Magic Input/connections are outside C1. No dependency/schema/migration, durable
  submission, Source/Job/semantic Import/domain writer, Guest, automatic admission,
  Banner support or runtime/provider/Experience shell activation.
  C1 changed neither SQLite1–50 nor its then-current Server1–83 baseline.
  The integrated baseline retains Platform Server1–84 and all six accepted
  Capture documentation commits; no Server85/SQLite51 is introduced.
- Reports: `architecture/OTR_CAPTURE_C1_IMPLEMENTATION_REPORT.md`,
  `architecture/OTR_CAPTURE_C1_IMPLEMENTATION_REVIEW.md`, and
  `architecture/OTR_CAPTURE_C2_DURABLE_INTAKE_PREFLIGHT.md`.
- **C1 ACCEPTED at `79237cbd993792100ed51468e31671e4a2b59888`.
  The prior authorized local C1 commit is complete. C2 NOT STARTED.**
  C0 runs separately; no output is
  installed here. C2 awaits approved Batch/Job/context, item idempotency/atomic
  Capture-manifest linkage, partial recovery and native URI viability handoff.
  Existing CP14 accepted CLOSED scope and Platform CP15B/LIVE-W remain authoritative.
  CP14 owner closure/F2 targeted PASS is preserved in the unchanged final
  integration/closure reports; no older review-pending next step is reinstated.

## Joint P1 ↔ Capture C2 Revision 1 — accepted contract, implementation gated

Owner decision recorded on 2026-10-08 in the current authorization message,
“OWNER REVIEW PASS — AUTHORIZE C1 CANONICAL INTEGRATION BUILDER”:
joint P1 ↔ C2 Revision 1 is accepted, with final naming
`continuesFromInputId` / `continues_from_input_id`. This is a current Owner
decision, not a reconstructed historical acceptance artifact. The original
handshake and amendment retain their historical PROPOSED wording; their
implementation-gated contract is preserved. See
`adr/2026-10-08-c1-integration-owner-decision.md` for actual evidence paths/hashes.
Lineage is explicit and same-Account only; it implies neither byte equality,
replacement, assignment nor authority. No separate historical final Capture
acceptance artifact was supplied or fabricated.

Future C2 allocates stable submission/Batch/Job/context/Input/replay identities
once per explicit Add N and atomically registers a frozen ordered roster.
Batch and Job are separate UUIDs with a C2 1:1 shared header. Reuse SQLite48
originals; only two additive local tables are contemplated, not installed.
Hide/Close is available at every intake state and never cancels durable work;
`allInputsAccepted` is factual and never commands auto-close.
`availableActions` is derived and reauthorized at invocation. C2 is authenticated
only, uses passive Trip prior and fresh Account A→B→A fences. No new scheduler,
Job engine, Source/Run writer, Remote AI or Hosted prerequisite. P5 remains
deferred to C4. C1 Add stays disabled until a separate authorized C2 slice.

## Platform accepted checkpoint — R1-C1 strict live-host input grammar

The final LOW input-contract correction is complete. Production admits only ordinary
plain data objects with the five existing field names; complete own-key/descriptor
inspection rejects hidden unknowns, symbols and accessors. Custom/null prototypes,
classes, detectable proxies and added inherited unknown/capability fields reject
before configuration/custody/secret/gateway/transport/dispatch. Linux-only composition
and fixture isolation remain unchanged.

Validation: strict-input/original A–G/startup/bundle/transport focused204 PASS;
additional authority/SQLite/persistence/sync328 PASS (overlapping counts), explicit
cold12 PASS; Linux63 PASS; Server84 security104 PASS/gates CLOSED; scheduler24 PASS.
Typecheck/lint/UI guard/build/format/whitespace and exact-base schema/sync preservation
PASS. No new regression or broader behavior change; full suite not rerun for this
narrow correction. Final independent R1-C1 targeted recheck PASS is appended to the Independent Review,
with zero remaining CRITICAL/IMPORTANT/LOW findings. Details/all answers remain
under FINAL LOW R1-C1 in the Builder report. Prior review-pending statements below
are historical and superseded by that final independent recheck.
LIVE-1 remains unauthorized. Accepted Platform commits are retained; no new
integration commit/push/activation.

## Prior checkpoint — F1-R1 portable composition separation

Recovered review identified a production-reachable portable custody/fetch seam.
It is removed: production accepts only provisioning/config, always admits Linux
anchored custody and continuity before fixed native HTTPS construction, and rejects
legacy/unknown capability fields. No fetch identity or wrapper-shape security gate.
Portable root is fixture-only with its own fake credential/transport, absent from
server exports/imports and compiled Backend bundle. Shared validation, witness,
recovery/readback and existing executor logic acquire no security capabilities.
Original Linux filesystem F1 source/tests remain unchanged and regressions pass.

Validation: Linux63 PASS; focused361 PASS; actual startup7 combinations PASS;
Server84 security104 PASS; SQLite cold19 PASS; full2,643 PASS with same reproduced
exact-base Ledger failure and zero new final failures. Typecheck/lint/UI guard/build
and export/bundle/format/preservation checks PASS. Earlier intermediate parse failures
were corrected and rerun, not called baseline. Details/all answers are appended under
TARGETED F1-R1 in `architecture/CP15B_LIVE_WIRING_IMPLEMENTATION_REPORT.md`.
Independent Review unchanged; no commit/push/activation. Next: targeted independent
F1-R1 recheck. LIVE-1 remains unauthorized.

## Prior checkpoint — Owner-approved Linux anchored F1 correction

The Linux-only contract from `architecture/CP15B_LIVE_W_LINUX_CUSTODY_SPIKE.md`
is now implemented. Custody requires Linux/procfs, safe descriptor-by-descriptor
admission from `/`, service-owned0700 root, private0600 files and capability checks.
All normal I/O uses the retained root FD; replacement and parent retargeting cannot
switch namespaces. File fsync, immutable hard-link publish and two directory fsyncs
precede ACK. macOS/Windows reject real filesystem custody; protocol tests explicitly
inject test custody and intercepted HTTP without weakening production admission.

Restart requires an opaque store UUID plus mount metadata provided independently
through trusted host provisioning, a matching preprovisioned private marker and exact
retained request pin before transport construction. Empty/replaced/missing custody
cannot permit provider replay. Metadata restore requires explicit host reattestation;
no new dispatch authority, native addon, schema or privilege is introduced.

The earlier macOS blocked attempt is preserved in the appended Builder report;
the Owner-approved narrower platform contract resolves that blocker. Independent
Review is unchanged. Next: targeted independent F1 recheck; LIVE-1 unauthorized.
Validation: Linux 48 PASS; focused331 PASS; SQLite cold19 PASS; Server84 security104
PASS; full2,613 PASS with same exact-base Ledger failure and zero new failures.
Typecheck/lint/UI guard/build PASS. Final evidence is appended under
TARGETED F1 — LINUX ANCHORED CUSTODY
CORRECTION in `architecture/CP15B_LIVE_WIRING_IMPLEMENTATION_REPORT.md`.

## Prior checkpoint — CP15B-LIVE-W CLOSED host wiring

Fresh worktree `/private/tmp/otr-cp15b-live-wiring`, branch
`intelligence/cp15b-live-wiring`, exact accepted base/retained HEAD
`56a050c0063bd062cb0bac7f50b928dfeb79ca6f`. Changes are uncommitted; no push.
Original dirty checkouts and retained LIVE-0 planning input are preserved.

- DEV/FLIGHT_IMPORT_V1 private composition reuses the accepted CP15B executor and
  verified Server84 gateway. Normal startup supplies no actual issuer/session/
  workflow provisioning and remains CLOSED. TEST/PRODUCTION construction rejects.
- Dedicated environment resolver, fixed HTTPS POST with no redirects/retries,
  independent default-CLOSED host transport and one-shot gates, and bounded
  versioned response-model witness are implemented. Tests inject fake environment
  and deterministic HTTP; no actual developer-process key is read.
- Private immutable filesystem custody retains requests, raw responses, exact
  task/attempt/call/config associations and interpreted results before metering or
  install. File/directory fsync precedes acknowledgement. Persistent host mounting
  is documented but unprovisioned. No new schema or durable business authority.
- Immutable acceptance session binds one Account/task/attempt/call/request. Existing
  Server84 fresh mark CAS governs the one transport handoff across restart; lost
  ACK/MAY_HAVE_STARTED/UNKNOWN never replay. Raw response recovery repeats pure
  parsing/rebinding/CP13B under current disclosure authority, without provider I/O.
- Safe host readback is composed; complete server hold/price/cost reads use existing
  protected Admin/Recovery or documented operator-only read-only SQL. No grants/UI.
- Validation details and final readiness are recorded in
  `architecture/CP15B_LIVE_WIRING_IMPLEMENTATION_REPORT.md` with 2,609 full-suite passes, one exact-base Ledger failure, zero new failures;
  actual network-denied Server84 E2E and 104 security checks PASS.

## Accepted foundation and active schema

Server migrations are contiguous **1–84**, ending at
`20261007000100_flight_dev_dispatch_foundation.sql`, SHA-256
`46e80899f14817d5162f255383e303232a12276e662f34b2cb16156c34d4f2a9`.
SQLite remains **1–50**; every migration and registry byte is unchanged by LIVE-W.
The 88 preservation hashes match. No Server85/SQLite51 is authored.

CP15B independent targeted F1–F4 recheck PASS supersedes its historical initial
findings. Recovery repeats current Account/Trip/material authority after custody;
mark serializes Trip revoke; immutable holds bind exact executing pins; calculated
schedule cost stays ESTIMATED independently of actual token quality.

CP14 Final Closure targeted PASS, A2/C2/B2 and CP13A/B remain accepted foundations.
SQLite50 continuations/attempts and `sync_operations` retain their separate owners;
the five C operation denials remain unconditional. CP13B owns interpretation;
CP13A owns reviewed canonical commands. Inbound does not schedule paid outbound.
Capture owns originals and adds no automatic Source authority. Source IO_UNKNOWN
provider terminality and canonical activation remain outside this checkpoint.

## Next checkpoint and critical boundaries

Next: independent review of the prepared, uncommitted C1 integration.
Integration preparation is Owner-authorized; merge commit/main update/push and C2
persistence remain separately gated. Final Independent R1-C1 recheck is
complete/PASS. LIVE-1 provider use is **not authorized**. It needs
real dedicated issuer/session/workflow provisioning, persistent private mount,
official current model/currency/price revalidation, dedicated Mobile DEV key,
current internal Account/Trip/material authority, one-call Owner authorization and
explicit immutable monetary policy/scope/grant. Proposed maximum USD0.0049152 is
not activated. No Hosted Dev/Production inspection, deployment or real provider call.

DEV runtime defaults disabled/killed; TEST/PRODUCTION real dispatch structurally
CLOSED. Vision, Apple, fallback, shadow and public B2 remain OFF. No new endpoint,
scheduler, automatic polling, queue draining or Event execution. Never erase private
custody or reset identity to retry UNKNOWN. Retention grants neither disclosure nor
installation authority. Cached valid sessions keep offline access.

Authoritative next-task inputs:

- `architecture/CP15B_LIVE_WIRING_IMPLEMENTATION_REPORT.md`
- `adr/2026-10-07-cp15b-closed-live-host-wiring.md`
- accepted CP15A preflight and CP15B implementation/independent targeted recheck
- API_CONTRACT, DATA_MODEL, OFFLINE_SYNC and DEV Backend deployment/runbook
- Owner-reviewed LIVE-0 report in `/private/tmp/otr-cp15b-live0-readiness`

Read only directly relevant additional files. No legacy Web reaudit or redesign of
accepted CP13/CP14 authority. Canonical UI primitives/glossary and UI guard remain
mandatory for later UI work; no UI is changed by LIVE-W.
