# Current implementation state — Core v2 integrated

Updated 2026-10-12. Core branch `e565080` was integrated into canonical main by
normal fast-forward from `741579c`; concurrent Platform documentation remains local.
Owner accepted W0 `otr-trip-core/2` and continuous W1/W2/W3/W5 implementation.
W4 Capture and W6 Experience retain separate ownership. Core is INCOMPLETE.

## CP-FLIGHT-E2E-B — isolated downstream acceptance

- Branch `codex/cp-flight-e2e-b`, baseline `b5caa1f`, implementation `8e3916f`;
  local commit only, not integrated. Accepted collection2 → SQLite54 → existing
  Day presentation now has a v2 P2 reader with exact certificate/Person binding,
  typed endpoint, stable UUID/occurrence, sparse and access-generation fences.
- Focused11 suites/180 PASS; typecheck, lint/UI guard, touched format/diff PASS.
  Actual Node SQLite file cold reopen/offline retention and repeated collection
  pass. Synthetic Core executor/HTTP and native-component static rendering only;
  no native/Hosted/runtime or real supplier acceptance is claimed.
- Report/manifest: `trip/implementation/CP_FLIGHT_E2E_B_IMPLEMENTATION_REPORT.md`.
  Next: separate integration decision, Agent 3 accepted UUID/revision/read2 alignment
  and approved joined/native F5/F6 evidence. All activation gates remain CLOSED.

## Latest Core checkpoint

- Frozen finite31-table model, command2/receipt2/read2/capture2 codecs, protected
  manual writes, sparse Flight identity, independent visibility/participation, N:M
  relations, typed P1–P6 details and deterministic Day projections are executable.
- Additive Server85–92 and SQLite54 only. Actual isolated PostgreSQL command writer
  atomically commits roots/children/exact receipts. Actor read uses one consistent
  snapshot and complete actor-scoped collection, with private Source evidence redacted
  before hashing. Person binding preserves actual revision0 and separates active identity
  from participation; access-generation triggers cover membership changes.
- SQLite mirror, durable Core queue, pending overlays, account/revocation fences,
  lost-response cold reopen/receipt recovery, accepted Item/Day read and coordinator use
  existing repository/sync machinery. Generic executor excludes Core-owned commands.
- Exact receipt lookup precedes fresh capability discovery. Private audit evidence
  requires owning authorization; immutable receipts are returned STATUS_ONLY when denied.
- Source port and PostgreSQL adapter exist; actual isolated sealed legacy two-Candidate
  publication/REVIEW/replay/stale/request-reuse/actor/Trip/principal SQL scenario PASS; actual sealed Source/run/input/proposal pins
  are checked, legacy UNKNOWN claims retained. Missing authority remains REVIEW.
  Owning synthetic SQL certifies qualified READY publication, same-ID qualification
  and exact-receipt Source finalization. Hosted or real supplier acceptance is not claimed.

## Blocking authority and unfinished scope

Capture owner confirmed legacy publication seals labels but no qualified airport IDs;
resolved airports/matching are transient. The initial absence of an authoritative v2 Candidate/Evidence publisher has been resolved
for the bounded retained ORIGINAL TEXT/reference Flight grammar. The concrete
publisher/ownership proposal is `trip/implementation/W1_W5_SOURCE_AUTHORITY_GATE.md`.
Owner direction now assigns the authoritative v2 Candidate Publisher to Core/Source;
Capture retains interpretation/evidence/preparation without Canonical SQL authority.
The assignment gate is resolved. Owning publisher/admission/finalization now execute in
isolated SQL:2 qualified Candidates→2 sparse roots→same-ID qualification→4 exact receipt
associations→cold replay without duplicates. Missing/ambiguous/unsupported evidence stays
REVIEW. Fresh airport authority uses private immutable date-bound registry assignments;
original bytes/current pins and complete Source observations are independently re-read.
Server90 stores publisher/association metadata and registry;91/92 fence legacy fresh
claims and retain uncertain claims. Historical finalization guards verify retained old
pins/receipt with current access, without granting fresh dispatch.

