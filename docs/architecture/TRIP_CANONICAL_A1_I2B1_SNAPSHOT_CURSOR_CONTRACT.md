# Trip Canonical A1-I2B1 — Exact Snapshot / Fingerprint / Shared Cursor Contract

Status: **A1-I2B1 CONTRACT COMPLETE — REVIEW PENDING**.
Date: 2026-10-04 (Pacific/Auckland). Design only; no implementation authorization.

Startup: `/Users/xoery/Project/otr-mobile-canonical`, branch
`integration/ledger-polish-canonical`, HEAD
`5537eb6c7e57de13037d9c00d363259e9b0765c8`; workspace clean.
Latest eight commits: `5537eb6`, `489a108`, `6b98e41`, `0191f1e`, `2371fe7`,
`3bb7cf2`, `e6fd8ad`, `7a9c0a6`. Only this document is added; no commit.

CURRENT denotes checked-in source. MUST/SHALL below define the proposed exact
contract if approved, not implemented capabilities. Accepted I2B-P strategy is
retained. Required I2B-P/I2A schema/report, B-T3A/C-I2 and canonical offline/API/
architecture/current-state context were consulted; actual affected source was
rechecked. Historical handoff review/commit statements do not override current
Git or the owner's supplied approval. No legacy Web/sibling inspection or remote
access. The one-document instruction excludes current-state/ADR updates here.

## A. Executive contract

A complete authoritative Trip Member snapshot binds its **participation vector**
to deterministic fingerprint version 1 and shared Ledger cursor version 2.
Every authorized shared pull checks that fingerprint; mismatch returns
`INVALID_CURSOR`, recovered by bounded coherent bootstrap. Atomic local application
commits rows, scoped completeness certificate, actor context and cursor together.

Authority is existing `journey_members.id` and its per-Person pair. Complete local
reads retain inactive and absent historical Persons. No Trip counter, Member feed,
new Person table, soft deletion, lifecycle mutation, financial predicate, receipt,
UI, migration or implementation is introduced by this document.

Agreement is **at a server observation point**, not permanent freshness. Eventual
convergence requires a successful admitted refresh after change and finite churn.
A participation fingerprint is not identity, admission or immutable money evidence.

## B. Existing cursor/bootstrap evidence

