# CP14 Persistence & External Integration Control Plane Implementation Report

Date: 2026-10-06. Status: **READY FOR FINAL CP14 PERSISTENCE INDEPENDENT RECHECK**.

## Exact base, scope and authorization

- Branch: `intelligence/cp14-persistence`.
- Base and retained HEAD: `c4571746b0c300fa3b46842cd37745963567338c`.
- Fresh isolated worktree: `/private/tmp/otr-cp14-persistence`; startup was clean.
  Existing canonical/A/B/C worktrees and their uncommitted changes are preserved.
- Approved preflight and owner VerifiedCallContextV1 clarification govern this
  implementation. Their copied bytes, owner plan and authority-split ADR are
  preserved. CP12/CP13A/CP13B reports/contracts and Apple spike status are unchanged.
- “Installed” means authored/registered closed code and disposable acceptance,
  not Hosted Dev/Production deployment. No commit, push, provider invocation,
  runtime activation or product scope expansion occurred.

## Server83 inventory and authority

One additive migration: `supabase/migrations/20261006000100_external_integration_persistence.sql`.
No Server84. Historical1–82 remain byte-identical, with82 tail
`20261005001100_trip_import_undispatched_revocation.sql`.

Fifteen tables:

- `external_integration_environment_state`
- `external_integrations`
- `intelligence_provider_configs`
- `external_integration_price_schedules`
- `external_integration_price_schedule_units`
- `external_integration_calls`
- `external_integration_usage_events`
- `external_integration_config_audit`
- `external_integration_health_observations`
- `external_client_identities`
- `external_client_grants`
- `inbound_ai_import_reservations`
- `inbound_ai_invocations`
- `inbound_ai_review_decisions`
- `external_integration_admin_grants`

Fixed protected roots all have `(context jsonb, command jsonb)` signatures. This
keeps internal verifier-derived context separate from strict named v1 command
payloads, equivalent to the approved fixed-command boundary:

- `external_integration_configure`
- `external_integration_set_kill`
- `intelligence_provider_config_append`
- `external_integration_price_append`
- `external_integration_health_observe`
- `external_integration_reserve_call`
- `external_integration_mark_dispatch`
- `external_integration_usage_append`
- `external_integration_observe_call`
- `external_client_authorize_grant`
- `external_client_revoke_grant`
- `inbound_ai_reserve_package`
- `inbound_ai_attach_material`
- `inbound_ai_reserve_invocation`
- `inbound_ai_complete_invocation`
- `inbound_ai_reserve_review`
- `inbound_ai_observe_review`
- `inbound_ai_status`
- `external_integration_admin_report`
- `external_integration_recover_exact`

Two internal meter-owner bridges reserve generic inbound call+START and append
matching completion usage. EXECUTE is only granted to inbound_writer. The bridges
validate original dedicated session, exact call/invocation/owner/client correlation
and typed observations; they do not grant inbound_writer meter-table writes.

Nine isolated NOLOGIN roles:

- `otr_external_integration_config_writer`
- `otr_external_integration_meter_writer`
- `otr_external_integration_inbound_writer`
- `otr_external_integration_reader`
- `otr_external_integration_admin_gateway`
- `otr_external_integration_call_gateway`
- `otr_external_integration_inbound_gateway`
- `otr_external_integration_reporting_gateway`
- `otr_external_integration_recovery_gateway`

All tables are postgres-owned, ENABLE+FORCE RLS, with strict checks, reference
indexes/FKs, immutable-history/CAS guards and deferred fixed cross-row integrity
triggers. Gateway roles have zero table rights. API/PUBLIC/service roles have no
new table/column or protected/helper EXECUTE rights. Private owners have only the
listed table/column and fixed-function edges, no canonical mutation rights, schema
CREATE or outgoing membership. Temporary migration SET/INHERIT/schema CREATE rights
are removed before commit of the disposable migration transaction.

PostgreSQL17 automatically retains creator ADMIN grants to trusted database owner
postgres, granted by supabase_admin, with SET/INHERIT false. This is the approved
DB-owner administrative exemption, not a runtime/API membership guarantee. The
actual [security inventory](CP14_PERSISTENCE_SECURITY_INVENTORY.json) records all
15 tables,58 functions,9 roles and these edges; no checker was weakened.

