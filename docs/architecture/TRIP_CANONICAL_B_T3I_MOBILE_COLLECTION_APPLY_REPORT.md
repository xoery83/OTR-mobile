# B-T3I Mobile Canonical Event Collection Certificate + Atomic Complete-Set Apply

**B-T3I FULL PASS / ACCEPTED / CLOSED**

Date: 2026-10-05. Clean starting worktree `/Users/xoery/Project/otr-mobile-temporal`,
branch `trip/temporal`, exact HEAD `55a35bc2174e2abacc5c1a1bb6206b9918209e3b`.
Authority: explicit B-T3I task and accepted B-T3E/F/G/H foundations. B-T3I and
the durable-generation P2 correction are accepted and closed; task-owned commit
authorized. No push, merge/rebase, deployment, remote access or sibling edits.

## Completed path

`getDefaultTripCanonicalEventRepository().refreshCollection(tripId)` is the explicit
central repository entrypoint. It obtains a new durable Account/Trip generation,
captures the exact local root/endpoint/certificate baseline under the existing
Account apply gate, then releases the gate before credentials/network/page work.
One retained Account/Trip/generation context is checked throughout the attempt.
Independent calls/repository instances share the same durable latest generation.
There is no screen-owned path, financial cursor dependency, timer, retry worker,
automatic recovery loop or new background refresh policy.

The transport requests only GET `/v2/trips/:tripId/canonical-events/snapshot`, both
V1 headers, and absent query or exactly the canonical continuation cursor. Every
page uses authenticated transport and the original captured context. Actual HTTP
body UTF-8 size is checked before JSON acceptance, including whitespace omitted by
parsing. Verification also checks the parsed page and full canonical byte limits.
Existing request timeout/auth retry behavior is retained; no collection timer is added.

Full-chain checks include exact envelope/version/scope, constant epoch/revision/
count/hash, fixed 100-aggregate page semantics, strictly ascending lowercase UUIDs,
no duplicates, exact contiguous ordinals, canonical cursor encoding/schema/bindings,
final/continuation consistency and every full B-T3E aggregate. Per-entry WITHHELD,
unsupported participant scope/version, malformed Unicode, missing/extra/repeated
pages, mismatched cursors or any altered leaf reject the attempt. Whole-set limits
remain 10,000 Events / 100 pages / 64 MiB canonical read bytes / 4 MiB page body.
WITHHELD is not a complete empty set. Incomplete buffers never enter SQLite.

## SQLite 46 schema

Exactly one local migration is appended: `46 trip_canonical_event_collection_certificate`.
SQLite 1–45 SQL/registrations remain byte-identical. It adds only these three tables:

