# CP13A.2 — Canonical Flight import admission implementation

Date: 2026-10-06 (Pacific/Auckland). **READY FOR TARGETED CORRECTION REVIEW.**
All deployed/runtime gates remain CLOSED. No commit, push, deployment or remote
business access occurred.

## Recovery and authority

Work continued in `codex/cp13a-flight-admission` at unchanged HEAD
`1b2bf98c24f0fb000e438e5cbfbccbc537346577`. Initial inspection found no staged or
modified files and only the two expected untracked CP13A reports. The stalled
session had made no implementation edits. Existing foundation was checked briefly;
the accepted [CP13A.1 preflight](TRIP_CHECKPOINT_13A1_EXACT_SCHEMA_COMMAND_PREFLIGHT.md)
was implemented without reopening CP12 or redesigning its contracts. Its owner
review PASS and explicit CP13A.2 migration/SQLite49 authorization govern this diff.
No material contradiction with that accepted design was found.

## Implemented scope

- Eight additive server migrations `20261005000400`–`20261005001100` extend the
  accepted 74 to 82. They install protected C6, lineage/output claims and dependencies,
  Event-owned services, fixed proof/receipt bridges, strict value guards, bounded
  private observations and permanent undispatched revocation. Existing migration
  files are unchanged. Exact catalogs, columns, constraints, indexes, RLS/policies,
  ACLs, role metadata and 36 function fingerprints are in the
  [security manifest](TRIP_CHECKPOINT_13A2_SECURITY_MANIFEST.json), covering 17
  new/touched tables. The read-only regeneration query is
  `scripts/supabase/trip-import-flight-security-inventory.sql`.
- `CREATE_TRANSPORT` and `UPDATE_TRANSPORT` use the existing B intent/receipt
  namespace. Protected SQL validates `TRANSPORT`/`FLIGHT`/`UNASSIGNED`, finite typed
  values, exact TRACK_C or retained evidence and parent CAS. Root, both endpoints,
  1–4 ordered services and immutable receipt commit together. Unchanged selected
  values require their exact retained value/ref. Retiming retains unchanged place
  enrichment. Legacy/missing-service transports receive no identity backfill and
  cannot use UPDATE without separately reviewed adoption.
- Runs publish children atomically as READY. Inputs bind selected manifest/
  Representation bytes and transform descriptors; Candidates and review bindings
  are immutable. Related Run/Candidate graphs and overlapping-Source unresolved
  claims fence reprocessing/consolidation. Known success supplies the exact Event;
  UNKNOWN/absence never releases a claim. DISTINCT_OUTPUT preserves the parent
  claim; incompatible merge targets, cycles and oversized graphs fail closed.
- The sole new Source-owned B proof edge is `trip_source_admit_event_proof`.
  Its internal operation helper is invoker-only and unavailable to the Event writer.
  Extracted support covers the complete sealed field input set in both directions;
  edited/user-entered support is explicit. Event writers have no C catalog access,
  and Source writers have no raw B receipt access or generic B mutation capability.
  Read-only deferred integrity triggers retain trusted migration ownership. The
  existing Source lock helper joins C scope serialization before its original
  admission/Source locks. Isolated principal flags and memberships are unchanged.
- Temporal **Option A only** and `import-flight-match-v1` are implemented. Original
  source civil/zone/offset information can remain in parked C proposals; executable
  review/commands require independently evidenced or confirmed instants. No civil
  resolver or offset arithmetic is admitted. Unknown arrival stays null. Qualified
  service/date/route, scoped supplier/operating relationship and fresh reviewed
  supersession/retiming are assessed conservatively; incomplete/ambiguous scope is
  withheld.
- SQLite49 is authorized and registered after unchanged 1–48. It stores Source3,
  C6/lineage4 observations, drafts, exact B receipt cache, Capture bindings and
  baseline-bound service mirrors. Repositories reuse Account generation/apply
  gates and existing transactions/queue. Pending local lifecycle observations do
  not claim server timestamps/revisions: actual prepare/dispatch acknowledgement
  tests verify this boundary and stale response fencing. Receipt/catalog apply
  never inserts certified membership, canonical Event authority or Day rows.