Authentication is an injectable trusted Backend responsibility. SQL verifies
actual session, strict bounded internal context, request/action/environment digest
and identity bindings, then current durable admin/client/grant/Trip authorization.
Call gateways require a trusted workload principal; outbound admission checks
current Trip access. The server retains the complete admission command digest,
including START facts, and rejects changed outbound or inbound admission replays.
Admin grants cannot be self-provisioned by product commands. No caller GUC,
verified flag, actor UUID, generic service_role or second signed-attestation system
is trusted. Live verifier and connector login provisioning remain uninstalled.

## Durable semantics verified

- Registry config and kill use serialized CAS and immutable safe audit. Runtime
  is CHECK-closed to false; default TEST/DEV/PRODUCTION are killed. Ordinary admin
  configuration cannot activate execution. Old-config health remains history and
  cannot overwrite the current projection. Latest DISABLED provider config blocks
  stale ELIGIBLE admission.
- Prices are immutable, scope/currency-specific and half-open. Supersession clips
  the old derived interval without rewriting/reviving it; overlap rejects. Calls
  retain exact historical schedule pins. Exact BigInt rational calculation sums
  fractions and rounds once to integer nanos. Missing billable units or ambiguous
  inclusion produce UNKNOWN. No FX, historical repricing or customer charging.
- Reservation consumes quota/rate capacity; START and call commit atomically.
  Lost START acknowledgment recovers the same call. Dispatch rechecks admission
  without double-counting its own reservation. Runtime remains closed. Timeout
  provides no refund or fresh key. UNKNOWN requires exact trusted terminal proof.
- Usage is append-only/key-deduplicated, with nullable independent counters and
  bounded numeric extensions. START has no invented call/token/cost measurements.
  Built-in and bounded-extension per-counter cumulative snapshots replace; disjoint deltas deduplicate, corrections
  explicitly supersede. Actual cost replaces estimates independently of usage.
  Late observations remain accepted after terminal/UNKNOWN/install failure/disable.
  Safe reporting separates currencies and preserves unknown counters/cost.
- Inbound verified issuer/subject/auth-config and current user/Account/session/grant
  scope are distinct. Explicit OTR user confirmation is required for review; an
  external sender cannot assert it. Expired/revoked grants and removed Trip access
  withhold disclosure. Same package key/digest/client returns retained state; changed
  digest/client/Account rejects. Same invocation response loss retains one call.
  Generated Confirmation/slot/operation/Event locators persist before side effects.
- Safe reservation projection updates use CAS/result versions; invocation/review
  snapshots are sealed. COMPLETE/PREPARED never means canonical Event applied.
  UNKNOWN journals retain responsibility and use trusted recovery, not new keys.
  Fresh authorized same-scope grant admission can retain original historical pins;
  support read recovery is minimized and never executes a canonical command.
- Private material custody remains an interface only. Exact Account/reservation/
  reference/hash/byte bounds are defined, with a4MiB integrity validator. Host
  material attachment/review requires a separate injected trusted custody admission;
  authentication or an opaque UUID alone does not prove stored bytes. SQL fixture
  references are synthetic trusted metadata, not a real store or device bridge.

## SQLite50 and closed repositories

`src/data/db/migrations/intelligenceContinuations.ts` is registered once at the end
of `src/data/db/migrations.ts`. Historical1–49 SQL/source bodies are unchanged;
only the new50 import/registration is added to the historical registry file.

Logical continuations pin Account/Import/manifest/input/policy/schema/consumer and
optional Run/Candidate/Event bases. Ordered attempts pin request/provider/config/
queue/fallback/shadow identity. Execution, terminal outcome, installation and
metering are independent. Current-pass complete can coexist with outstanding
bounded waits; unsupported/exhausted waits terminate rather than wait indefinitely.

The repository requires local owning manifest/Trip/policy/budget/wait validators
and trusted exact recovery verification. These are closed injectable seams, not
A/B/C runtime adaptation. Account apply gate and SQLite transactions protect local
CAS/pins/install only; callbacks must never perform external I/O there. `sync_operations`
remains sole scheduler/claim owner. No model attempt is created by wait/wake; queue
attempt_count and lease expiry do not authorize redispatch.