Shared publication DTO: domain/trip/tripCoreV2CandidatePublication.ts. POST
/v2/trips/:trip/core/source-candidates/publish; authenticated actor/Trip,32KiB request,
exact request hash and candidate roster, account-generation fenced transport. Explicit
createCorePgHttpConnection composes Source authority around the sole Core writer;
no startup call or provisioned principal. Source recovery/revocation followup is complete:
74 focused Source/publication/purpose tests,11 HTTP/transport/factory tests and3 actual
isolated Source SQL scenarios PASS. Source deletion, registry revocation, manual edit
protection, stale revisions and retained historical receipt recovery are covered.

Operational document custody registry/host/grants, owning Ledger association, remaining
lifecycle acceptance, all20 target traces remain unfinished. Do not
label this checkpoint Core complete or production ready. Public DTO changes need evidence;
no caller assertion, extractor confidence or synthetic certificate replaces owning proof.

## Validation and environment

- Typecheck and lint/UI guard passed. Focused reader/HTTP/transport/repository/sync/lifecycle
  run84 PASS; lifecycle reducer16 PASS. Final full regression:3609 PASS,18 skipped,2 baseline failures.
- Actual isolated synthetic PostgreSQL Server84→85–92 acceptance PASS: P1–P6, sparse
  exact replay/CAS, full collection/Item read, Person invalidation, RLS, closed gates and
  least privileges. All329 historical public function bodies retain exact fingerprints.
- Tests create only a UUID-named network-none Docker clone from cached synthetic image
  `otr-core-v2-server84-fixture:20261012`, then delete that clone. No existing database,
  Hosted DEV/Production, migration journal or native-device acceptance is claimed.
- Two full-suite failures were reproduced on untouched741579c: architectureBoundary's
  UI-test infrastructure scan and navigationLayout's wrapper assumptions. Unrelated UI
  changes are outside this branch. No dependencies or product screens added.
- Runtime/provider/native/hosted gates CLOSED; no provisioned Core principal, startup
  wiring, provider calls, five-C queue dispatch, business runtime activation. Canonical integration does not open those gates.

## Authoritative next-task documents

Read this first, then `trip/implementation/W1_W5_EXECUTION.md`,
`trip/implementation/W1_W5_SOURCE_AUTHORITY_GATE.md`,
`trip/implementation/W1_W5_CAPTURE_IMPLEMENTATION_HANDOFF.md` and the nine W0 contracts
under `trip/contracts/`. The storage/read codec decision is recorded in
`adr/2026-10-12-core-v2-isolated-storage-and-codecs.md`.

Next: finish compatible acceptance/custody/Ledger work; owning Core/Source
publisher → strict Core verification → Source SQL/finalization → W7 retained Flight
original/same-ID sparse/exact receipt/read2/native Day evidence. Native and Hosted
activation require their own gates; W7 does not require all Experience renderers.

## Retained baseline platform handoff

### R3-B Native Catalog → SQLite53 — 2026-10-11 / PASS

- Accepted canonical8b5c603/R3-A6 verified. Explicit native factory connects the
  existing authenticated Catalog Transport, CLOSED Reader and transactional53
  installer with original Account/Trip/generation and cancellation. No startup
  or scheduler caller. Metro namespace-getter failure fixed by named Platform import.
- Actual isolated Harness4246352E/nativeharness: DEV disposable Actor/Trip empty
  Catalog install/replay PASS; populated fixture install/replay/read, actual52→53
  all-prior-row/history preservation, interrupted transaction rollback, cold
  local read with unavailable token seam and A→B→A fencing PASS. Live403/401 denied.
- Focused9 files/386 tests, Swift43 fixtures/header9, typecheck, lint/UI guard,
  Backend build and touched formatting PASS. SQLite1–53 unchanged. Reserved6,593
  fingerprints/own marker unchanged; original81-file Harness app restored/terminated.
- Dedicated DEV session logged out204; token artifacts removed. Report:
  `architecture/OTR_R3B_NATIVE_SQLITE53_INTEGRATION_REPORT.md`.
- Remaining: populated live Catalog publication, physical-device memory/stress,
  independent hostname-only native TLS negative and physical offline isolation.
  Composer/C5/C9/providers/business activation stay CLOSED; no runtime auto-wiring.

### DEV Reader 90-day policy / R3-A5 runtime — 2026-10-11 / PASS WITH HTTP DEFERRED

- DEV policy UPDATED: original creation2026-10-11T02:03:36.084144Z;
  actual PostgreSQL/custody expiry2027-01-09T02:03:36.084144Z;
  remind-by2026-12-26T02:03:36.084144Z. Day14 rotation removed; suspected
  compromise requires immediate rotation. Owner reminder ACTIVE; Production unchanged.