- Explicit Capture NEW/REUSE/REPLACEMENT verifies CP11 revision/original bytes,
  durable identities and Source CAS. No Source is created on Capture insert, no
  hash-only reuse or automatic Source identity dedup occurs, and pending replacement
  does not advance the current manifest. TEXT respects existing 262144-byte C limit;
  binary admission requires the installed actual static-PNG format/profile verifier.
  Unsupported material is withheld. Original BLOBs and exact uncertain operations
  survive restart. No upload/provider/IO retry worker is activated.
- The scheduler hard-excludes all five new C operation names, including revocation,
  even with a permissive caller filter. Factories, private ports and typed codecs
  are explicit and unwired. No new HTTP route, connector, runtime principal/login,
  provider, LLM, startup process or UI is provisioned.

## Narrow owner clarification: terminal CREATE recovery

As recorded in the [ADR](../adr/2026-10-05-cp13a-flight-admission.md), an exact terminal
CREATE_TRANSPORT REJECTED/CONFLICT receipt may recover without current target Event
read admission. The target may be absent or the intended UUID may belong to another
Trip. Current requesting Actor/Trip admission and exact command, operation key,
intent digest, intended ID, Confirmation/output slot and receipt/result identity
are still required. The bridge verifies the immutable receipt hash and returns
only minimal status/correlation/no-commit proof; it exposes no target data, raw
intent, private confirmations or result payload. It is not a general receipt API.

APPLIED/NO_CHANGE and other successful target-bearing outcomes retain normal
current target read admission and exact target/result verification; UPDATE recovery
also retains target read authority. Missing receipt remains UNKNOWN. Permanent
undispatched revocation is a separate exact guarded no-commit basis. Local requests
alone cannot release claims. CP12 and the historical CP13A.1 document are unchanged.

## Acceptance matrix

These are local foundation results, not deployed/runtime activation evidence.
Positive SQL capabilities exist only in owned disposable network-isolated databases
and rollback transactions. The original user Supabase container was not modified.
Native fixtures contain synthetic material/identities only; SQL-produced snapshots,
commands and receipts are checked into repository test fixtures.