Retention guards and maintenance anti-joins preserve referenced queue/Capture
originals/Source revisions and representations/Input/Run/Candidate/attempt facts
with FK ON or OFF. UNKNOWN, cancellation and Account switches never age-delete
responsibility. Material custody release requires verified positive closure;
terminal pruning/privacy horizons and live release operations remain separately
unapproved. No arbitrary retention duration or duplicate cost ledger is introduced.

Typed tests correlate task→attempt→call→usage→publication/config/fence, including
meter failure without redispatch, fallback/shadow lineage and Account fencing.
The server bridge independently tests invocation/call/usage correlation. No provider,
network bridge, Ledger/Day mutation or certificate semantic change is exercised.

## Acceptance and regression evidence

| Gate                                                   | Result                                                                                         |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Fresh exact server1→83                                 | PASS in network-none disposable Supabase PostgreSQL17.6 fixture                                |
| Seeded exact82→83                                      | PASS: all old public table column definitions/function bodies and synthetic auth row unchanged |
| Historical source hashes                               | PASS:86 files;82 server files plus historical SQLite registry/three standalone sources         |
| Server protected-command/authority harness             | **548 checks PASS**                                                                            |
| SQLite fresh0→50,49→50, FK ON/OFF, file cold reopen    | PASS                                                                                           |
| Focused CP14 local/Backend                             | **2 files /58 tests PASS**                                                                     |
| Selected existing regressions                          | **15 files /532 tests PASS**                                                                   |
| Full Vitest                                            | **198 files /2,055 tests:2,054 passed,1 failed;11 failed files**                               |
| Typecheck, lint/UI guard, Backend build                | PASS; UI guard473 legacy occurrences/76 representative UI files                                |
| Implementation-file formatting, whitespace, exact HEAD | PASS                                                                                           |

The server harness tests PUBLIC/API table/helper denials and actual SELECT/UPDATE/
DELETE/TRUNCATE denials, role/session binding, admin expiry/CAS/concurrency, environment/
integration kills, stale provider eligibility, pricing supersession/overlap/currency,
health race, concurrent quota/rate reservations, START/final/recovery/late nullable
usage, cumulative/delta/correction, actual-vs-estimated cost, inbound identity/actions/
expiry/revoke/current Trip permission, package/invocation/generated review replay,
sealed result/completion correlation, UNKNOWN and absent canonical authority.

Local tests exercise immutable identity/CAS, real retained Capture and Source/revision/
Input/Run/Candidate pins, missing Event pins, queue/Account scope, dependency cycles/
bounds, ordered attempts, shadow no install, bounded waits/current-pass coexistence,
RUNNING/UNKNOWN recovery, cancellation/late result, meter loss, install rollback and
file-backed cold reopen. Owning manifest/Trip admission is injected; no live device
or material store validation is claimed.

Failure classification:

- **NEW REGRESSION:** none remaining.
- **CORRECTION DEFECT:** resolved integration expectations, row/alias/JSON-path/ACL/strict-validation defects; final acceptance passes.
- **EXISTING BASELINE BLOCKER:** ten native Flow collection failures and the Ledger architecture assertion.
- **ENVIRONMENTAL:** disposable platform startup, schema owner and function default ACL setup; corrected without historical checker changes.

Full-suite failures match the exact-base CP13B baseline: ten native Flow collection
blockers and the existing Ledger UI architecture assertion. No new failed file or
assertion remains. Six migration-tail expectations were updated for50; their old
schema/data preservation assertions remain, explicitly allowing the new narrow
intelligence indexes/triggers. These were implementation integration defects, not
ignored baseline failures. Disposable platform ownership/default-function ACL setup
was corrected to satisfy unchanged historical69/73 security inventories. Earlier
reserved-name/composite-row/alias/JSON-path/bridge-ACL defects were fixed and rerun;
no historical checker or unrelated baseline code was changed.

The byte-preserved owner next-stage plan has an inherited Prettier warning; it is
excluded from implementation formatting and is not rewritten for style. SQL replay
and Python syntax/whitespace checks cover files outside Prettier support.

