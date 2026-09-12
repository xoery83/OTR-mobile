# Ledger 2.0 iOS And Backend Implementation Plan

Date: 2026-09-13
Status: Approved; Stage 0 through Stage 6 physically validated and complete;
Stage 7.1 passed automated, Hosted Dev, and two-client Simulator acceptance;
Stage 7.2A gate approved after automated, Hosted Dev, and two-client Simulator acceptance;
Stage 7.2B gate approved after automated, Hosted Dev, and two-client Simulator acceptance

## Objective

Deliver the complete approved Ledger 2.0 experience as a native iOS,
offline-first product backed only by the OTR Dev Backend and Hosted Supabase Dev:

```text
iOS Ledger UI
  -> Ledger repositories
  -> local SQLite source of truth
  -> durable Ledger sync and asset queues
  -> authenticated OTR Dev Backend API
  -> Supabase Dev canonical Ledger 2.0 schema
```

Before user acceptance testing, import a selected, minimized, transformed subset
of the real Europe Journey Ledger from Production into an isolated Dev Journey.
Production remains read-only throughout extraction and is never a sync target.

## Scope Boundary

This plan implements only Ledger capabilities already approved in the Ledger 2.0
design documents:

- Journey-scoped Ledger and personal cross-Journey My Ledger;
- Expense create, read, edit, tombstone delete, restore, and history;
- payer, participants, exclusions, exact member allocations, and Household
  conveniences;
- equal-person, equal-household, household shares, exact, and percentage splits;
- ISO 4217 money, original merchant value, payer PaymentRecord evidence, and
  group SettlementValuationSnapshot;
- receipt/evidence attachment and receipt-first draft, with independent upload;
- search, filters, Mine/Group analysis, and explainable balances;
- settlement preview/finalization, deterministic transfer plan, partial
  payments, and bilateral Paid/Received confirmation;
- correction requests, organizer reasoned corrections, audit history, conflict
  resolution, deterministic validation, and advisory review findings;
- local-first operation, restart persistence, retry, pull, and reconciliation.

It does not implement general Itinerary work, Capture expansion beyond receipt
entry into Ledger, Photo/P2P, Memory, Web UI migration, Production deployment,
App Store release, or unrelated backend services.

## Authentication Decision

Full consumer login, invitation, account recovery, and production identity UX may
be deferred. Authentication itself cannot be removed from integration testing.
The backend needs a trusted actor to enforce Journey membership, creator versus
organizer permissions, correction authority, and the two sides of Paid/Received.

Use the existing development-only Supabase email/password Auth harness with at
least these dedicated Dev identities:

1. Dev organizer/expense creator;
2. Dev linked member/recipient;
3. optional second ordinary member for unauthorized and correction-request
   tests;
4. unlinked Journey members represented without Auth accounts.

Sessions continue to use SecureStore and offline-tolerant bootstrap. Formal login
screens may remain development-only during this phase, but every backend command
still validates a real Supabase Dev access token and server-side capability.
Service credentials remain backend-only.

This permits complete Ledger testing except final production onboarding and
invitation UX. It also avoids building a false no-auth path that would later need
to be removed.

## Delivery Strategy

Implement vertical slices. A slice is complete only when domain rules, SQLite,
repository, queue, transport, backend authorization, Supabase Dev persistence,
native UI, tests, and documentation agree. Do not build disconnected database or
UI layers in large batches.

The current in-memory prototype remains available as a visual reference until
the corresponding real screen passes acceptance. It must never share state with
the real Ledger repositories.

## Stage 0: Contract Freeze And Safety Rails

Status: Complete. See ADR 0008 and `LEDGER_2_0_API_CONTRACT.md`.

Deliverables:

- approve canonical API payloads, entity names, money format, status enums, and
  version/conflict envelopes;
- add a Ledger-specific feature flag selecting prototype versus real Ledger at
  composition time, not inside screen business logic;
- retain hard guards that reject any backend Supabase URL except the approved
  Dev project;