| CP13A.1 case               | Result and concrete evidence                                                                                                                                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh server               | PASS: all 82 migrations replay against accepted platform utility fingerprints; exact private catalogs/guards,83 permission assertions, both import gate CHECKs false.                                                                                                                                         |
| Upgrade server             | PASS: exact 74 seeded retained/identity-only Source, immutable B receipt, legacy and canonical transport; all 121 old table projections byte-identical after 74→82; no service backfill; isolated roles/memberships byte-identical.                                                                           |
| SQLite fresh/upgrade       | PASS: native SQLite 1–49 plus seeded 1–48→49, FK ON/OFF; prior schemas/data/queues/Capture/Day/Account/Ledger preserved; existing runner/composition expectations extended to 49.                                                                                                                             |
| Offline authenticated      | PASS: existing cached-auth/Account regressions and local draft/preparation/restart with no network/token bootstrap. Pending intent never asserts server admission.                                                                                                                                            |
| Cold restart               | PASS: real file-backed databases reopen byte-identical C draft/intent/queue, UNKNOWN state, Capture binding/Source command and original BLOB; exact receipt replay yields no extra Event/Source or queue identity.                                                                                            |
| A→B / A→B→A                | PASS: actual changed Account IDs and two generation transitions reject old A callbacks; no apply to B/later A, and a fresh A context recovers.                                                                                                                                                                |
| Capture modes              | PASS: real CP11 SQLite intake/handoff, NEW exact replay/key collision, selected-material REUSE/no command, missing-byte rejection, REPLACEMENT CAS/pending pointer, binding retention and cold uncertain recovery.                                                                                            |
| CREATE received/lost       | PASS: real SQL root/endpoints/service/receipt revision 1; replay returns original hash/revision; local UNKNOWN restart and exact receipt cache never create canonical membership.                                                                                                                             |
| UPDATE received/lost       | PASS: reprocessed C2 continues exact C1 target, fresh base 7 retimes departure/completes arrival atomically to 8, lost response replays 8 without 9; unsupported passenger DEFER reference remains in C.                                                                                                      |
| Predecessor UNKNOWN        | PASS: actual C1 UNKNOWN holds concurrent C2/C3 at an advisory barrier; rollback leaves closed gates/no escaped writes or deadlock. Positive serial protected reprocess/consolidate both reject competing CREATE while UNKNOWN. Runner: `scripts/cp 13 a/verify-local-admission-races.py`.                     |
| Known predecessor success  | PASS: exact C1 receipt blocks new UUID CREATE independently of canonical search and C2 updates the known target under fresh CAS.                                                                                                                                                                              |
| No-commit / split/merge    | PASS: missing receipt retains claim; absent/foreign target terminal recovery releases exact claim; permanent revocation cannot redispatch; real distinct split retains parent claim; merge of different successful targets conflicts; cycle/65-input/replay-lineage limits reject atomically.                 |
| Stale revision / I2        | PASS: reviewed 7 versus current 8 returns immutable conflict, never substitutes base or produces 9; exact conflict recovery requires target read; no passenger/participant write.                                                                                                                             |
| Flight match-v 1           | PASS: qualified tuple/date/route, reverse/date differences, codeshare verified/unknown, scoped supplier, fresh retime/supersession, contradiction/partial/multiple-clock/65-item withholding. Passenger/PNR do not enter occurrence anchors.                                                                  |
| Temporal A                 | PASS: independent instant evidence, precision/date validation, midnight, null arrival; offset-only/full civil/estimated executable values reject; parked original civil values retained without resolver claims.                                                                                              |
| Permission/malicious input | PASS: forced RLS, API/PUBLIC denial, exact roles/EXEC edges, no C↔B shortcuts, closed deployed DML; altered scope/digest/unknown nested dimensions, duplicate JSON, missing/unused proof, invalid scalar and stale/redacted material fail. Manifest and native/session-aware tests preserve A1-I2C5 verifier. |
| Receipt/support finalize   | PASS: exact domain receipt first, pinned association second; redacted evidence enters EVIDENCE_PENDING, repeated retry retains success without another domain command/revision; identity/history records remain.                                                                                              |
| Certificate                | PASS: unchanged B-T3I golden/hash/page/absence-fence suites; stale service baseline withheld; no participant/service completeness or receipt-derived membership.                                                                                                                                              |
| Day                        | PASS: existing complete certified refresh→CP11 transport projection and retained/offline/history/null-arrival tests; Import repository writes no Day or canonical authority rows.                                                                                                                             |
| Ledger                     | PASS: populated SQL expenses/splits/valuation/payment/evidence/change projections byte-identical around all Flight successes/failures/recovery; SQLite prior-table/queue preservation; no Ledger request/operation emitted.                                                                                   |
| Regression/tooling         | PASS final selected 17 suites/303 tests; typecheck, lint with zero warnings/UI guard and Backend build; changed-file format/relative links/Git whitespace. Broader baseline exceptions are classified below.                                                                                                  |

## Validation and existing baseline exceptions

- New/affected domain and native SQLite suites include 51 repository cases, 32 Flight
  grammar/matcher cases, 8 reviewed-action cases and 23 scheduler cases. Native Flight integration has 118
  assertions; exact permission/RLS suite has 83. Fresh/upgrade and barrier evidence
  above use PostgreSQL 17.6.1.167, not mocked TypeScript success.