Replay helper: `scripts/cp14/replay-disposable.py`; acceptance:
`scripts/cp14/persistence-acceptance.py`. Both use only the task-owned
`otr-cp14-acceptance` network-none container, no ports or hosted connection.
Replay requires the existing schema-only `/private/tmp/cp13a-platform-schema.sql`
and disposable `otr-cp13a-acceptance-review` for immutable hash-pinned nonpublic
platform function definitions. These are local fixture prerequisites, not production
or provisioned gateway dependencies. The normal repository Vitest/tooling uses the
already installed canonical node_modules via a temporary symlink; that symlink is
removed from deliverables after validation. No dependency was added.

## Exact changed files

- `backend/src/externalIntegrationPersistence.test.ts`
- `backend/src/externalIntegrationPersistence.ts`
- `docs/API_CONTRACT.md`
- `docs/ARCHITECTURE.md`
- `docs/CURRENT_IMPLEMENTATION_STATE.md`
- `docs/DATA_MODEL.md`
- `docs/OFFLINE_SYNC.md`
- `docs/adr/2026-10-06-cp14-persistence-authority-split.md`
- `docs/architecture/CP14_PERSISTENCE_BASELINE_HASHES.json`
- `docs/architecture/CP14_PERSISTENCE_CONTROL_PLANE_IMPLEMENTATION_REPORT.md`
- `docs/architecture/CP14_PERSISTENCE_CONTROL_PLANE_PREFLIGHT.md`
- `docs/architecture/CP14_PERSISTENCE_SECURITY_INVENTORY.json`
- `docs/architecture/CP14_PERSISTENCE_VALIDATION.json`
- `docs/architecture/CP14_VERIFIED_CALL_CONTEXT_V1.txt`
- `docs/architecture/OTR_INTELLIGENCE_NEXT_STAGE_PLAN.md`
- `scripts/cp14/persistence-acceptance.py`
- `scripts/cp14/replay-disposable.py`
- `src/data/db/checkpoint11Integration.test.ts`
- `src/data/db/database.test.ts`
- `src/data/db/migrations.ts`
- `src/data/db/migrations/intelligenceContinuations.ts`
- `src/data/operations/ledgerMaintenance.ts`
- `src/data/repositories/intelligenceContinuationRepository.test.ts`
- `src/data/repositories/intelligenceContinuationRepository.ts`
- `src/data/repositories/tripCanonicalEventRepository.test.ts`
- `src/domain/intelligence/persistence.ts`
- `supabase/migrations/20261006000100_external_integration_persistence.sql`

Copied approved inputs are additions relative to the exact base, not rewritten
contracts. Git has only unstaged modified/new files; no staged change, commit or
push. Canonical checkout remains untouched by this builder.

## Explicit owner answers

| Question                                 | Answer  |
| ---------------------------------------- | ------- |
| Persistence implementation complete      | **YES** |
| Server83 authored                        | **YES** |
| Server84 authored                        | **NO**  |
| SQLite50 authored/registered             | **YES** |
| Historical server1–82 unchanged          | **YES** |
| Historical SQLite1–49 unchanged          | **YES** |
| External integration registry installed  | **YES** |
| Provider config installed                | **YES** |
| Price schedules installed                | **YES** |
| Call responsibility installed            | **YES** |
| Usage/token/cost ledger installed        | **YES** |
| Missing token counts remain UNKNOWN      | **YES** |
| Config audit/health installed            | **YES** |
| Inbound identity/grants installed        | **YES** |
| Package idempotency/recovery installed   | **YES** |
| Invocation/review recovery installed     | **YES** |
| Continuations installed                  | **YES** |
| Attempts installed                       | **YES** |
| Attempt↔usage correlation verified       | **YES** |
| sync_operations sole scheduler           | **YES** |
| Second scheduler added                   | **NO**  |
| Real secret resolver added               | **NO**  |
| Live inbound custody/device bridge added | **NO**  |
| Admin Portal UI added                    | **NO**  |
| Customer billing added                   | **NO**  |
| Raw private evidence in usage telemetry  | **NO**  |
| Runtime/provider gates enabled           | **NO**  |
| Hosted Dev/Production accessed           | **NO**  |
| Commit                                   | **NO**  |
| Push                                     | **NO**  |