| Source / symbol                                                                  | CURRENT fact / implementation obligation                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/supabaseGateway.ts:encodeLedgerCursor/decodeLedgerCursor` (271/277) | v1 base64url JSON `{version:1,sequence,tripId,userId}`. Safe nonnegative numeric sequence; scope/version validation. Also used by private payment reads.                                                                                          |
| Same: `readLedgerBootstrap` (6187 onward)                                        | Member single SELECT ordered by display name; no range/count/completeness proof. All DTO pairs required by new gateway. Finance sequence/settings before/after retry three attempts; no lifecycle guard. Zero latest sequence yields null cursor. |
| Same: `readAllJourneyExpenses`; `ledgerBootstrapPagination.test.ts`              | Explicit 500-row Expense paging and 1,203-row test. Does not certify complete Members.                                                                                                                                                            |
| Same: `readLedgerChanges` (6384 onward)                                          | Currency barrier invokes INVALID_CURSOR. Financial feed fetches 101 rows, delivers up to 100, sets hasMore; last feed sequence advances even if some events are not exposed. No Member comparison.                                                |
| Same: private payment changes (5517 onward)                                      | Uses v1 helpers with separate private stream/admission. Its sequence is not the shared Ledger continuation.                                                                                                                                       |
| `src/data/api/ledgerReadContracts.ts`                                            | Member pair optional together; bootstrap cursor nullable; no snapshot/verification envelope. Public change union has no Member entity.                                                                                                            |
| `ledgerReadRepository.ts:applyBootstrap/applyJourney/saveCursor`                 | Monotonic preserving Member upsert and atomic account-scoped cursor, no completeness certificate. Cursor saving uses REPLACE; future metadata must not be erased by that statement.                                                               |
| `src/data/db/migrations.ts`, 19/42                                               | `ledger_sync_cursors` key `(user_id,journey_id)`; old null-user rows exist. Member pair nullable; no roster authority beyond existing rows.                                                                                                       |
| `ledgerReportingCoordinator.ts`; `accountGeneration.ts`                          | Coalesces by generation/Trip and bootstraps on INVALID_CURSOR; request context not propagated end-to-end. Application-time generation check alone is insufficient.                                                                                |
| `tripPersonRepository.ts`; `backend/src/app.ts:authorizeRead`                    | Exact Account cached actor gate and server admission remain independent of participation.                                                                                                                                                         |

B-T3A semantic revisions and C-I2 Source/material/confirmation revisions remain
separate. Their participant/evidence permissions neither contribute to this hash
nor create a new admission path. No existing runtime PASS is inferred for v2.

## C. Complete snapshot envelope

Existing `GET /v2/trips/:tripId/ledger/bootstrap` keeps its financial fields and
adds exactly this participation envelope:

```json
{
  "participationSnapshot": {
    "contractVersion": 1,
    "complete": true,
    "personCount": 1,
    "fingerprintVersion": 1,
    "fingerprint": "3da17f966a308730772995ddf5936ee934621141927ebf0ccdcb15573b934c04",
    "observedAt": "2026-10-04T00:00:00.000000Z"
  }
}
```

The envelope's six keys are exact, no unknown keys. `personCount` is a safe
nonnegative integer equal to unique `members.length`. Fingerprint is exactly
64 lowercase hex characters. All new observation timestamps use real UTC
`YYYY-MM-DDTHH:mm:ss.ffffffZ`, four-digit year 0001–9999, valid date/time, no leap
second; they are server facts, not device clock ordering. No conversion through
millisecond-only Date may silently change their stored value.

`members` contains the **entire current server set**, including inactive,
unlinked/invite-pending and owner/guest Persons. Each row preserves existing
`id, displayName, role, status, capabilities, updatedAt` and requires
`isParticipating:boolean`, `participationRevision:number` in safe integer range
0..9007199254740991. No lifecycle/status/access filtering. Canonical normalized
UUID IDs are unique. Preserve the existing `members[]` wire ordering for backward
compatibility; do not sort the bootstrap Member array by ID. Fingerprint construction
independently normalizes UUIDs and sorts the participation vector by canonical
Person ID exactly as D specifies. `actor.userId` is mandatory in certified bootstrap and equals authenticated
request Account; actor memberId may be null under existing admission.

Envelope, Members and non-null v2 `cursor` are one response. Cursor Account/Trip
must equal actor/request and `journey.id`; its snapshot contract/fingerprint
versions and hash must equal envelope. `serverTime` retains current general API
meaning; it cannot substitute for `observedAt` or lifecycle revision.

Complete server read: a backend-internal database operation aggregates all Member
rows into **one JSON result from one statement snapshot**, including raw user_id
only for existing actor resolution. No PostgREST row cap on a returned row-array
may certify a truncated roster. Read all Members or fail; no Member pagination
or partial success in contract 1. Resource/body/database limit errors return no
usable certificate; streaming/interrupted bodies fail client validation.

Coherent bootstrap, each attempt:

1. After existing admission, read complete vector V0 and initial financial
   sequence/settings revision through existing boundaries.
2. Read full Member snapshot M and existing bootstrap aggregates.
3. Read complete vector V1 and final financial sequence/settings revision.
4. Require hash(V0) = hash(vector(M)) = hash(V1), and unchanged existing financial
   sequence/settings. Issue cursor at that final financial sequence, with M's hash.
   Envelope `observedAt` is V1's statement observation time. Read state/time in the
   same snapshot operation, not an earlier request-start timestamp.
5. On instability discard the whole attempt and retry, at most three attempts
   total. Exhaustion: HTTP 503 `PARTICIPATION_SNAPSHOT_UNSTABLE`; no usable response
   or cursor. Malformed data: HTTP 500 `PARTICIPATION_SNAPSHOT_INVALID`, no retry as
   ordinary churn. A commit after V1 is found on the next pull.

Reject duplicates, missing/null/partial pairs, unsupported present certificate,
wrong count/hash/scope/actor/cursor, or `complete:false`. A **missing** envelope
entirely is the explicit old-backend branch G; a present invalid envelope is never
silently treated as legacy. Certificate scope covers lifecycle and presence, not
transactional freshness of display/status/role or all other bootstrap entities.

## D. Fingerprint canonical serialization

Fingerprint version = numeric `1`. SHA-256 output is lowercase hex, no prefix.
The following recipe is normative across backend/database/client tests:

1. Normalize valid UUIDs to 36-character lowercase hyphenated strings. Validate
   UUID syntax; reject duplicates **after normalization**. Do not infer UUID version
   or identity from names/user_id. Reject rows of another Trip before serialization.
2. Require a real Boolean and exact safe nonnegative integer revision. For hashing,
   express revision as base-10 ASCII **string**, `0` or a nonzero digit followed by
   digits, no leading zero, sign, exponent, whitespace or decimal fraction.
   SQL bigint-to-decimal is exact; wire number is validated before conversion.
3. Sort ascending by ASCII byte/ordinal comparison of normalized UUID strings,
   not locale/display ordering. Each row is the JSON array `[id,active,revisionString]`.
4. Serialize the outer array as compact JSON: no spaces/newlines, UTF-8 without
   BOM, literal lowercase `true`/`false`; UUID/revision strings in double quotes.
   Only these ASCII values occur, so no alternate escape representation is allowed.
5. Hash bytes: ASCII `otr-trip-participation-v1`, one LF byte `0a`, then that JSON.
   **No trailing LF**. The fixed domain/version prefix is framing, not another
   input field. No Trip/Account/time/name/role/status/access/financial values enter
   the vector. Scope is carried by the cursor, not the fingerprint.

Database JSON aggregate output is a data carrier, not canonical hash bytes:
`jsonb::text` spacing/object ordering must not be hashed directly. Use D's exact
serializer after validation, with matching database/client golden tests if a SQL
hash implementation is chosen. The digest read and complete Member read must
never derive their vectors from capped result pages.

An empty vector hashes the exact 28 bytes `otr-trip-participation-v1\n[]`.
Hash equality is a practical collision assumption; fingerprints are unordered
comparison values. Revision detects ABA, IDs detect new/missing Persons, Boolean
allows same-revision contradictory evidence to be diagnosed.

## E. Golden fingerprint vectors

P1 = `20000000-0000-4000-8000-000000000001`;
P2 = `20000000-0000-4000-8000-000000000002`.
Each JSON body below receives the D prefix/LF. Byte count includes that prefix.

| Case                        | Canonical JSON body                                                                                      | Bytes | Expected SHA-256                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------- | ----: | ------------------------------------------------------------------ |
| Empty                       | `[]`                                                                                                     |    28 | `4a6d75d6a0fe1895b047dd33440dbb6548bd6d2ceb14186782989f9c55b5588d` |
| P1 ACTIVE/0                 | `[["20000000-0000-4000-8000-000000000001",true,"0"]]`                                                    |    77 | `3da17f966a308730772995ddf5936ee934621141927ebf0ccdcb15573b934c04` |
| P1 INACTIVE/1               | `[["20000000-0000-4000-8000-000000000001",false,"1"]]`                                                   |    78 | `5157a50224e70aa1ddc5f14b35d6a3016eb15c39c72af94fe06a955ff47e7c9c` |
| P1 ACTIVE/2 (ABA)           | `[["20000000-0000-4000-8000-000000000001",true,"2"]]`                                                    |    77 | `c1aec134d1ab5774e94e3950322a30a40f0dbc95f177d1f0662e98f0813ad737` |
| P1 ACTIVE/0 + P2 INACTIVE/7 | `[["20000000-0000-4000-8000-000000000001",true,"0"],["20000000-0000-4000-8000-000000000002",false,"7"]]` |   128 | `32e4d4e995a1f9471bd2f36260b1c25023bc656758e7c93c5452a58840009592` |
| P1 INACTIVE/max revision    | `[["20000000-0000-4000-8000-000000000001",false,"9007199254740991"]]`                                    |    93 | `edbd32344002232b7d72e618d160b0b8ffc16845a72706c6aa63ce0b12028edc` |

Participation-vector input P2 then P1 produces the same sorted two-row bytes/hash,
without reordering `members[]` on the wire. Uppercase UUID input normalizes to the
same digest. Duplicate P1 twice, including case variants, is
an error, not deduplication. String Boolean, null/partial pair, fractional/negative/
unsafe revision and duplicate IDs have **no digest**. Same P1/revision with opposite
Boolean has a different hash, but local equal/opposite merge still fails.

These six values were computed independently with local Python `hashlib.sha256`
and Node `crypto.createHash('sha256')`; all agreed. No implementation files were
created. Later tests must assert exact bytes/hash, sorting and rejection, not
merely hash-length or agreement between two calls to the same implementation.

## F. Shared cursor v2

Exact decoded payload, shown with valid representative IDs/hash:

```json
{
  "version": 2,
  "purpose": "LEDGER_SHARED",
  "sequence": 0,
  "tripId": "10000000-0000-4000-8000-000000000001",
  "userId": "30000000-0000-4000-8000-000000000001",
  "snapshotContractVersion": 1,
  "participationFingerprintVersion": 1,
  "participationFingerprint": "3da17f966a308730772995ddf5936ee934621141927ebf0ccdcb15573b934c04"
}
```

Eight exact keys, all required; no extras, duplicate JSON keys or type coercion.
Sequence is JSON number, safe integer 0..9007199254740991, explicitly rejects -0.
Scope IDs canonical UUIDs. Versions are numeric literals as shown. Fingerprint is
D's lowercase hex. No persisted Trip revision, timestamp, ID list or private data.
Hash binds the exact certified vector; contract version/purpose separate protocols.

Encode compact UTF-8 JSON in the displayed key order, no whitespace/BOM/trailing
newline; base64url alphabet A–Z/a–z/0–9/-/_, **no padding**. Decoder bounds token to
1,024 ASCII characters, requires strict canonical unpadded base64url, valid UTF-8,
exact object/schema, then requires canonical re-encoding byte-for-byte equal to
the input token. This rejects alternate JSON numeric/escape/key encodings and
unknown/duplicate keys. Noncanonical malformed tokens are not normalized silently.

Authenticate and authorize Trip first, then validate cursor scope/sequence and
compare fingerprint. Malformed token, wrong Account/Trip/purpose/version, sequence
beyond current latest shared feed, missing token, legacy v1, or fingerprint
mismatch returns HTTP 400 `INVALID_CURSOR`; diagnostic details must not expose
roster/private data. Admission/auth errors remain their existing errors, not
INVALID_CURSOR. Token is unsigned opaque **observation metadata**, not authority;
server still authorizes every request and client checks certificate binding.

Certified empty roster or zero-financial-sequence bootstrap issues a real v2 token
with sequence 0 and the applicable hash; never null. No-change pull returns the
same token bytes. Continuation advances only shared financial sequence, retaining
all other payload values; it never stamps a freshly read different fingerprint.
Keep current financial event ordering/filtering/hasMore semantics unchanged.

## G. Legacy cursor compatibility

Add shared-specific v2 helpers; retain existing v1 private-payment helpers and all
private stream scopes/checkpoints. Do not bump `ledgerCursorVersion` globally.
A private endpoint rejects v2 by its existing v1 version validation.

A syntactically/scope-valid legacy v1 token sent to shared pull always receives
INVALID_CURSOR → one certified bootstrap. **Never use its sequence** for shared
continuation. Existing shared/private v1 payloads have identical structure and
cannot prove origin; bootstrapping without trusting either sequence makes this
ambiguity safe. Wrong-scope v1 also fails; no unknown Member entity reaches old
client unions. Old clients can store opaque new v2 tokens and ignore additive
certificate metadata; no claim that their UI understands fresh lifecycle state.

Old backend bootstrap with no `participationSnapshot` is accepted under I2A:
valid paired observations merge monotonically, absent pairs preserve known/null;
no new completeness/presence/verification proof. Its null/v1 financial cursor can
be saved in the **legacy branch** atomically, without issuing a participation
certificate. Preserve any previous certificate as historical evidence but its
binding no longer matches the active cursor; derive unverified/unsupported state.
A present invalid/unsupported snapshot is an error, not old-backend omission.

On old backend rejecting v2, allow one legacy bootstrap fallback in that refresh
cycle; no repeated forced I2B bootstrap on every page. Subsequent eligible refresh
can retry backend support; no cursor-format auto-upgrade or pair reset. If a new
backend is reached with a v1 token, its one controlled bootstrap establishes v2.

## H. Local completeness certificate

Exact conceptual record: extend existing `ledger_sync_cursors` record keyed by
non-null active `(user_id, journey_id)`; null-user legacy rows never provide
certification. Keep `ledger_members` as the only cached Person projection.
Future additive columns below are a schema contract, **not migration SQL**:

| Field                                     | SQLite value / invariant                                                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `participation_snapshot_contract_version` | INTEGER, nullable; observed certificate exactly 1.                                                                                                            |
| `participation_fingerprint_version`       | INTEGER, nullable; exactly 1.                                                                                                                                 |
| `participation_fingerprint`               | TEXT, nullable; exact lowercase SHA-256.                                                                                                                      |
| `participation_person_ids_json`           | TEXT, nullable; compact JSON array of canonical UUID strings, strictly ascending, unique, exact complete returned set; `[]` valid. No state/name duplication. |
| `participation_observed_at`               | TEXT, nullable; snapshot C observedAt, unchanged by delta checks.                                                                                             |
| `participation_verified_at`               | TEXT, nullable; most recent successfully committed server check, initial snapshot observedAt; J specifies pull updates.                                       |
| `participation_bound_cursor`              | TEXT, nullable; exact last verified v2 cursor bytes.                                                                                                          |

All seven fields NULL (never certified) or all non-NULL and valid; no partial
certificate. Count derives from ID array; no separate local count. Bound cursor
must decode to record scope and certificate versions/hash. A currently verified
record additionally requires active `cursor = participation_bound_cursor` and
recomputed hash over **recorded IDs** and current cached pairs to equal the stored
hash, with each recorded row present in the same Trip and non-null pair. Extra
retained historical rows are excluded. Failure marks derived verification invalid;
it does not delete certificate/rows or manufacture business state.

The local timestamp/current connectivity does not certify reality now. No per-row
freshness timestamps, copied Account capabilities or persisted request generation.
Updating shared cached pairs can invalidate another Account's derived certificate;
do not copy that Account's cursor or last verified time. Freshness reads must
validate dependencies on cache changes rather than trust a stale in-memory flag.

## I. Atomic application

Serialize each Account/Trip shared refresh/revalidation, including continuation
and fallback, through one generation-scoped existing coordinator boundary. Do not
let overlapping same-scope snapshots commit out of order. Other admitted Accounts
may share cached rows; final digest checks occur within the SQLite transaction.

Certified bootstrap application:

1. Verify K request context, exact response scope/actor and C/D/F envelope/token
   consistency before transaction. Capture no new Account identity from response.
2. Inside the existing `withTransactionAsync`, check context again; hydrate Journey,
   validate each exact Trip Member ID and pair, monotonic merge, then existing
   bootstrap aggregates using their current conflict/private isolation rules.
3. If incoming revision is below a known local revision, retain the newer cached
   pair by rolling back this certified attempt and request a fresh snapshot.
   Equal/same is allowed; equal/opposite rejects all. Legacy branch preserves I2A's
   separate valid old-metadata behavior. No contradictory cursor advancement.
4. Recompute fingerprint from the received complete ID set and resulting cached
   pairs. Require equality with envelope/token. Do not hash all retained rows.
5. Hydrate Account actor context under existing admission semantics; write all
   certificate fields and active shared cursor/server time in the **same** transaction.
   Missing IDs only update set membership, never delete Member rows/references.
6. Immediately before commit check K identity/generation again under K's
   Account-transition serialization boundary. On any validation,
   DB/write/checkpoint/account failure roll back the entire attempt. Publish cache
   invalidation/success only after commit. No nested separately committed certificate.

`saveCursor` must become a preserving update/upsert for this record; a legacy
REPLACE cannot erase extended metadata. Certified pull pages J commit financial
rows, verified cursor and verification time together with the existing certificate;
bootstrap is the only path that installs/replaces its complete ID set.

## J. Incremental refresh

Every authorized shared pull, including empty/final/continuation page:

1. Decode shared token and scope; require sequence <= latest shared sequence and
   existing currency-barrier checks. Read complete current participation vector
   in one statement snapshot, compute hash and its observation time T.
2. Compare version/hash to the input token. Difference → INVALID_CURSOR before
   delivering/advancing any page. Match permits current financial feed processing.
3. Return unchanged current fields plus exact additive verification object:
   `participationVerification = {contractVersion:1,fingerprintVersion:1,
fingerprint:<input hash>,observedAt:T}`. Four exact keys; same timestamp/hash
   validation as C. Return a non-null v2 cursor retaining its input fingerprint.
   This is a vector comparison, **not** another complete Member snapshot.
4. Client verifies K context, versions/hash/token agreement, and an existing
   same-scope certificate with active cursor equal to request cursor. Recompute
   local recorded-set hash inside transaction. If absent/mismatched, do not apply
   page/checkpoint; request certified bootstrap. Never fabricate a certificate
   from this lightweight verification or advance a page past an unverified set.
5. Atomically apply ordinary financial page and cursor; set bound_cursor to output
   cursor and verified_at=T, leaving snapshot observed_at and ID set unchanged.
   Check generation before commit. No-change page still updates last-check fact.

A lifecycle commit after step 1 does not invalidate the financial page already
read; certificate says verified **at T**, and the next page/pull compares again.
Mid-pagination mismatch bootstraps coherently; committed earlier financial pages
are retained. Do not rewind money, rename the financial sequence or bind a new
hash to an old Member projection. `hasMore:false` is financial-page completion,
not perpetual lifecycle freshness. An old-backend response without verification
can only use G's finite legacy branch and cannot update verified_at.

## K. Account-generation binding

Exact immutable process-local `requestContext = {accountId,tripId,generation}`:

- Capture generation and stable Account ID before credentials/network; recheck
  generation/active ID after any asynchronous session read. Bind request credentials
  to that Account; authenticated-client retry/refresh cannot silently switch it.
- Before each initial request, continuation, recovery bootstrap and credentials
  retry, verify same active Account/generation. New Account requires a new cycle.
- Immediately after response parsing and before repository application, check
  context; certified bootstrap actor.userId and v2 token must equal that Account/
  Trip. Delta token must equal the same scope. Do not obtain application Account
  anew and substitute B for a response requested by A.
- Check at transaction start and immediately before commit, including after all
  asynchronous hydration work. Changed generation or identity throws and rolls
  back. Generation change A→B→A rejects old A even if IDs now match.
- The SQLite application/commit window must be serialized with Account transition
  generation/session changes. Use one narrow Account-transition gate shared with
  switch coordination: acquire before the transaction, recheck context, commit or
  roll back, then release. A switch acquires the same gate before advancing
  generation/changing active session; new applications are not admitted while
  switching. Do not hold this gate during network requests. This is an implementation
  requirement because an asynchronous COMMIT can otherwise race a generation
  change after the final JavaScript check. Current `begin()` advances generation
  before pause; future integration must establish this commit fence, not claim the
  existing callback check already proves it. No generic lifecycle lock framework.
- Cancellation/coalescing are optimizations, not proofs. A stale response is
  discarded, never reused for B's shared Trip or B's actor/certificate/cursor.

B needs its own cached actor admission or successful own server bootstrap. Shared
rows alone grant nothing. Existing cached valid-session offline read policy stays;
server denial is not an empty successful snapshot and not automatic global logout.

## L. Offline/freshness semantics

Keep business `participation:{isParticipating,revision}|null` unchanged. Null is
never observed, not known-but-stale. Offline/expired-token cached false/r or true/r
remains readable; elapsed time/network loss does not clear or default it.

Freshness view is separate Account/Trip metadata: last full `observed_at`, last
`verified_at`, certificate/binding validity, and transient connection/check/error
outcome. Last verified time is the stored server observation of a successful
committed check, not local receipt time or generic serverTime. Clock changes do
not order snapshots/revisions. Preserve it on failure/offline; never label stale
known participation as fresh merely because a financial request succeeded.

Reconnect/auth recovery/Trip entry/foreground eligible refresh rechecks v2 and
bootstraps on mismatch; reuse central scoped scheduling, no new polling timer.
Restart may show historical verification time but is unverified now until a new
check. Long offline periods need no forced login/deletion. Continuously idle or
permanently denied clients have no instantaneous convergence guarantee.

## M. Omission/deletion semantics

| Input/outcome                               | Exact meaning and action                                                                                                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Present inactive                            | Preserve complete identity/history; no financial invalidity/access change.                                                                                                             |
| Missing from a valid complete snapshot      | Remove ID from that Account certificate set only; retain local Person/pair and financial references. Fact is “not present at observation,” not known cause or soft-deletion lifecycle. |
| Partial page/delta omission                 | No roster absence inference, no complete-set rewrite. Contract 1 Member pages are not accepted snapshots.                                                                              |
| Legacy no pair/no certificate               | Preserve prior observation; null remains null. No roster completeness or renewed verification.                                                                                         |
| Explicit server access loss                 | Apply existing scoped admission policy; no empty roster/certificate, no reinterpretation as inactive.                                                                                  |
| Local historical Person no longer on server | Complete local list still resolves ID; excluded from current certified server set, never resurrected remotely or garbage-collected by I2B.                                             |

`listTripPersons()` remains complete admitted **local retained** reads. Future
candidate selection is a separate approved slice; no filtering implementation
here. No UUID reuse after deletion in future lifecycle flows; arbitrary privileged
reset/recreate is outside the guarantee. Absence gives no deletion timestamp,
actor or tombstone. Source associations/plan participant sets remain unchanged.

## N. Failure/recovery

| Case                                                      | Required behavior                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicate Person IDs                                      | Reject snapshot after UUID normalization; no digest/certificate/checkpoint.                                                                                                                                                                                                               |
| Partial/null/bad pair                                     | Reject entire response/application; preserve old state.                                                                                                                                                                                                                                   |
| Lower revision                                            | Preserve newer cached pair; certified attempt rolls back and rechecks, no stale verification.                                                                                                                                                                                             |
| Equal/opposite                                            | Invalid evidence, rollback and diagnose; no LWW/revision manufacture.                                                                                                                                                                                                                     |
| Member set changes during bootstrap                       | C V0/M/V1 mismatch; discard and retry <=3 attempts, then 503.                                                                                                                                                                                                                             |
| Fingerprint changes during financial pagination           | INVALID_CURSOR at next check, one scoped bootstrap; prior committed financial pages stay.                                                                                                                                                                                                 |
| App killed/local transaction/cursor save fails            | All rows/certificate/checkpoint roll back unless entire commit succeeded. Restart from last durable checkpoint.                                                                                                                                                                           |
| Legacy v1                                                 | G controlled bootstrap, do not trust ambiguous stream sequence.                                                                                                                                                                                                                           |
| Old backend no certificate                                | G compatibility mode, no false support downgrade/pair reset or retry loop.                                                                                                                                                                                                                |
| Account switch during request                             | K discard/rollback; generation catches A→B→A.                                                                                                                                                                                                                                             |
| Repeated INVALID_CURSOR churn                             | At most **one recovery bootstrap per shared refresh cycle**; bootstrap has its own three attempts. If another invalidation occurs after recovery, stop that cycle and use existing retry/backoff on a later eligible wake, keeping cached reads. No recursive refresh loop or new worker. |
| Valid cursor but missing/stale local certificate          | Do not advance a certified page; one scoped bootstrap, not signature trust.                                                                                                                                                                                                               |
| Missing/truncated body or unsupported present certificate | Fail closed; never apply partial Member set or infer old backend.                                                                                                                                                                                                                         |

## O. Future I2C interface

Future admitted success/replay result must supply exact `tripId`, `personId`,
`isParticipating:boolean`, `participationRevision:number` (bounded), with correlation
to the requesting Account/generation and command identity under I2C's own protocol.
These are read-side requirements, not a new command/receipt schema. Desired state,
observed revision, CAS and idempotent outcome remain I2C-owned.

Merge valid resulting pair monotonically; never replay an old result over a newer
cached revision. Same revision/opposite is invalid. The single-row result is not
complete-set proof: it may invalidate the local certificate hash but cannot renew
it. Schedule one own-scope shared check; mismatch then bootstraps. A lost result/
refresh is recovered by future same-key I2C replay and/or next successful shared
fingerprint check. Conflict/no-op cannot invent local revision+1. No state edit,
receipt table, audit, lifecycle queue or optimistic selection policy is added.

## P. Financial non-interference

Participation hash/version/set/time never enters Expense payer/participants/splits,
financial Member validation, Settlement/Adjustment history/inputs/source digests,
Review eligibility/fingerprints, FX snapshots or Personal Payment identities/grants.
Private cursor remains v1 and private. Existing financial feed pages retain their
own delivery sequence and semantic rules; a lifecycle mismatch only invokes
existing bootstrap recovery. Historical inactive/absent retained Person IDs remain
resolvable. No destructive snapshot cleanup.

Track B parent/endpoint semantic revisions and authored whole-group sets are not
changed by roster freshness. Track C Source/material hashes, privacy and confirmation
receipts are separate; this digest grants no evidence access and changes no output.
Future implementation must prove before/after financial safety and relevant
regression tests; this design-only task does not claim new runtime regression PASS.

## Q. Implementation slicing

| Later slice        | Exact deliverable / required evidence                                                                                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server foundation  | Complete statement-snapshot Member read, D vectors, C coherent bootstrap, F shared-only v2 codec, J comparison/verification, G compatibility. Over-cap/empty/ABA/new/deleted/concurrent set tests; canonical-token rejection; private v1 unchanged. Any read-function migration requires separate implementation authorization. |
| Local projection   | H additive certificate fields and preserving scoped upsert, I atomic certified application, K context across network/retries, legacy branch. Transaction failure/kill/cursor-save and A→B→A/shared-cache-newer-pair tests; retained missing financial IDs. No Person table.                                                     |
| Refresh/acceptance | Scoped central scheduling and bounded recovery, J continuation/local-certificate check and L freshness read metadata. Empty-queue reconnect, two-device offline/restart, old backend rollout, repeated churn and financial/non-interference validation. No I2C enablement to obtain fixtures.                                   |

No strategy reconsideration or additional Trip-level counter/feed was necessary.
Golden serialization and protocol fields are fixed here; performance limits and
exact privileged read-function SQL/grants are later implementation/review artifacts,
not permission to weaken completeness. Response too large must fail, never truncate.

## R. Acceptance matrix

| Requirement                           | Evidence                                                                        | Result |
| ------------------------------------- | ------------------------------------------------------------------------------- | ------ |
| Complete snapshot exact response      | C: complete envelope/pair/scope/time/cursor; Member wire order preserved        | PASS   |
| Canonical fingerprint serialization   | D: exact normalization/order/UTF-8/LF/JSON/revision/SHA-256                     | PASS   |
| Golden digests                        | E: six independently computed byte-count/hash vectors and invalid cases         | PASS   |
| Shared v2 exact encoding/validation   | F: eight keys, canonical base64url, zero sequence, failure rules                | PASS   |
| Legacy/private compatibility          | G: v1 controlled bootstrap, private helper unchanged, finite old-backend branch | PASS   |
| Scoped local certificate              | H: exact seven fields in existing Account/Trip metadata, ID-set representation  | PASS   |
| Atomic certified application          | I: rows/actor/certificate/cursor one transaction, monotonic rules               | PASS   |
| Incremental/pagination behavior       | J/N: every pull check, unchanged binding, atomic verified page                  | PASS   |
| Request generation including A→B→A    | K: capture, pre-request, post-response, transaction/commit checks               | PASS   |
| Offline state versus verification     | L: last verified time, null versus stale, reconnect                             | PASS   |
| Omission/deletion/access distinctions | M: retained Person, complete versus partial, legacy and access loss             | PASS   |
| Future I2C read-side requirements     | O: exact resulting pair/scope, refresh/replay separation                        | PASS   |
| All specified failures resolved       | N: bounded churn and fail-closed completeness                                   | PASS   |
| Financial and cross-track boundaries  | P: existing financial/private/temporal/Source semantics preserved               | PASS   |
| One-file design-only scope            | Git scope; no migration/code/config/network changes                             | PASS   |

**15 PASS / 0 PENDING / 0 BLOCKED** for contract coverage. Human and independent
review: **PENDING**. No implementation/device/deployment acceptance asserted.
Validation: clean expected startup Git gate, scoped source inspection, independent
Python/Node golden computation, document Prettier and whitespace checks. No
runtime suite/database execution was needed or performed; no commit.

Production accessed: **NO**. Hosted Dev accessed/mutated: **NO**.
Deployment performed: **NO**. Migration/application implementation: **NO**.
Lifecycle command/receipt/audit: **NO**.

**STOP — A1-I2B1 CONTRACT COMPLETE — REVIEW PENDING.**