- Relevant native A activation/command/snapshot, B command/collection and C command/
  execution-journal suites pass after exact additive capability expectations.
  Three older SQL fixtures still fail in their superuser SET ROLE harness; identical
  failures were reproduced from unchanged HEAD against a separately replayed exact 74
  database: participation/temporal fixtures retain superuser session authority during
  attempted role changes and later lose table access; Source protected fixture has
  three `ok()`/SET ROLE diagnostics. CP13A tests use actual session authorization,
  assert API/root denial and unchanged isolated membership; these failures are not
  treated as CP13A security success.
- The final broader Vitest run passes 1850 tests and retains the existing 10 React Native Flow loader collection
  failures and one Ledger architecture-boundary failure. No unrelated product fix
  is folded into this slice. SQLite49 expectation failures found during validation
  were corrected; all affected suites pass. The previously recorded whole-repository formatting debt
  (17 unchanged paths) remains outside this correction; changed files are checked
  separately, and independent review evidence is excluded from formatting edits.
- The report, ADR and incremental API/data/offline/current-state updates describe
  authored closed foundations only. Disposable databases and dependency links are
  removed at handoff; no user database/data, lockfile or dependency set is changed.

## Targeted owner corrections R1–R3

The independent verdict was **PASS WITH REQUIRED CORRECTIONS**. This section
supersedes the initial readiness claims for the three affected invariants. The
[independent review](TRIP_CHECKPOINT_13A2_IMPLEMENTATION_REVIEW.md) remains byte-identical
to correction entry; it is evidence, not an implementation status document. CP12,
CP13A.1, historical migrations, certificate encoding and runtime activation are unchanged.

- **R1 cause:** validation followed supplied command/proof leaves into reviewed
  fields, without deriving the entire executable selection first. Required support
  could be missing, or the reviewed retime could be omitted from an arrival-only UPDATE.
  **Fix:** executable slots require an exact selected-field/support-key relation.
  Local preparation resolves every selected value from immutable Candidate proposals
  or explicit reviewed USER_ENTERED/edited values. Dispatch independently expands
  composite endpoint/service selections into the finite canonical leaves, compares
  complete composite values and required leaf coverage in both directions, and
  validates selected RETAINED values/opaque refs against scoped local baseline facts.
  Missing baseline proof is withheld. The existing Source-owned fixed operation
  root now receives the submitted values/proofs internally and performs the same
  reverse comparison before canonical mutation. RETAINED supports also pass the
  existing field-evidence checks; B still checks exact current retained refs/values.
  Explicit deferrals, allowed nullable clears, precision pairs and USER_ENTERED
  semantics remain explicit. No selected omission becomes an implicit defer.
  **Tests:** eight domain/review vectors; eight durable dispatch cases across both
  FK modes, including a consistently rebound arrival-only digest, exact retained
  ref and incorrect retained ref; native savepoint-isolated partial UPDATE, missing
  leaf, unused proof, value mismatch, wrong retained ref and explicit nullable clear.
  The complete mixed action still commits revision 7→8 once and replays 8 without 9.
- **R2 cause:** certified absence deleted endpoints and parent Event mirrors without
  reconciling the SQLite49 service extension. RESTRICT blocked FK-ON refresh; FK OFF
  left an orphan that could reappear on identity/revision re-admission.
  **Fix:** the canonical collection repository explicitly deletes only current
  Account/Trip service children for certified-absent IDs before deleting parents,
  inside the existing certificate/membership/Event transaction. Legacy pre-49
  schemas have no extension to reconcile. Retained and unrelated scope rows survive;
  no cascade dependency or Import→Day write is added.
  **Tests:** six native SQLite49 cases: absence plus retained/other Account/Trip
  preservation and same-identity/revision re-admission, in each FK mode; injected
  service-child and parent deletion failures restore Event/endpoints/services/
  certificate/membership together in both modes. Existing certificate goldens and
  Day projection tests pass.
- **R3 cause:** local Candidate lineage required a redundant direct Run edge, although
  the admitted Run graph allows transitive ancestry.
  **Fix:** bounded ancestor reachability replaces the direct-edge check after scoped
  graph/cycle validation. Catalog bounds reject the whole observation, never truncate.
  **Tests:** five cases prove R3→R2→R1/Candidate R3→R1 without redundant R3→R1,
  direct ancestry, and disconnected/cycle/over-bound rejection. Existing recovery,
  cold restart and Account-generation tests pass.
