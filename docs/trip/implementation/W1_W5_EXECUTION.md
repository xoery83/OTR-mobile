# Core v2 implementation — W1/W2/W3/W5

Owner accepted W0 on 2026-10-12 and authorized continuous isolated implementation.
Base main/local/remote:741579c; branch codex/trip-core-v2-w1-w5. W4 extraction,
W6 renderers, Flexible/TTR and Provider remain independently owned.

1. Validate temporal precision and correct only invalid fixture representations.
2. Add finite business2 schemas/commands, exact receipts and actor/Trip validators.
3. Add schema85/SQLite54 against reverified lineage, preserve historical bytes.
4. Implement protected Core save/access and strict same-ID Flight qualification.
5. Implement Booking/Entitlement/Document/Instructions/relations/lifecycle.
6. Implement P3–P6 details, accepted read2 and deterministic Day projection.
7. Integrate existing durable queue, account fencing, mirror and receipt recovery.
8. Publish exact tested Capture interfaces early, including sibling purpose gate.
9. Validate disposable SQL/RLS, SQLite/offline and twenty acceptance targets;
   commit coherent units and integrate only after concurrency/ancestry checks.

All hosted/provider/business-runtime activation remains CLOSED. SQL tests use an
explicitly owned disposable container only; no existing database resets. No UI
changes are in this data foundation. API/repository/sync ownership remains fixed.

## Pre-implementation temporal findings

P4 W0 command labels `11:00` with clockPrecision−1 are valid minute precision.
Storage normalizes to `11:00:00` while preserving−1; nonzero seconds/fraction with
−1 is rejected. No business-time change or product redesign required. Regression:
tripCoreV2Temporal.test.ts. Source instant precision−1 requires zero seconds and
actual SOURCE_INSTANT evidence; ordinary clock/offset is never upgraded to proof.

First focused temporal+existing Flight suites36 PASS; typecheck/touched lint PASS.
Sparse→qualified conversion remains a separate guarded command, not a relaxed
CP13A create/update or a duplicate legacy Event. Existing strict validator unchanged.

## First executable Core unit (2026-10-12)

Implemented finite 31-table schemas, command2 validators and pure aggregate reducer;
strict sparse/qualified same-ID Flight, parent CAS, independent ACL/participation,
manual protection, typed family details and non-cascade relation state are executable.
`applyCoreCommand` is an internal reducer, not the authenticated proof boundary:
its source authorization and lifecycle hash inputs must come from the owning
transaction/verifier. No route or feature can turn these inputs into admission.
Document custody and Ledger mutations currently fail closed with
`OWNING_CAPABILITY_REQUIRED`; production transaction binding and proof verification
remain unfinished. W1/W2/W3/W5 are not declared complete by this unit.

Read2 manifests/pages and roster/binding hashes are executable and version-separated.
The roster digest is `otr-trip-core-roster-v2\n` plus the ordered
`[{id,revision,sha256}]` object roster. Person binding and participating roster digests
use `otr-trip-core-person-bindings-v2` and `otr-trip-core-participating-roster-v2`.
Relation `body` is `{tableName,row}` using the exact finite table row schema;
PERSON_BINDING `body` is `{person_id,account_id,active,participating}` and retains its existing
material revision. These specify implementation-level codecs where W0 names the
finite grammar without enumerating the hash input/record body.

Two technical physical bindings preserve existing semantics:
Booking observations require nullable `evidence_ref` to retain the W0 command's
immutable provenance; the W0 table appendix omitted this command field.
Existing Ledger SQL uses `expense_links.link_type`; the approved logical read field
`type` maps to that column, without changing its enum or introducing a second table.

All runtime capabilities remain CLOSED. Tests so far are local synthetic domain
and actual SQLite acceptance; none are Hosted DEV, native-device or provider E2E.

Source pre-seal consistency binding: uncertifiable submitted proposals remain private
preparation metadata and appear in `reviewSlots`; they are not sealed AdmissionPlan
slots and never gain a nullable/fabricated outputPurpose or active CREATE claim.
Status includes those reviews, so omission cannot yield a false COMPLETE workflow.
An exact preparation replay returns the immutable original proposal hash/review result;
correction needs a new explicit proposal/plan. GET source-plan transport wraps the
unchanged §3 status envelope as `{captureVersion:2,plan,status}`; §6 did not enumerate
an outer wrapper. This changes no admission authority or product semantics.

## Isolated persistence checkpoint

SQLite54 mirrors the 31 finite accepted tables in an account/Trip partition, retains
verified read2 Person bindings, and uses existing sync_operations for durable Core
intent identity. Offline predictions carry localState=PENDING and certificate0;
accepted projection carries its actual certificate generation. Revocation UPSERT is
persistent before first read. Actual Node SQLite upgrade/restart/rollback/read/privacy
acceptance:9 tests PASS. This is SQLite engine evidence, not Expo native-device E2E.

Core85/86 applied from a fresh owned synthetic Server84 clone; all329 historical
public functions retain exact SHA256 fingerprints. Rollback-only RLS tests prove
owner/Group/Selected visibility, no organizer PRIVATE override, outsider rejection,
reserved non-login roles, no public write privilege and closed writer rejection.
The actual field-state test caught and fixed a new helper-name/scope mismatch before
commit. Neither historical migrations nor accepted v1 function bodies were edited.
Run scripts/trip/core-v2-sql-acceptance.py against the pre-created local synthetic
image otr-core-v2-server84-fixture:20261012. It creates only a UUID-named network-none
clone, never pulls, and removes only that clone. This image is a read-only snapshot of
the existing stopped synthetic cp15 fixture; there is no hosted connection and no
migration-journal or provider/native proof. Existing database containers are untouched.