- ACTIVE/APPLIED custody consistent; same password artifact, fixed SCRAM Reader,
  accepted ACL/limit1 preserved. Actual verified TLS1.3 authentication PASS;
  expiry-only adjustment terminated no healthy sessions; final Reader sessions0.
- DEV Backend deployed immutable23dae9c026f3b945b5f394aa1e9c381daf9ef439dad22472184cb26992fba1b4
  through private read-only tmpfs injection. Host/read-only rootfs/loopback bind,
  Caddy, unrelated services and current exclusive rotated DEV API key preserved.
- Actual deployed internal Driver Catalog/SQL permission negatives/schema/bounds/
  canonical exact text PASS (510bytes/13 empty rosters). Health200; HTTP no/invalid
  auth401, malformed/query400, version426, method405. Authenticated Actor/Trip HTTP
  positive/permission smoke DEFERRED_NO_APPROVED_SESSION by Owner instruction.
- No unexpected writes:24 scoped table digests unchanged. Credential exposure
  checks PASS. Two earlier replacement attempts restored accepted configuration;
  final successful cutover observed interruption0.562s (upper bracket0.671s).
- Seven credential fixture scripts and6 Backend/Auth/Catalog/Host suites204 tests
  PASS; typecheck, lint/UI guard, Backend build, touched format/Python syntax PASS.
  3s cold checkout correction retains5s overall deadline, max1/same-lease retirement.
- Report: `architecture/OTR_DEV_READER_90_DAY_POLICY_REPORT.md`; policy/ADR recorded.
  Native/device/SQLite53 runtime integration, Composer/C5/C9/providers/business
  activation remain CLOSED. Reboot requires approved private tmpfs re-injection.

## Accepted foundation, schema and critical boundaries

- Accepted baseline registry1–53; historical SQLite1–51 sources remain exact. SQLite48 owns
  originals,49 Import admission,50 continuation/attempts;51 only local submission.
  Git Server1–84 remains exact, tail
  `20261007000100_flight_dev_dispatch_foundation.sql`, SHA-256
  `46e80899f14817d5162f255383e303232a12276e662f34b2cb16156c34d4f2a9`.
  This Core branch adds Server85–89 and SQLite54 only; Hosted lineage remains distinct.
- C1 Owner/device acceptance at79237cbd is retained in canonical b6daffe with all
  seven original commits. Joint P1/C2 Revision1 and final lineage naming follow
  `adr/2026-10-08-c1-integration-owner-decision.md`; original PROPOSED documents
  remain historical, not fabricated acceptance evidence.
- CP13A/B Flight interpretation/closure/preparation, CP14 final CLOSED A2/C2/B2,
  CP15B F1–F4/R1-C1 and LIVE-W remain accepted. SQLite50 continuation C2 is separate
  from Capture C2. Five generic C queue dispatch denials remain unconditional.
  READY/preparation is not accepted canonical output. No new Source/Run/Import,
  Event/Ledger authority, scheduler, queue drain, startup/reconnect polling or upload.
- CP15B/LIVE-W startup stays CLOSED; Linux anchored custody, exact one-call mark/
  recovery, portable fixture isolation and strict input grammar remain. LIVE-1,
  credentials/provisioning/monetary policy, Apple/vision/shadow/fallback/public B2
  activation and production access remain unauthorized.
- Final C3 Experience shell, Guest/adoption, durable semantic assessment, Review/Banner/OS
  notification, Wallet/Photo cloud, Ledger effects and final Experience shell
  require separate decisions. Source IO_UNKNOWN/provider terminality and safe IO
  retry remain blocked; retention/completion never authorizes evidence release or
  retry of unknown execution. Current Account/Trip/material authority is independent
  of retained evidence. Cached valid sessions keep offline launch; background auth
  failure pauses sync rather than blocks access.
- Read this handoff first, then task-relevant reports/contracts. Use PRODUCT,
  ARCHITECTURE, DATA_MODEL, API_CONTRACT, OFFLINE_SYNC and accepted Capture/Import
  design documents; no legacy Web reaudit or redesign. Future UI/copy uses
  `architecture/ui-foundation.md` and `architecture/OTR_TERMINOLOGY_GLOSSARY.md`.