No real secret resolver, live issuer/OAuth verifier, provider adapter, gateway login
provisioning, live custody/device bridge, public route, Admin Portal, customer
charging or runtime activation is included. Their absence is required closed scope.
No hard-stop design contradiction remains after the owner's auth clarification.

## TARGETED F1–F6 CORRECTION

Continued the reviewed uncommitted worktree/branch on the same exact base.
Only F1–F6 and their acceptance/documentation were changed. The original independent
[FAIL review](CP14_PERSISTENCE_IMPLEMENTATION_REVIEW.md) is byte-identical; this
Builder evidence does not replace its verdict or grant owner acceptance.

### Exact fixes and before/after behavior

- **F1:** `cp14_inbound_target` validates retained Account/user/client/integration/
  package/Trip before current grant authorization. Reserve-package replay, material
  attachment, invocation reservation/completion, review reservation/observation and
  status derive authority from the retained parent. Ordinary mutations lock their
  retained rows; status serializes against the integration's control commands and
  reads immutable target identity. Caller scope cannot replace a retained known
  Trip with ACCOUNT_STAGING or an unrelated package/T2 grant. Current same-scope
  replacement grants may recover exact retained results using a new bound request;
  original grant pins remain unchanged. Before: substituted scope disclosed/mutated
  a retained target. After: rejection precedes result replay or mutation.
- **F2:** usage append, observe-call and dispatch bind the selected call's retained
  Account and user to verified context, before replay. Integration/environment and
  historical provider/config/price pins still derive from the exact retained call.
  Read-only SUPPORT_RECOVERY additionally filters by verified Account and continues
  to expose only exact minimized facts. It gains no mutation exception. Before:
  workload B could mutate A's call. After: Account-only, actor-only and combined
  mismatches reject, including late recovery; correct-owner recovery still passes.
- **F3:** configure requires killed creation and rejects any kill value differing
  from the retained value. Echoing the same value is an explicit consistency claim;
  UPDATE omits kill altogether. Only the dedicated SECURITY_ADMIN setter changes
  it and records KILL audit attribution. Before: CONFIG_ADMIN could clear kill.
  After: create-un-killed and both update directions reject; unrelated config
  preserves kill. Runtime false-only CHECK remains unchanged.
- **F4:** the shared usage INSERT guard locks the call, admits only one successor
  per predecessor and requires identical measured-key/mode/cost coverage for an
  explicit correction. An estimate/actual DELTA quality overlap without explicit
  supersession rejects as ambiguous; no coverage is inferred from clocks/equality.
  Distinct admitted DELTA keys declare disjoint measurements and remain additive.
  Existing leaf projection now has one deterministic correction chain: estimate100
  superseded by actual150 reports150; root100→110→120 reports120. Competing direct
  successors, including two concurrent writers, reject. All observations remain
  append-only; cumulative latest actuals, independently UNKNOWN units and actual
  cost preference/no-FX/exact nanos rounding remain intact.
- **F5:** `cp14_safe_result` validates UUID/digest fields individually, version1,
  finite state/reason allowlists and strict named keys. Complete-invocation requires
  the retained reservation ID and compatible state; reservation result updates
  apply the same typed identity/state checks. Observe-review requires its retained
  review ID and exact allocated Confirmation/slot/operation/Event tuple for
  ACCEPT/PREPARED. REJECT/DEFER require their matching disposition and prohibit
  preparation/Event IDs. Checks run before sealed replay. Status/support/report IDs
  remain constructed from typed retained rows, not caller JSON. Before: nominal
  identifiers admitted synthetic ticket text and unrelated IDs. After: malformed,
  missing, extra, private-looking or uncorrelated values reject.