Remaining: owning PostgreSQL command/Source bindings, authenticated HTTP and sync
composition, custody/Ledger capability verification, full typed supplemental bundles,
Day scenarios and all twenty target traces. Current checkpoint is not W1–W5 completion.

Core2 HTTP uses existing token authentication and a private, unprovisioned owning
connection. It exposes CLOSED discovery and guarded command/operation/Source ports;
unknown versions426, duplicate keys and oversized body rejected. Replays authenticate
before owning status-only redaction and do not force current Trip read access. New
frontend transport inherits bounded response decoding and account generations. Worker
uses existing queue/executor, looks up exact receipt before fresh capability dispatch,
and never treats a status-only receipt as accepted facts. No launch/timer/host activated.
Local Day overlays wrap the unchanged strict DayRow as `{row,localState}` so pending
metadata never enters accepted DTO hashes. Supplemental Item/Occurrence DTO and six
P3/P4/P5/P6 synthetic projection tests exist; custody/device flags fail closed.

Full suite first run3514 passed/26 failed/15 skipped.24 failures were old latest-schema
53 expectations, fixed with54 registration (related431 tests now PASS). Remaining two
UI/architecture failures reproduced on an untouched741579c archive; no Core change
caused them and no UI file was modified. A final full regression remains required.

## Owning PostgreSQL command checkpoint

Core87 grants only scoped owning-session reads, exact actor/Trip membership locks and
pure existing CHECK dependencies. Historical function bodies remain untouched.
`tripCoreV2PgStorage.ts` executes finite-table deltas and immutable exact receipts in
one transaction; fresh-session TLS primary connection stays unprovisioned. Actual
network-isolated SQL-port acceptance executes P1–P6 creation, fractional places,
sparse replay/operation reuse/CAS and child aggregate checks. Positive fixture gate
CHECK changes occur only inside its disposable clone; repository migration gate
remains CLOSED. Node pg TLS/session policy tests are mocked and are not deployed proof.
Current focused Source/Core/PostgreSQL policy/SQLite regression59 PASS plus one actual
SQL-port scenario with all six families PASS;329 legacy public function bodies preserved.

Read2 bindings distinguish active identity from participation. Private instruction
predecessor bodies are not required in an authorized complete actor projection; local
mirrors retain only the opaque predecessor UUID, while global FK/chain checks stay strict.
Participant and holder changes preserve inactive historical relations.

## Owning read and recovery checkpoint

Core88 supplies exact zero-based existing Person material bindings and additive read
access-generation invalidation. Core89 supplies bounded owning Source read/lock grants
without legacy UPDATE or normal gateway raw Source/object-key SELECT privileges.
Source adapter commits cdaabab/4792baa/e018e8e retain the unavailable identity in REVIEW.
Core reader returns a complete actor-filtered inline collection in one primary snapshot;
HTTP/transport/repository validate and atomically install it. Private evidence is redacted
before actor hashing; Item and Day share protected pending overlays and accepted roster.
The owning sync coordinator resumes only its Trip's durable Core commands; generic sync
does not adopt them. Actual SQLite lost-response/restart recovery uses exact receipt
before a now-closed fresh capability and produces one Item, then accepted Item/Day read2.
Backend test authority in that recovery is synthetic; separate SQL-port scenario proves
physical Core writer/collection/Item/CAS/Person invalidation, not native or Hosted E2E.

Capture owner confirmed no owning v2 airport/whole-Source relationship publisher exists.
See W1_W5_SOURCE_AUTHORITY_GATE.md for the demonstrated authority gap, concrete ownership
decision, unfinished custody/Ledger/lifecycle and remaining20 target traces. This stage
is not STOP — CORE CONTINUOUS IMPLEMENTATION COMPLETE.

Final isolated checkpoint:7c1c641 scoped reader/recovery and Core88/89;
75186f3 accurate Capture/A01–A20 handoff;16e2d33 actual Source PostgreSQL acceptance.
Final Vitest3584 PASS/17 skipped/2 unchanged-base failures. Typecheck/lint/UI guard,
Backend build and all81 touched formatted files PASS. Separate default/--source runs of
core-v2-sql-acceptance.py each create/delete their own UUID synthetic clone and PASS;
329 old public functions unchanged. No historical migration rewrite or main integration.
Source READY remains blocked by missing W4 sealed identity authority; custody/Ledger and
partial acceptance targets are unfinished Core implementation, not falsely declared PASS.

Owner publisher direction is implemented in bounded retained ORIGINAL TEXT/reference
Flight scope. Core90 private date-bound registry/publication/association storage;
Core91/92 additive legacy claim fences and metadata-only retained historical finalization.
Source authority968d35a + shared DTOb62bc79; operatione90cb94; codec1a403be;
HTTP/transport/explicit sole-writer compositionee603f5. Actual SQL2-Candidate→2-sparse→
2same-IDqualify→4exactassociations/coldreplay PASS. Source followup adversaries continue.
Full suite3609PASS/18skipped/2 known-base failures; typecheck/lint/UIguard/build/92touched
formatted files PASS. All activationCLOSED. Main741579c retains concurrent Platform dirty
CURRENT_IMPLEMENTATION_STATE and reports; no overwrite or inclusion in Core commits.
Core overall remains incomplete: custody/Ledger/lifecycle/full20/native evidence not claimed.