- capture the current Dev schema manifest and database restore point;
- define structured, redacted Ledger logs and correlation ids;
- add architecture tests prohibiting UI SQLite/Supabase access and Mobile
  business-table access.

Exit gate:

- contracts and ADRs are approved;
- Production project reference cannot be selected by Mobile, backend, import, or
  test configuration;
- existing Expense and Itinerary regression suites remain green.

## Stage 1: Ledger 2.0 Domain And Dev Schema

Status: Complete. See `LEDGER_2_0_STAGE_1.md`.

Add forward-only Dev/Staging migrations after the canonical baseline. Do not
rewrite the baseline or reuse the legacy Ledger tables as the new aggregate.

Canonical persistence covers:

- `expenses` with revision, tombstone, creator, Journey, payer, original Money,
  and business/transport state separation;
- `expense_participants` and exact `expense_splits`;
- `exchange_rate_snapshots`, `payment_records`, and
  `settlement_valuation_snapshots`;
- `expense_links`, `expense_audit_events`, and
  `expense_correction_requests`;
- `households` plus Journey-member household/share definitions;
- `settlements`, immutable settlement inputs, member balances,
  `settlement_transfers`, and `settlement_payments`;
- `ledger_review_findings`;
- backend idempotency records and a Ledger change feed/cursor source.

Domain packages implement integer minor-unit Money, ISO currency exponent
validation, deterministic largest-remainder allocation, aggregate validation,
settlement calculation, transfer minimization, and content hashing. Shared pure
logic is used by Mobile tests and backend validation where practical.

Exit gate:

- a clean local Supabase reset succeeds twice with no schema drift;
- RLS/service-role grants and backend transactions pass the role matrix;
- every split and settlement invariant is covered by property/edge tests;
- legacy production-shape tables remain untouched during development.

## Stage 2: Local SQLite And Repository Foundation

Status: Implementation complete; physical Release validation passed on
2026-09-11. Local lineage decision: ADR 0009. See `LEDGER_2_0_STAGE_2.md`.

Stage 2 foundation currently persists real local aggregates and typed pending
operations. It deliberately does not replace prototype screens or run a Ledger
network worker until Stage 3 bootstrap/pull/API endpoints exist.

Add forward-only SQLite migrations mirroring domain ownership, including local
ids, server ids, server/base revisions, tombstones, conflict snapshots, and
sync status. Add repository projections for:

- Journey Ledger overview;
- Expense list/detail/editor;
- member balance explanation;
- Spending analysis/search;
- settlement and transfer detail;
- My Ledger grouped by Journey.

Repository transactions atomically write aggregate revision, audit event, and
durable operation. UI receives observable projections and never joins tables.

Exit gate:

- migration from every existing Mobile schema version is tested;
- create/edit/delete/restore survives process restart;
- aggregate and queue cannot be partially written;
- Journey A/B and prototype/real data are isolated.

## Stage 3: Read, Bootstrap, Pull, And Capability API

Status: Implementation complete; Simulator acceptance and physical iPhone smoke
validation passed on 2026-09-12.

Implement backend endpoints for:

- Journey Ledger bootstrap;
- incremental Ledger pull by opaque cursor;
- Journey members and effective Ledger capabilities;
- Expense list/detail and My Ledger reporting queries;
- search/filter and analysis projections where server support is required.

Bootstrap and pull return canonical aggregate revisions and tombstones. Mobile
applies each page transactionally and never overwrites a local pending revision.
Imported and server-created expenses use the same pull path.

Exit gate:

- a fresh device can hydrate one Journey and My Ledger into SQLite;
- a returning device pulls only changes after its cursor;
- offline launch renders the last SQLite state without online Auth;
- unauthorized Journey reads are rejected server-side.

## Stage 4: Expense Aggregate Vertical Slices

### 4A: Complete Create

Status: Complete; Simulator regression and physical iPhone Release smoke passed
on 2026-09-12.

- fast entry plus advanced payer/participants/splits;
- all Phase 1 split modes and deterministic rounding;
- local immediate save and real Dev synchronization;
- stable server id/revision and idempotent ambiguous retry.

### 4B: Edit, Tombstone, Restore, And Audit