- **Optional duplicate index:** confirmed identical unique columns and active-CREATE
  predicate. Removed `local_source_create_claim` from still-uncommitted SQLite49;
  retained `local_trip_source_slot_create_claim`. Fresh/seeded upgrade and FK-ON/OFF
  checks pass with the same uniqueness semantics.

Final focused corrections: **3 suites / 154 tests PASS**. Builder's same selected
regression set: **17 suites / 303 tests PASS**. Corrected native Flight integration:
**118 assertions PASS**; unchanged metadata/ACL suite: **83 PASS**. Fresh disposable
82-migration replay and exact74 seeded upgrade preserve all 121 old table projections
and isolated role metadata/memberships. Existing admission barrier test passes;
both gates and participation verifier match the regenerated security manifest.
Typecheck, lint with zero warnings/UI guard, Backend build, changed-file formatting,
links and Git whitespace pass. Broader Vitest: **1850 PASS**, with the same one
Ledger boundary failure and ten React Native Flow collection failures. The three
previously proven SQL harness baseline failures remain unchanged and classified above.

| Targeted correction answer                      | Result |
| ----------------------------------------------- | ------ |
| R1 reverse reviewed-field coverage fixed        | YES    |
| R1 partial reviewed action rejected             | YES    |
| R2 FK-ON certified absence fixed                | YES    |
| R2 FK-OFF orphan prevention fixed               | YES    |
| R2 atomic reconciliation preserved              | YES    |
| R3 transitive lineage recovery fixed            | YES    |
| R3 disconnected/cycle/bound rejection preserved | YES    |
| Independent review report modified              | NO     |
| Runtime gates still CLOSED                      | YES    |
| Passenger/booking capability added              | NO     |
| Civil resolver added                            | NO     |
| Ledger behavior changed                         | NO     |
| Hosted Dev accessed                             | NO     |
| Production accessed                             | NO     |
| Commit                                          | NO     |
| Push                                            | NO     |

## Required answers and stop boundary

| Required answer                                                  | Result                                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Exact C persistence / lineage / output claims implemented        | YES — protected C6 + lineage4 and exact local mirrors.                            |
| Transport service identity resolved                              | YES — finite Event-owned services; no legacy backfill.                            |
| Fixed TRACK_C→B proof implemented                                | YES — sole Source-owned fixed proof root; private helper stays inaccessible to B. |
| CREATE_TRANSPORT / UPDATE_TRANSPORT                              | YES — real atomic SQL and immutable existing-namespace receipts.                  |
| Temporal option / match policy                                   | A ONLY / `import-flight-match-v1`.                                                |
| Server migrations / SQLite49 authored                            | YES —8 additive server migrations;49 authorized and registered.                   |
| Passenger persistence / booking persistence                      | NO / NO.                                                                          |
| Participant-aware certificate / civil resolver                   | NO / NO.                                                                          |
| Reservation CREATE / Ledger mutation                             | NO / NO.                                                                          |
| Existing Source / receipt namespaces / Account generation reused | YES / YES / YES.                                                                  |
| Provider/LLM/runtime/UI/global activation                        | NO.                                                                               |
| All deployed/runtime gates CLOSED                                | YES — structural defaults/constraints retained.                                   |
| Production code changed / migrations authored                    | YES / YES, locally only.                                                          |
| Hosted Dev / Production accessed or changed                      | NO / NO.                                                                          |
| Commit / push                                                    | NO / NO; HEAD unchanged, staging empty.                                           |

**STOP — READY FOR TARGETED CORRECTION REVIEW.** No runtime activation, deployment,
commit or push is authorized. The two accepted design reports remain authoritative;
only the narrow terminal CREATE clarification above amends CP13A.1.