- **F6:** the existing immutable `external_integration_config_audit` journal stores
  REQUEST_BINDING entries for non-admin commands, including protected reads. Ordinary admin audit entries
  store the same root/request/verifier-scope binding. `cp14_request_scope` hashes
  verifier scope, excluding independently revalidated freshness timestamps;
  `cp14_bind_request` serializes request IDs across mutation roots and checks exact
  environment/root/principal scope/body digest. The body digest binds all target
  IDs and bytes. It is a fixed config-writer-owned bridge, with EXECUTE only to
  the existing private writers; meter_writer gains no audit-table privileges and
  gateways gain no helper EXECUTE. No replay table, nonce or auth protocol exists.
  Status/report/recovery now append request bindings through the same narrow
  helper; their business disclosures remain read-only and minimized. Before: changing an
  observation key bypassed request binding. After: changed bytes/call/root/principal/
  gateway reject while independent observation-key dedup and new-ID late recovery
  retain their existing contracts.

### Exact implementation objects

Changed tables: existing `external_integration_config_audit` adds only the finite
REQUEST_BINDING change type to its CHECK. No table or role is added.
Changed guards: `cp14_guard_external_integration_usage_events` and
`cp14_guard_external_integration_config_audit`.
New helpers: `cp14_inbound_target`, `cp14_request_scope`, `cp14_bind_request`.
Changed helpers: `cp14_safe_result`, `cp14_context`, `cp14_audit`.
Changed roots: `external_integration_configure`, `external_integration_mark_dispatch`,
`external_integration_usage_append`, `external_integration_observe_call`,
`external_integration_recover_exact`, `inbound_ai_reserve_package`,
`inbound_ai_attach_material`, `inbound_ai_reserve_invocation`,
`inbound_ai_complete_invocation`, `inbound_ai_reserve_review`,
`inbound_ai_observe_review`, `inbound_ai_status`. Sibling admin/health mutation
roots inherit request binding through their existing shared context/audit path.
Actual catalog:15 tables,58 functions (25 SECURITY DEFINER),9 roles.

Exact changed files **since the reviewed implementation**:

- `supabase/migrations/20261006000100_external_integration_persistence.sql`
- `scripts/cp14/persistence-acceptance.py`
- `docs/API_CONTRACT.md`
- `docs/DATA_MODEL.md`
- `docs/CURRENT_IMPLEMENTATION_STATE.md`
- `docs/architecture/CP14_PERSISTENCE_CONTROL_PLANE_IMPLEMENTATION_REPORT.md`
- `docs/architecture/CP14_PERSISTENCE_SECURITY_INVENTORY.json`
- `docs/architecture/CP14_PERSISTENCE_VALIDATION.json`

### Targeted validation and residual limits

- Fresh exact1→83 and seeded82→83 PASS; prior public table columns/function bodies
  and seeded auth row preserved. All86 historical source hashes PASS.
- Complete server harness **473 checks PASS**, including90 additional assertions
  over the reviewed383. F1 removed Trip+staging, P2/T2 substitution, retained-parent
  siblings and replacement-grant recovery; F2 Account/actor mismatches on both
  gateways; F3 CONFIG-only and SECURITY setter/audit; F4 cumulative/delta vectors,
  estimate replacement, deterministic/concurrent correction chain; F5 typed/missing/
  extra/uncorrelated IDs and REJECT/DEFER; F6 exact/changed/cross-call/root/principal/
  gateway and sibling health/completion/review request binding.
- RLS/ACL/roles/security inventory checks remain unweakened, including actual API
  table/root denials and no canonical mutation rights. Closed context/host tests
  reject missing verifier context and caller identity/auth claims.
- Focused CP14 **2 files/58 PASS**. Selected **15 files/532 PASS**, including SQLite
  fresh→50/49→50, historical rows/schema, FK ON/OFF, reopen, Capture, Day, CP13A/B,
  Account fencing, maintenance and sync. Counts overlap and are not added together.
- Full suite **198 files/2,055 tests:2,054 passed,1 failed;11 failed files**, identical
  to the reviewed baseline failure list. Typecheck, lint/UI guard, Backend build,
  changed-file formatting, Python syntax and whitespace PASS.
- **NEW REGRESSION:** none remaining. **CORRECTION DEFECT:** temporary SQL parent-
  alias ambiguity corrected and the entire replay/harness rerun. **EXISTING BASELINE
  BLOCKER:** ten native Flow collection blockers plus the Ledger architecture
  assertion. **ENVIRONMENTAL:** no remaining correction-tooling blocker.