Status: Complete; automated validation, full Simulator acceptance, and physical
iPhone Release smoke passed on 2026-09-12.

- creator edit and organizer edit with mandatory reason;
- reversible delete and restore;
- immutable audit timeline;
- finalized-settlement protection.

### 4C: Conflict And Correction Request

Status: Complete. Implementation, automated validation, Hosted Dev deployment,
two-identity Simulator acceptance, and physical iPhone Release smoke passed on
2026-09-12.

- optimistic concurrency using base revision;
- no silent merge of financially material fields;
- ordinary-member correction proposal without direct mutation;
- explicit creator/organizer resolution.
- Stage 4C v1 performs no automatic three-way merge: every genuine concurrent
  Expense edit enters explicit conflict handling;
- conflict envelopes are immutable observations; a later conflict supersedes
  the old envelope and creates a new one;
- keeping the unchanged canonical Journey version resolves and audits the
  conflict without creating a no-op Expense revision;
- correction proposals contain only the complete Stage 4 editable Expense
  aggregate; Stage 5 evidence and Stage 7 settlement behavior remain excluded.

Physical smoke used Leon's iPhone 16 Pro Release build plus an iPhone 17 Pro
Simulator. It passed offline edit/correction persistence across force-quit and
cold relaunch, explicit immutable conflict capture, authorized Keep Mine and
two-client convergence, correction acceptance with canonical audit, and final
read-only SQLite v8 integrity/uniqueness/queue checks.

Each sub-slice must pass offline create/edit/restart/reconnect and two-client
concurrency tests before the next begins.

## Stage 5: Currency, Payment Evidence, And Receipts

Stage 5 is delivered through three ordered engineering gates. A gate must pass
its automated and Simulator acceptance before work begins on the next:

1. **5.1 Financial Evidence & Valuation** — ISO 4217 validation, independent
   merchant/payer/settlement facts, append-only PaymentRecords and valuation
   evidence, trusted server rate candidates, `RATE_REQUIRED`, explicit
   valuation commands, authorization, audit, SQLite v9, API, and pull.
2. **5.2 Receipt / Asset / OCR Pipeline** — receipt assets, an asset-specific
   durable operation path, upload, narrow replaceable OCR provider, suggestion,
   and explicit user confirmation.
3. **5.3 Integrated Acceptance** — combined recovery, convergence, Simulator,
   and physical-device acceptance.

Stage 5.1 does not implement receipt selection, binary upload, OCR, settlement,
payment execution, Adjustment Settlement, or settlement grouping. A valid unresolved-rate
Expense synchronizes normally as `RATE_REQUIRED`; valuation completeness is
not transport status. Rate-cache refreshes are candidate updates only and may
not mutate an Expense or accepted historical snapshots.

Gate status (2026-09-12): 5.1 and 5.2 passed automated, Hosted Dev, Simulator,
and affected Stage 4 regression acceptance. Stage 5.3 then passed integrated
Release acceptance on Leon's physical iPhone 16 Pro. Stage 5 is complete; stop
before Stage 6 pending explicit approval.

Physical Stage 5.3 acceptance exercised the real camera, Photos, and document
pickers; permission denial and recovery; app-owned durable storage; offline
receipt-first and `RATE_REQUIRED` creation; force-quit/cold launch; independent
financial and asset queue recovery; authenticated binary upload and failure
retry; OCR persistence and suggestion-only behavior; explicit confirmation via
the normal Expense command path; canonical linking/pull/audit; and idempotent
identity after response-loss retry. Final SQLite v10, file/digest, queue,
uniqueness, Hosted Dev Storage, canonical link, audit, and structured-log privacy
checks passed. Merchant, payer, and Journey valuation facts remained independent.

Implement the three independent financial truths:

1. immutable merchant amount/currency;
2. optional authorization/posted payer cost and fee evidence;
3. immutable accepted Journey settlement valuation.

Add Journey valuation policy, trusted cached rates, stale/missing-rate handling,
manual agreed override with reason, and ISO 4217 formatting. Do not silently
revalue historical expenses.