| Table                                         | Columns and purpose                                                                                                                                                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trip_canonical_event_collection_generations` | `account_id`, `trip_id`, `refresh_generation`; scoped composite PK, positive safe INTEGER latest local owner generation                                                                                          |
| `trip_canonical_event_collections`            | `account_id`, `trip_id`, `snapshot_epoch_id`, `snapshot_revision`, `contract_version`, `read_version`, `temporal_version`, `fingerprint_version`, `event_count`, `fingerprint`, `complete`, `applied_generation` |
| `trip_canonical_event_collection_ids`         | `account_id`, `trip_id`, `event_id`; scoped unique normalized certified membership                                                                                                                               |

Certificate has Account/Trip PK and FK to generation. Membership has Account/Trip/
Event PK and FK to certificate with delete cascade. Versions are constrained to 1,
complete to 1, counts to 0..10,000, hash to lowercase 64-hex, and generations to
1..9007199254740991. Revision is canonical positive decimal TEXT bounded by
9007199254740991, compared by exact BigInt, never Number or lexical ordering.
There is no partial certificate, saved page cursor, fabricated semantic revision
or per-Event tombstone. Beginning a refresh advances only its generation row;
it does not replace the last accepted certificate/mirrors.

As explicitly authorized by B-T3I, this normalized certificate/ID relation and
durable generation supersede B-T3G's proposed seven-column JSON-ID/process-local
layout. The task also permits different incomparable epochs only through exact
complete verification and current local generation. No epoch ordering is invented.
The historical B-T3G contract is retained; ADR records these explicit task decisions.

## Atomic apply and removal invariants

One Account-gated SQLite transaction:

1. Recheck active Account/context and latest scoped durable refresh generation.
   Compare the captured local baseline; any intervening individual/certificate
   change supersedes the buffered attempt rather than allowing stale absence.
2. Compare accepted watermark. Same-epoch lower revision rejects. Equal revision
   requires identical fingerprint and ID set; contradiction fails closed. An
   incomparable epoch needs full validation and the current generation.
3. Reconcile all aggregates using the existing B-T3F internal routine. It retains
   semantic monotonicity and only accepted equal-revision Place UUID→null loss.
   Older incoming facts or any unknown/corrupt local projection abort the whole apply.
4. Install/replace complete certificate and normalized ID set; remove scoped absent
   endpoints/roots only from the dedicated B-T3F read-mirror tables.
5. Recompute fingerprint from the actual resulting included SQLite mirrors and
   require the certified hash. Recheck Account/context immediately before commit.

The individual and collection paths reuse one aggregate reconciliation function;
there are no nested independent apply transactions. Any failure rolls back root,
endpoints, certificate, membership and removals together. A crash/interruption
before commit preserves the prior certificate/mirrors; after commit the complete
new set and certificate are consistent. The separately advanced attempt generation
may remain after failure, intentionally invalidating older work without claiming
completeness. Generation overflow fails before network or destructive apply.

Only dedicated Account/Trip-scoped canonical read-mirror tables establish removal
provenance. Unknown local read/temporal versions or corrupt aggregates block removal.
Legacy/local authoring, queues, Source/staging, Booking, Person, Ledger/financial
facts and provider/candidate data are not removal targets. Foreign Account/Trip
rows remain intact. Complete empty may remove all eligible owned mirrors; partial,
WITHHELD, auth/network/validation failure or stale output can remove none.

## Persistent anti-resurrection rule

Every `applyRead`, including callers of `refreshEvent`, consults the durable scoped
certificate membership inside the same Account-gated transaction. Before the first
certificate, B-T3F individual mirroring remains available. Afterwards, an ID outside
the accepted ID set returns `CERTIFIED_ABSENT` without recreating it, even with a
higher Event semantic revision. Semantic revision does not prove membership.

Only a newer accepted complete collection may reintroduce an absent Event. Included
Events may still receive B-T3F monotonic individual updates. Those facts can make
the historical certificate's mirror hash stale; `getCollectionCertificate` derives
`mirrorMatches` by rehashing its included mirrors while retaining its durable
membership fence. This value is hash consistency, not a wall-clock freshness claim.
No individual WITHHELD/404 response removes anything or renews a certificate.
The membership fence and watermark survive cold restart and Account changes.

## Shared codec and Backend equivalence

`src/data/api/tripEventCollectionCodec.ts` holds one platform-neutral normative
serializer, manifest byte builder, cursor schema and envelope schemas. Backend
retains Node SHA-256 and its canonical Buffer cursor encoding/strict decoding;
Mobile uses the existing expo-crypto SHA-256 seam and strict ASCII/base64url cursor
round-trip (the normative cursor contains ASCII only). No Node-only import reaches
Mobile. Portable Unicode scalar checks have the same result as String.isWellFormed.

The accepted positive B-T3E projection, lowercase UUID rules, UTF-16 key sorting,
endpoint role ordering, ECMAScript binary64/JSON.stringify number spelling, UTF-8
and exact domain separators are unchanged. A pristine starting-HEAD Backend copy
was independently loaded from temporary files: **110** shape/numeric/Unicode/byte/
hash cases and **11** complete pages/cursors are exactly equivalent. All five
Mobile golden fingerprints and independent Python byte/hash vectors match B-T3G.
Protected B-T3H SQL, fixed float/session config, roles, route wiring, DTO, manifest
and verifier remain byte-identical. No server migration or privilege change.

## Validation

| Check                                                                           | Result                                                         |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| B-T3I focused cases                                                             | 89 tests PASS                                                  |
| Final B-T3I/E/F/H and SQLite migration selection                                | 6 files / 207 tests PASS                                       |
| Auth/DB/sync/API selection, including redaction test recheck                    | 38 files / 400 tests PASS                                      |
| Full Backend                                                                    | 29 files / 360 tests PASS                                      |
| Ten existing native-import-blocked suites with temporary notification isolation | 10 files / 134 tests PASS                                      |
| Pristine Backend codec equivalence                                              | 110 cases + 11 pages/cursors PASS                              |
| Mobile and independent Python B-T3G golden reproduction                         | All five vectors PASS                                          |
| Typecheck / Backend build / full lint / UI guard                                | PASS, no lint warning                                          |
| Changed-file format / whitespace                                                | PASS                                                           |
| SQLite 1–45 source-prefix integrity                                             | Byte-identical PASS                                            |
| SQLite 45→46 populated upgrade                                                  | Every historical table/schema/row retained; three tables added |
| Server/security/schema integrity                                                | All 72 migrations and manifest/verifier/route/DTO unchanged    |

The full standard Mobile run was executed: **183 files; 172 passed, 11 failed**;
**1,491 tests passed, 1 failed**. Ten failures occur before test execution because
an existing Ledger queue-notification dependency imports React Native Flow into
the Node runner. The existing LedgerExpenseDetailScreen violates its architecture
import guard. These files/import boundaries are byte-identical to starting HEAD.
The unrelated timestamp-sensitive client redaction assertion passes in this full
run and scoped recheck. The ten
blocked suites pass 134 functional cases with a temporary test-only mock of
`announceLedgerQueueWorkAvailable`, consistent with prior accepted preflight
validation. No production test configuration, native notification or unrelated
Ledger/architecture implementation is altered. Full standard Mobile suite remains
not fully green; this report does not claim otherwise.

Tests cover empty/1/100/101/1203 Events, final short page, idempotence, strict cursor
mutations, duplicate/order/scope/version/count/hash/leaf/finality errors, all withholding
reasons, interrupted/stale/admission-failed chains, individual page/full-set limits,
Account ABA, latest generation/epoch, lower/equal contradictory revisions, intervening
individual facts, cold restart, certified absence/reintroduction, foreign/local-only
preservation, Place cache loss, generation overflow, six write-stage failures and
commit failure. Upgrade tests preserve B44 mirrors, A45 immutable receipts and
legacy/Ledger data; the entire migration runner reaches 46 once and reopens safely.

Evidence logs and temporary comparison/isolation harnesses remain under
`/private/tmp/bt3i-*`, outside repository artifacts. No runtime credentials are added.

## P2 durable-generation correction — FULL PASS / ACCEPTED / CLOSED

Correction-owned files are `src/data/db/migrations.ts`,
`src/data/repositories/tripCanonicalEventRepository.ts`,
`src/data/repositories/tripEventCollection.test.ts`, `docs/DATA_MODEL.md`,
`docs/CURRENT_IMPLEMENTATION_STATE.md` and this report. All other B-T3I artifacts
are byte-identical to the pre-correction working tree, including Backend/codec/
transport/page verification. SQLite 1–45 and all 72 server migrations, B-T3H
manifest/verifier/gateway/route/DTO remain byte-identical to starting HEAD.

SQLite 46 only: both generation columns have BLOB affinity (no conversion of
numeric TEXT or REAL) and `CHECK(typeof(column)='integer' AND column BETWEEN 1
AND 9007199254740991)`. INTEGER affinity would silently normalize numeric TEXT;
BLOB affinity with this CHECK still permits only INTEGER storage. JS number
bindings can use REAL storage, so repository writes explicitly `CAST(? AS INTEGER)`
only after validating the computed positive safe integer owner. No read coercion.
`trip_event_collection_generation_insert` and `_update` BEFORE certificate write
triggers abort with `CANONICAL_EVENT_MIRROR_INTEGRITY` unless the exact scoped
refresh row exists with integer storage and `refresh_generation >= NEW.applied_generation`
and the incoming applied generation has integer storage. No migration 47.

`collectionGeneration` checks scoped row binding, SQL `typeof`, JS safe-integer
and positive bounds. `collectionCertificate` always loads this row, including
when there is no certificate, and validates certificate scope/storage/safe positive
applied generation and refresh >= applied before membership trust. The refresh
baseline invokes these checks before computing/persisting its next owner and
before transport; completion revalidates them. Individual apply and certificate
read use the same gate/transaction validation. Corruption throws the existing
integrity error, never null/bootstrap, silent repair or unrestricted mirroring.

22 added cases cover both fields' REAL/numeric TEXT/zero/overflow rejection,
maximum safe INTEGER acceptance, INSERT/UPDATE ahead/missing scoped watermark
guards, and ten deliberately bypassed corruption variants plus corrupt bootstrap.
The reviewer sequence accepts owners 1 then 2, rewinds refresh to 1 with applied 2,
and attempts a different epoch: certificate read and both present/absent individual
applies reject, collection transport calls = 0, generation remains 1, and every
root/endpoint/certificate/membership row is unchanged. Missing/REAL/TEXT/unsafe
variants have the same fail-closed outcome. No used owner is reused.

All 89 focused cases and existing stale-refresh/restart/reintroduction/Account-Trip/
rollback regressions pass. Clean 1→46 and populated 45→46 migration checks pass.
P2 evidence is under `/private/tmp/bt3i-p2-*`. Full standard Mobile remains blocked
only by the existing ten native Flow import suites and one Ledger architecture
assertion; the isolated ten suites pass 134 cases. No runtime activation or remote access.

## Still pending

Participant-aware collection adapter; Event mutation/deletion commands; authoring
and Today/Day Feed UI; new background refresh/wake policy; dedicated server runtime
connector/credential provisioning and live/device activation acceptance. Explicit
refresh implements no automatic policy or command capability.

## Changed files

- `backend/src/tripEventCollection.ts`
- `src/data/api/tripEventCollectionCodec.ts`
- `src/data/api/tripCanonicalReadTransport.ts`
- `src/data/db/migrations.ts`
- `src/data/db/database.test.ts`
- `src/data/repositories/defaultTripCanonicalEventRepository.ts`
- `src/data/repositories/tripCanonicalEventRepository.ts`
- `src/data/repositories/tripCanonicalEventRepository.test.ts`
- `src/data/repositories/tripEventCollectionVerification.ts`
- `src/data/repositories/tripEventCollection.test.ts`
- `docs/API_CONTRACT.md`
- `docs/DATA_MODEL.md`
- `docs/CURRENT_IMPLEMENTATION_STATE.md`
- `docs/adr/2026-10-05-canonical-event-collection-apply.md`
- `docs/architecture/TRIP_CANONICAL_B_T3I_MOBILE_COLLECTION_APPLY_REPORT.md`

## Required confirmations

- B-T3I implementation complete: **YES**
- SQLite migration 46 added: **YES**
- historical SQLite 1–45 changed: **NO**
- full page chain locally validated: **YES**
- Mobile recomputes collection fingerprint: **YES**
- partial/WITHHELD can certify absence: **NO**
- absence deletion atomic with certificate install: **YES**
- stale older refresh can overwrite newer apply: **NO**
- delayed individual read can resurrect certified-absent Event: **NO**
- Event commands enabled: **NO**
- deletion command enabled: **NO**
- participant adapter enabled: **NO**
- polling/timer added: **NO**
- Production/Hosted Dev accessed: **NO**
- commit: **authorized after acceptance; task-owned files only**
- push: **NO**

**FULL PASS / ACCEPTED / CLOSED.**