- Reviewed SQLite50/repository/tests and the independent review are byte-identical.
  CP12/13/A/B/C, scheduler/runtime gates and historical migrations are unchanged.
  Unstaged/uncommitted changes only; exact HEAD/base retained. No commit or push.
- Residual live auth/secret/custody/provider/device provisioning remains deferred.
  Tests use synthetic local facts; no live dispatch, CP13A external side effect,
  Hosted Dev/Production or activation is claimed. Targeted independent recheck
  remains pending; no architecture change was required.

### Required targeted answers

| Question                                                | Answer |
| ------------------------------------------------------- | ------ |
| F1 target-row scope fixed                               | YES    |
| Removed Trip + ACCOUNT_STAGING blocked                  | YES    |
| Unrelated package grant blocked                         | YES    |
| F2 cross-Account usage append fixed                     | YES    |
| F2 cross-Account observe-call fixed                     | YES    |
| F3 CONFIG_ADMIN kill bypass fixed                       | YES    |
| Kill remains SECURITY_ADMIN-only                        | YES    |
| F4 estimate→actual DELTA replacement fixed              | YES    |
| F4 correction fanout blocked                            | YES    |
| Independent disjoint DELTAs preserved                   | YES    |
| F5 safe-result typed grammar fixed                      | YES    |
| F5 retained-ID correlation fixed                        | YES    |
| Private-text smuggling through safe identifiers blocked | YES    |
| F6 request ID changed-bytes binding fixed               | YES    |
| Same request ID cross-call/root/principal blocked       | YES    |
| Observation replay remains correct                      | YES    |
| SQLite50 semantics changed                              | NO     |
| Historical server1–82 unchanged                         | YES    |
| Historical SQLite1–49 unchanged                         | YES    |
| Server84 added                                          | NO     |
| Runtime gates remain CLOSED                             | YES    |
| Generic service_role gains authority                    | NO     |
| Raw private evidence added to telemetry                 | NO     |
| Hosted Dev/Production accessed                          | NO     |
| Commit                                                  | NO     |
| Push                                                    | NO     |
| Ready for targeted independent recheck                  | YES    |

## FINAL F5/F6 RESIDUAL CORRECTION

Continued `intelligence/cp14-persistence`, exact retained HEAD/base
`c4571746b0c300fa3b46842cd37745963567338c`. The appended independent recheck is
preserved byte-for-byte. Its F1–F4 verification remains authoritative; this section
records Builder correction evidence for only the two remaining IMPORTANT findings.
Final independent verification remains pending.

### F5 — finite reservation reason

`inbound_ai_import_reservations.safe_reason` now has a finite storage CHECK, using
exactly the existing safe-result vocabulary:

- INVALID_PACKAGE
- STALE_REVIEW
- ACCESS_REVOKED
- MATERIAL_UNAVAILABLE
- EXACT_RECOVERY_REQUIRED
- USER_REJECTED
- USER_DEFERRED

NULL remains an absent reason. No code or free-text reason was added. Initial
reserve-package validates the field before admission or replay. Complete-invocation
validates the sibling reservation_update field before its sealed-response early
return, including recovery sessions. The table CHECK protects all actual writes.
Existing durable request/digest binding rejects changing a valid reason under the
same request identity. Before: nominal labels could persist private-looking text.
After: PNR/ticket markers, free-form provider/user text, unknown codes and non-string
values reject; all seven finite codes pass initial reservation and exact replay.
A real unsealed invocation tests invalid completion rejection, valid completion
persistence, exact sealed replay and correct-owner recovery. Changed valid reason
under the same completion request rejects. No raw error/evidence store exists.

### F6 — all protected reads request-bound

Removed the three-root exception from `cp14_context`. All20 protected roots now
invoke `cp14_bind_request`; audited read roots are exactly `inbound_ai_status`,
`external_integration_admin_report` and `external_integration_recover_exact`.
Internal projection/access helpers are private function edges, not additional
protected read APIs.

The existing private reader receives EXECUTE on the existing config-writer-owned
fixed binding helper. The helper admits the existing reporting session; the audit
INSERT guard allows that session only REQUEST_BINDING. Reader and gateways gain
no audit-table DML, gateway helper EXECUTE, role membership or business mutation.
No new role, table, function or general replay subsystem is introduced.