Implement receipt-after-expense and receipt-first draft flows. Asset metadata,
upload, and OCR status use a separate durable queue. Expense sync succeeds even
when receipt upload fails, and no receipt binary is logged.

Exit gate:

- EUR merchant, NZD posted cost, and different NZD group value remain separately
  inspectable;
- no-rate offline Expense saves as `RATE_REQUIRED` and resolves later;
- receipt upload failure cannot roll back or duplicate an Expense;
- manual rate and PaymentRecord corrections are audited.

## Stage 6: Spending, Search, And My Ledger

Approved semantics: ADR 0012.

Status (2026-09-12): complete. Implementation, automated/backend/Supabase
validation, Backend-vs-SQLite parity, 10,000-Expense performance, Simulator,
maximum Dynamic Type, and VoiceOver structure checks passed. Release physical
acceptance on Leon's iPhone 16 Pro passed offline cache, Journey context,
reporting/drill-down, My Ledger, readiness-only Settlement, long-list,
reconnect/convergence, maximum Dynamic Type, and final read-only SQLite v11
checks. Physical VoiceOver operation was explicitly waived by the user after
Simulator validation and remains a non-blocking risk. Stage 7.1 is now complete;
this paragraph records the unchanged Stage 6 exit gate.

Replace the prototype views with repository-backed screens:

- persistent Journey context and zero/one/multiple-current-Journey rules;
- Spending versus Settlement top-level modes;
- Mine/Group totals;
- date, category, payer/member, currency, status, and receipt filters;
- category, time, payer, participant, and currency analysis;
- My Ledger period selection with Journey-separated rows;
- explainable total drill-down to exact Expense splits and valuation evidence.

Cross-Journey reporting may convert display totals using explicit reporting-rate
provenance. It never cross-nets settlement obligations.

Stage 6 does not enable that optional conversion. My Ledger retains each
Journey's settlement currency and reports pre-settlement position only.
`RATE_REQUIRED` and open-conflict Expenses remain visible but are explicit
exclusions from authoritative settlement-currency totals. Backend and SQLite
reporting must reconcile totals, counts, and included Expense identities from
identical fixtures, and every aggregate drill-down must expose exactly the
components used by the aggregate.

The Stage 6 Settlement mode is structural/readiness UI only; Stage 7 transfers,
obligations, and Paid/Received behavior remain out of scope.

Exit gate:

- all displayed totals reconcile to their component rows;
- large result sets remain responsive from SQLite while offline;
- Dynamic Type and VoiceOver do not hide Journey or financial context.

## Stage 7: Settlement And Repayment

Stage 7 is delivered through three ordered engineering gates. Each gate must
pass automated and Simulator acceptance before the next begins:

1. **7.1 Preview & Finalization** — non-persistent blocker/ready preview,
   canonical digest, authoritative transactional finalization, immutable
   normalized inputs, member balances/transfers, SQLite v12, read/pull, and
   finalized-Expense protection.
2. **7.2 Payment Lifecycle & Adjustment** — two separately approved gates:
   **7.2A** Paid/Received, partial and cross-currency payment,
   reject/dispute/correction, offline durability, idempotency, concurrency and
   canonical audit; then **7.2B** immutable adjustment lineage and
   post-finalization Expense correction.
3. **7.3 Export & Integrated Acceptance** — immutable PDF/structured export and
   combined recovery, convergence, Simulator, and physical-device acceptance.

Do not begin a later gate until the prior gate passes.

Stages 7.1 and 7.2A passed on 2026-09-12. Payment lifecycle, canonical audit,
Hosted Dev concurrency, and two-client offline/restart gates are complete.
Stage 7.2B passed on 2026-09-13 with immutable non-forking Adjustment lineage,
root-frozen scope, explicit Adjustment readiness, independent historical
obligations, Hosted Dev schema parity, and two-client offline/restart convergence.

Implement deterministic preview, blockers, immutable finalization input digest,
member balances, and minimized transfer plan. Then implement:

- transfer obligation lifecycle;
- several partial SettlementPayments per obligation;
- payer-side Paid report and recipient-side Received confirmation;
- cross-currency payment plus immutable discharged-settlement valuation;
- rejection/dispute and organizer correction with reason;
- adjustment behavior after a post-finalization financial correction;
- shareable final statement and structured export.

Only confirmed SettlementPayments reduce obligations. Preview finalization fails
if its digest is stale or if any included Expense has unresolved financial
conflict/rate state.

Stage 7.2A uses immutable Payment propositions and separate immutable discharge
facts. Payment terminal states never return to awaiting. Awaiting amount is only
an overbooking reservation; confirmed remaining debt excludes it. Once a
Settlement is finalized it is never rebuilt or reopened, and `/reopen` returns
`SETTLEMENT_REOPEN_NOT_ALLOWED`. Stage 7.2B owns all later financial correction
through Adjustment Settlements. Stage 7.3 still requires separate approval.

Exit gate:

- every settlement nets exactly to zero;
- partial payments survive restart and synchronize idempotently;
- two Dev identities complete Paid/Received without impersonation;
- retry never creates duplicate payments or transfers;
- every final number has a complete explanation path.

## Stage 8: Ledger Review And Operational Hardening

Add authoritative deterministic validation and advisory review findings.
Heuristics may flag duplicates, amount/rate outliers, evidence mismatch, or
participant anomalies but cannot mutate financial records.

Harden pagination, cursor recovery, queue backoff, support diagnostics, privacy
redaction, database growth, receipt cache limits, background/foreground
transitions, and Release embedded-bundle offline cold start.

Exit gate:

- deterministic failures block invalid acceptance/finalization;
- heuristic findings can be acknowledged without changing money;
- corrupted cursors and interrupted batches recover without loss or duplication;
- logs contain no tokens, receipt contents, names, notes, or amounts.

## Stage 9: Europe Journey Replay Import

This happens after the destination schema and read path are stable and before
formal functional acceptance. Automated tests continue throughout earlier
stages; real-data user acceptance does not begin before this import is verified.

### Approved Default Import Profile

Preserve for test realism:

- original amounts and currencies;
- base/group values and recorded legacy rates;
- dates and category distribution;
- payer/participant relationships and exact computed shares;
- `stats_only` versus shared classification as migration provenance;
- safe itinerary linkage only when its dependency is deliberately included.

Transform or remove by default:

- map Production users to dedicated Dev Auth identities or unlinked Dev members;
- pseudonymize traveller names and merchant/title text;
- remove email, invite, Auth, token, and third-party identifiers;
- remove precise addresses, coordinates, free-form sensitive notes, and raw place
  provider responses;
- exclude receipts, photos, Storage objects, card/bank evidence, and unrelated
  Journey content;
- generate new deterministic Dev ids using a Dev-only namespace kept outside
  Git, never reuse Production ids directly.

The owner may later approve a narrower set of exact labels, but sensitive media
or Auth data is never part of the default profile.

### Extraction

- use a dedicated read-only Production connection;
- select one explicit Europe Journey id;
- export only whitelisted columns from `trips`, `journey_members`,
  `journey_ledgers`, `ledger_entries`, `ledger_entry_participants`, and
  `journey_exchange_rates`;
- include `ledger_settlements` only as legacy provenance, not as confirmed Ledger
  2.0 repayment truth;
- record row counts and financial checksums without exposing content;
- write no export or mapping artifact into Git.

### Transformation

- map legacy entries to Expense aggregates and participant rows to concrete exact
  Split rows;
- convert decimal money using the currency exponent and reject unsafe rounding;
- create `LEGACY_IMPORTED` rate/valuation provenance;
- leave PaymentRecord, receipt evidence, Household provenance, and full edit
  history unknown unless supported by explicit evidence;
- mark missing payer, invalid member, incomplete split, or non-reconciling amount
  as `NEEDS_REVIEW` rather than inventing values;
- maintain an idempotent private source mapping so repeated import is a no-op or
  a deliberate replace of the isolated replay Journey.

### Load

- target only project `tuqigdxrvrerfewsxqgm`;
- create a separate `Europe 2026 Replay` Journey;
- take a Dev restore point first;
- load through a backend-owned transactional import command/tool, not Mobile and
  not direct UI table writes;
- disable outbound notifications/integrations for imported rows;
- delete plaintext temporary exports after verification.

### Import Acceptance

- source and destination Expense/participant counts match the manifest;
- original totals match exactly by currency and category;
- accepted settlement-value totals match the documented legacy base totals;
- every accepted split sums exactly to its Expense in minor units;
- all payer/participant ids belong to the replay Journey;
- no Production UUID, user, email, secret, Storage path, or precise coordinate is
  present;
- rerunning the import creates zero duplicates;
- Mobile bootstrap/pull produces the same accepted row counts and revisions in
  SQLite;
- generated balance totals reconcile to zero, with exceptions listed as
  `NEEDS_REVIEW` rather than hidden.

## Stage 10: Comprehensive Acceptance Matrix

Run with synthetic edge fixtures and the verified Europe Replay dataset.

### Automated

- domain allocation, currency, valuation, settlement, and audit tests;
- backend Auth/capability/RLS and payload validation tests;
- repository migration, transaction, query, and restart tests;
- sync idempotency, response-loss, retry, pull, tombstone, and conflict tests;
- import mapping, privacy allowlist, checksum, and duplicate tests;
- architecture boundary and Production-project guard tests.

### Multi-Client

- organizer and member edit different fields;
- two clients edit Financial Core concurrently;
- ordinary member proposes a correction;
- payer records partial Paid offline and recipient confirms Received later;
- one client deletes while another edits;
- stale settlement preview is rejected and regenerated.

### iOS Simulator

Stage 3 Simulator-first acceptance passed before physical-device smoke:

- fresh-device Journey Ledger bootstrap;
- incremental pull and opaque cursor persistence/advance;
- My Ledger narrow summary cache;
- force-quit plus offline cold launch from SQLite;
- pending local aggregate preserves/deferred canonical server changes;
- unauthorized Journey read rejection;
- read-only SQLite integrity and cache inspection.

### Physical iPhone

Stage 3 physical iPhone smoke validation passed on Leon's iPhone 16 Pro:

- authenticated Dev backend bootstrap;
- My Ledger cache and incremental pull;
- force-quit plus airplane-mode cold launch from SQLite;
- reconnect plus pull;
- read-only SQLite integrity sanity.

The force-quit offline smoke used Dev backend unavailability because `devicectl`
does not safely toggle iOS Airplane Mode. Do not duplicate every Stage 3
edge-case on physical hardware when automated tests and Simulator acceptance
already covered it. Stage 4 began only after explicit approval.

Stage 4C physical iPhone smoke passed with Dev backend unavailability as the
offline condition. The critical conflict and correction paths were validated
with one Simulator as the second authenticated client; the full Simulator matrix
was not duplicated on hardware.

## Final Definition Of Done

Ledger 2.0 is ready for the next approval only when:

- every approved Ledger Phase 1 capability is backed by real repositories and
  Dev API behavior rather than fixture actions;
- all local writes are immediate, durable, restart-safe, and idempotently synced;
- every backend read/write is authenticated and Journey-authorized;
- the Europe Replay import passes privacy and financial integrity checks;
- synthetic and real-data acceptance matrices pass on simulator and physical
  iPhone;
- no Mobile UI accesses SQLite or Supabase directly;
- no Production Supabase or legacy Web repository change occurred;
- prototype code can be removed without affecting real Ledger behavior;
- API, schema, import, runbook, and support diagnostics documentation is current.

## Approval Checkpoints

Execution should pause for review at these points:

1. Ledger 2.0 schema/API contract before Dev migration;
2. real Expense create/edit/delete before replacing the prototype home;
3. currency/evidence and receipt behavior before settlement implementation;
4. settlement calculation and bilateral payment behavior before import;
5. Europe import manifest and redaction report before loading Dev;
6. comprehensive acceptance report before any Production planning.

No phase in this plan authorizes Production deployment automatically.