Every read checks/records the same global serialized request identity, exact body
hash, root kind, hashed verified principal/client/workload/gateway/Account scope
and environment. The body hash binds exact retained target IDs or filtered
integration scope. Current grants, Trip/package authorization, Account filters,
expiry/revocation and minimized result construction remain unchanged and run on
replay. Request replay does not freeze business data or bypass current authority;
existing read projection semantics remain. Before: reads accepted reused IDs with
changed root/body/scope. After: exact authorized request replay is admitted,
changed binding rejects and a genuinely new authorized read ID passes.

### Exact residual scope and validation

Changed files since the appended targeted recheck:

- `supabase/migrations/20261006000100_external_integration_persistence.sql`
- `scripts/cp14/persistence-acceptance.py`
- `docs/architecture/CP14_PERSISTENCE_CONTROL_PLANE_IMPLEMENTATION_REPORT.md`
- `docs/architecture/CP14_PERSISTENCE_SECURITY_INVENTORY.json`
- `docs/architecture/CP14_PERSISTENCE_VALIDATION.json`

Changed SQL objects: reservation safe_reason CHECK; reserve-package and
complete-invocation admission/replay checks; shared context/binding helper,
its private-reader EXECUTE edge and the audit INSERT guard's reporting-session
REQUEST_BINDING-only allowance. Actual inventory remains15 tables,58 functions
(25 SECURITY DEFINER),9 roles. Existing audit journal only; no Server84.

- Final fresh1→83 and seeded82→83 PASS, including old column/function definitions
  and seeded auth preservation. All86 historical hashes PASS; SQLite1–49 preserved.
- **Complete server harness548 PASS**, including **75 residual assertions** over
  the previously rechecked473. F1–F4, authority/RLS/ACL/role inventory, UNKNOWN,
  pricing/accounting, quota concurrency and minimized support disclosure still pass.
- Read vectors cover all three roots: exact same binding; changed same-root body;
  mutation→read and read→mutation; cross-read-root, principal/client, gateway and
  Account; and genuinely new authorized IDs. All gateways remain unable to invoke
  the binding helper directly; the reader has no audit DML grant.
- **Focused2 files/58 PASS; selected15 files/532 PASS** (overlapping counts),
  including SQLite fresh→50/49→50 preservation, FK ON/OFF, reopen, Capture/Day,
  CP13A/CP13B, Account/sync and Ledger maintenance.
- Typecheck, lint/UI guard (473 legacy occurrences/76 representative UI files),
  Backend build, changed-document formatting, Python syntax and whitespace PASS.
  Full suite was not rerun for this SQL-only residual stage; prior198-file full
  results retain their documented baseline blockers and are not a new PASS claim.
- **NEW REGRESSION:** none. **CORRECTION DEFECT:** test setup expected the later
  binding rejection where earlier claim-consistency/ACL rejection correctly won;
  consistent claim/session vectors corrected and the complete replay/harness rerun.
  **EXISTING BASELINE BLOCKER:** prior native collection/Ledger architecture results
  unchanged. **ENVIRONMENTAL:** no remaining blocker in this Builder validation.
- Independent review, reviewed SQLite50/repository/tests, CP12/13/A/B/C and other
  implementation/docs are byte-identical to stage entry. No runtime gate change,
  generic service-role authority, private evidence, Hosted Dev/Production access,
  commit or push. No architecture redesign. Live auth/custody/provider/device
  limitations remain deferred; synthetic acceptance is not live execution proof.

### Final required answers

| Question                               | Answer |
| -------------------------------------- | ------ |
| F5 residual fixed                      | YES    |
| Finite safe_reason enforced            | YES    |
| F6 residual fixed                      | YES    |
| All protected read roots request-bound | YES    |
| F1–F4 remain fixed                     | YES    |
| New regression                         | NO     |
| SQLite50 changed                       | NO     |
| Server84 added                         | NO     |
| Runtime gates CLOSED                   | YES    |
| Commit                                 | NO     |
| Push                                   | NO     |
| Ready for final independent recheck    | YES    |

**STOP — READY FOR FINAL CP14 PERSISTENCE INDEPENDENT RECHECK.**
