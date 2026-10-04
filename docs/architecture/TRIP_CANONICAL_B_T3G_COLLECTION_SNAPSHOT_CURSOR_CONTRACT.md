# B-T3G — Canonical Event Collection Snapshot / Cursor Contract

Status: **B-T3G PARTICIPANT-SCOPE CORRECTION COMPLETE — REVIEW PENDING**.
Date: 2026-10-05 (Pacific/Auckland). Design only; no implementation authorization.
Worktree: `/Users/xoery/Project/otr-mobile-temporal`; branch `trip/temporal`;
clean starting HEAD `4dc70958b9347d45c4decaa85150c85efe8f6b57`.

Only this document is added. MUST below specifies the proposed V1 contract,
not an installed endpoint, counter, certificate, deletion path or refresh hook.
The accepted combined current-state handoff supersedes historical review-pending
labels in B-T3A–F reports. Event command activation remains CLOSED.

## A. Authority and selected design

- [B-T3A](TRIP_CANONICAL_B_T3A_SCHEMA_WRITER_CONTRACT.md): aggregate identity,
  semantic revision, exact facts and optional Place-cache loss.
- [B-T3B](TRIP_CANONICAL_B_T3B_PROTECTED_SERVER_FOUNDATION_REPORT.md) and
  [B-T3C](TRIP_CANONICAL_B_T3C_COMMAND_RECEIPT_CONTRACT.md): protected writer
  boundary; semantic edits, pointers and commands remain distinct.
- [B-T3D](TRIP_CANONICAL_B_T3D_PROTECTED_COMMAND_FOUNDATION_REPORT.md): closed
  foundation and immutable historic receipts; no new gateway authority inferred.
- [B-T3E](TRIP_CANONICAL_B_T3E_BACKEND_READ_INTEGRATION_REPORT.md),
  `src/data/api/tripCanonicalReadContracts.ts`: exact READ_ONLY projection.
- [B-T3F](TRIP_CANONICAL_B_T3F_LOSSLESS_SQLITE_MIRROR_REPORT.md),
  `src/data/repositories/tripCanonicalEventRepository.ts`: accepted mirror and
  equal-revision reconciliation, including only UUID→null Place loss.
- [A1-I2B1](TRIP_CANONICAL_A1_I2B1_SNAPSHOT_CURSOR_CONTRACT.md) and
  [A1-I2B2](TRIP_CANONICAL_A1_I2B2_IMPLEMENTATION_REPORT.md): scoped certificates,
  bounded recovery and Account apply gate. Their financial cursor is not reused.

V1 selects **live snapshot validation on every page**, an independent monotonic
Trip Event collection revision, and a fingerprint of **all B-T3E read facts**.
Pages are buffered outside SQLite. Only a fully validated final certificate can
replace the local complete set. There is no stored server page session, long-lived
database snapshot, incremental change feed, per-Event tombstone or new worker.
The counter is necessary: a content hash alone cannot detect set ABA or order
certified absence against a stale page. It is not an Event semantic revision.

CURRENT legacy `itineraryRepository.ts` owns local `itinerary_items` and the
CREATE_ITINERARY queue; it has no certified canonical collection pull.
`ledgerReportingCoordinator.ts` supplies existing generation-scoped cycle tails;
`ledgerOperationalSync.ts` supplies central lifecycle/completion signals.
`ledgerActiveSync.ts` already contains financial polling: adding this read to every
financial poll is expressly prohibited. No existing legacy refresh is a complete
canonical set, and no financial success renews the Event certificate.

## B. Exact scope and admission

Scope is authenticated Account + exact Trip + purpose
`TRIP_CANONICAL_EVENTS`. Existing Trip read admission is checked for every request,
including retries and final pages. Account is obtained from verified credentials;
neither query nor cursor grants access. Account is not Person/participant identity.

Collection enumeration observes **every canonical Event aggregate in that Trip** at one
database statement observation, regardless of status, date, grouping, event type,
participant scope, supported shape or ordering metadata. No Today/date/status/page
filter may certify this scope. Under current B-T3E policy, Trip admission allows
the entire canonical set; V1 introduces no per-Event visibility filter. A future
policy with filtered Events needs a new reviewed scope/version, not silent omission.

Enumeration is distinct from certification eligibility. V1 certifies only if
**every canonical Event has participant_scope=UNASSIGNED and zero participant
rows**. The current B-T3E read object carries participant_scope but omits the
concrete TripPerson participant set; its full-read fingerprint therefore cannot
certify ASSIGNED/WHOLE_GROUP aggregates. If any canonical Event has ASSIGNED,
WHOLE_GROUP or any participant row (including an unexpected row on UNASSIGNED),
withhold the entire collection with reason UNSUPPORTED_EVENT_CONTRACT. Never skip
the Event, downgrade it, discard its participant rows or certify only the scope enum.
No page or complete=true certificate may be issued for that observation.

Participant-row absence must be proven over all canonical parents in the same
uncapped statement snapshot as enumeration, admission, roots/endpoints and counter,
before hashing/page slicing. It cannot be inferred from the B-T3E DTO, endpoint
rows or an omitted/capped participant relation. Unexpected UNASSIGNED participants
are also an invariant violation; V1 still returns the whole-collection withholding
above, without repairing data or enabling a participant writer.

Participant-aware certification requires a separately reviewed compatibility
upgrade: concrete same-Trip TripPerson IDs (never Account IDs), deterministic
participant-set serialization, WHOLE_GROUP's concrete recorded selected set
(never a dynamic roster), updated B read contract/version, updated collection and
fingerprint versions when wire bytes change, compatible SQLite mirror/application
rules, and Track A freshness/admission requirements. Stale/absent Track A
observations cannot imply ACTIVE; historic inactive Persons remain resolvable.
This amendment does not authorize or enable that adapter.

- `temporal_contract_version IS NULL` is legacy and outside this set. It is not
  adopted, copied or relabelled. An unknown **nonnull** version is canonical for
  completeness checks and prevents certification of the entire collection.
- Supported collection/read/fingerprint/temporal versions are all exactly `1`;
  supported shapes are POINT, CALENDAR, ALL_DAY, SPAN, STAY, TRANSPORT, WINDOW.
- TRANSPORT root plus exactly one ORIGIN and one DESTINATION is one indivisible
  aggregate, selected in the same statement snapshot. No endpoint paging.
- Candidate/provider bodies, Source material/private proofs and financial data
  stay outside the B-T3E allowlist. Opaque accepted provenance is not dereferenced.
- Duplicate normalized IDs, missing endpoints, invalid known-version facts,
  hidden/capped children, or incomplete scope enumeration fail the whole read.

Admission, complete unfiltered canonical enumeration, root/endpoints and counter
must come from **one database statement snapshot** through a fixed internal read
operation. It returns an aggregate result, not a capped PostgREST row list.
Backend validates and hashes that entire result before slicing the page. Separate
count, revision, Event, endpoint and participant-absence queries cannot certify a coherent result.
Current Trip denial is not a successful empty collection. Every page uses fresh
admission; revocation before a later request stops the cycle. A committed change
after the final observation is detected by a later eligible refresh.

The operation uses the authoritative primary in a fresh short READ COMMITTED
transaction, with its statement snapshot established after that request's admission.
No lagging replica, response cache, retained REPEATABLE READ transaction or exported
historic snapshot may certify absence. This also protects the first collection
after a previously successful individual read that has no collection watermark.
The read either observes that committed Event or a subsequent authoritative removal;
it cannot turn replication lag into certified absence.

## C. Server observation identity and mutation coverage

Proposed minimal protected server record `trip_event_collection_state`:

| Field                 | Exact meaning                                                                 |
| --------------------- | ----------------------------------------------------------------------------- |
| `trip_id`             | Trip UUID primary key; one record per Trip, separate from finance/A/C.        |
| `epoch_id`            | Nonnull random UUID, immutable for this counter namespace.                    |
| `collection_revision` | Nonnull integer 1..9007199254740991, initially 1. Never reset/decrease/reuse. |

Snapshot identity is `(tripId, epochId, collectionRevision)`. Wire revision is a
canonical positive decimal **string** within the stated safe range; never an
unbounded bigint coerced through Number. Overflow rejects the affecting write,
not merely the subsequent read. Epochs are incomparable. A changed server epoch
requires separately reviewed reset/recovery; V1 preserves cache and refuses apply.
Backup/restore must preserve this namespace or deliberately change epoch; a restore
that reuses a revision with different state cannot claim V1 continuity.

Within the same transaction as each effective collection change, advance the
counter at least once. Multiple increments are permitted; gaps have no meaning.
Rolled-back changes roll back their increments. Required coverage:

1. Canonical insertion or separately admitted legacy adoption; canonical removal.
2. Any exposed root fact change, including semantic revision/provenance/grouping.
3. Endpoint facts, role/cardinality, creation/removal, aggregate shape transition.
4. Root/ORIGIN/DESTINATION accepted Place UUID→null maintenance, including FK
   SET NULL. It changes collection revision while Event semantic revision and
   location_input_revision remain unchanged.
5. Change of canonical version, including installation of unsupported versions.
6. Participant scope or participant-row changes affecting a canonical parent,
   including eligibility changes and transient row/set ABA. This is counter
   coverage, not authorization for those unsupported writes. Once a separately
   reviewed participant adapter exists, its supported scope/set changes must
   advance collection revision and invalidate older pagination cursors.

Candidate-only/operational timestamp changes outside B-T3E do not require an
increment. Exact no-op/replay needs none. Legacy-only changes need none. A
transaction that changes and restores the exposed set still advances the counter:
presence ABA cannot regain an earlier cursor. Per-Event semantic ABA likewise
retains its advancing semantic revision. No timestamp determines order.

This requires a later additive foundation with trusted, non-bypassable maintenance
covering all protected writers and allowed FK/cascade paths. Missing counter or
unproven coverage disables collection certification. Installation must initialize
existing Trips coherently without mutating Event facts. Trigger/lock integration
must retain B-T3B/D guards and prove concurrent writers, Place deletion, multi-Event
transactions and rollback; deadlocks abort rather than mint false certificates.
No locks span network I/O or page requests. Runtime roles cannot set/reset the
counter or epoch; no semantic grants or enabled delete commands are added here.

Trip deletion or loss of Trip admission yields READ_UNAVAILABLE, not an empty
snapshot; even if the server state record disappears, local fences are preserved.
Trip/Event UUID reuse is unsupported. Reappearance of an existing Event after
visibility changes is admitted only by a newer complete certified set, never by
an old single-Event response.

## D. Endpoint and exact envelopes

Proposed route: `GET /v2/trips/:tripId/canonical-events/snapshot`.
Dispatch this literal route before the individual `:eventId` route. Only GET;
all other methods retain canonical-write-disabled behavior. Require both headers:
`X-OTR-Canonical-Event-Collection-Version: 1` and
`X-OTR-Canonical-Event-Read-Version: 1`.
Query is absent on first page, or exactly `cursor=<token>` on continuation.
No caller-specified page size, offset, Actor, filters or order. Reject extras and
duplicate query keys. Responses/errors use no-store and existing redacted logging.

Exact successful object (all listed keys required, no extras):

```text
{
  collectionContractVersion: 1,
  readVersion: 1,
  temporalContractVersion: 1,
  fingerprintVersion: 1,
  disposition: "SNAPSHOT_PAGE",
  accountId: <authenticated canonical UUID>,
  tripId: <route canonical UUID>,
  snapshot: {epochId: <canonical UUID>, collectionRevision: <positive decimal string>},
  eventCount: <safe nonnegative integer>,
  fingerprint: <64 lowercase hexadecimal characters>,
  ordering: "EVENT_ID_ASC",
  startOrdinal: <safe nonnegative integer>,
  endOrdinal: <safe nonnegative integer>,
  events: <array of complete B-T3E READ_ONLY objects>,
  nextCursor: <token or null>,
  complete: <Boolean>
}
```

Ordinal interval is half-open. `endOrdinal = startOrdinal + events.length`.
Each Event belongs to tripId. All successful entries have readVersion 1,
disposition READ_ONLY and legacyCompatible false; per-entry WITHHELD is forbidden.
eventCount/fingerprint/snapshot/scope/versions/order are constant across an attempt.
`complete` is true **only** if endOrdinal=eventCount and nextCursor=null. It is a
final-page certificate, usable only with every prior page from ordinal zero and
successful local count/hash validation; it does not make an isolated last page a
complete local set. Nonfinal pages have complete=false and a required continuation.
No observation timestamp is included: identity/revision orders observations, and
this contract makes no wall-clock freshness promise.

Fixed page size is 100 aggregates, except the last page. Empty collection returns
one page with events=[], count/start/end=0, complete=true and nextCursor=null.
V1 bounds: at most 10,000 aggregates/100 pages, 64 MiB canonical complete Event
read bytes, and 4 MiB actual UTF-8 response body per page. All bounds are checked
without silently dropping rows/fields. A single oversized page fails; there is no
adaptive truncation. Raising bounds needs review, not a larger client query.

Exact HTTP 200 withholding object:

```text
{collectionContractVersion:1, disposition:"WITHHELD", reason:<enum>}
```

Reasons: UNSUPPORTED_CLIENT, UNSUPPORTED_EVENT_CONTRACT,
COLLECTION_CERTIFICATION_UNAVAILABLE. No Events, empty-set claim, fingerprint,
scope certificate or continuation accompanies withholding. Invalid known data is
HTTP 500 CANONICAL_EVENT_SNAPSHOT_INVALID; capacity overflow is HTTP 503
CANONICAL_EVENT_SNAPSHOT_LIMIT. Unsupported future nonnull Event versions withhold
the entire collection, even if only one Event is affected or on a later page.
Missing route remains the existing route-not-found response; admission failures
retain existing safe READ_UNAVAILABLE/auth behavior, without a collection body.
ASSIGNED, WHOLE_GROUP or any canonical participant row likewise returns
WITHHELD/UNSUPPORTED_EVENT_CONTRACT for the entire collection, even if the affected
Event would fall on a later page. This does not change B-T3E individual-read DTOs.

## E. Fingerprint bytes, ordering and Place convergence

Fingerprint version 1 covers **full normalized B-T3E READ_ONLY bytes**, not a
semantic subset with Place IDs excluded. All root/endpoint facts, semantic revision,
shape, strings, opaque maps and read/compatibility markers participate.
The participant set is absent from those bytes: B's UNASSIGNED/zero-row eligibility
proof is mandatory before this hash can certify a complete V1 aggregate.

Normative serialization:

1. Validate strict B-T3E schemas and scope. Collection UUID fields use canonical
   lowercase hyphenated wire spelling; reject alternate spellings/duplicate IDs.
   Preserve all non-UUID authored strings, whitespace, Unicode, temporal precision,
   offsets, nulls and map values. No Date conversion or Unicode normalization.
2. For each read object, sort endpoint array by role's ASCII order
   **DESTINATION then ORIGIN**. Preserve any other array order.
3. Recursively sort object keys by UTF-16 code-unit lexicographic order (ECMAScript
   default string sort); serialize compact ECMAScript JSON.stringify output to
   UTF-8, without BOM or trailing newline. All numbers are validated finite
   binary64 values; integer fields meet B-T3E safe bounds. JSON.stringify's shortest
   round-trip number encoding applies, including numeric -0 as 0. This matches
   B-T3F equality, not arbitrary numeric token spelling or PostgreSQL jsonb::text.
   Reject invalid Unicode scalar strings rather than losing them on UTF-8 encoding.
4. Event leaf hash is SHA-256 of ASCII `otr-trip-canonical-event-read-v1`, one LF
   byte, then those complete read JSON bytes. Hex is lowercase, 64 characters.
5. Sort unique Event IDs ascending by ASCII UUID bytes, independent of order_index,
   title/date/device timezone. Build manifest `[[eventId,leafHash],...]`.
6. Collection hash is SHA-256 of ASCII
   `otr-trip-canonical-event-collection-v1`, one LF, then compact JSON array
   `[1,1,1,tripId,manifest]`, with no trailing LF. The three integers are collection,
   read and temporal versions. Version of this recipe is fingerprintVersion=1.

Snapshot revision/epoch, Account, cursors, pagination and timestamps do not enter
the content hash. They have separate scope/order bindings. Same content at a newer
collection revision may have the same hash; it is still a newer observation.
Each page is the contiguous ordinal slice of that sorted manifest. Pagination
order is transport order, not product UI chronology.

Accepted Place cache loss changes the leaf/full hash and advances the collection
revision, so an old continuation returns INVALID_EVENT_COLLECTION_CURSOR. Fresh
collection application uses B-T3F's equal-semantic-revision UUID→null exception
for root/ORIGIN/DESTINATION only. It updates only those pointers and installs the
new collection certificate atomically; it does not increment Event revision,
location_input_revision, observation_sequence or observed_generation for a neutral
loss. Null→UUID, UUID_A→UUID_B or any semantic/read co-change at the same Event
revision still fails closed. No broad ignore-Place-ID comparison is introduced.

The reverse race matters: local already-null pointer versus older snapshot UUID
cannot restore it. Reject that certified attempt even if it otherwise validates;
bounded recovery obtains a later null snapshot. A higher Event semantic revision
can contain a newly accepted pointer normally. Finite server churn plus a later
successful eligible complete refresh provides convergence; no timer is needed.

### Exact golden fingerprint fixtures

T=`20000000-0000-4000-8000-000000000001`,
E=`30000000-0000-4000-8000-000000000001`,
P=`50000000-0000-4000-8000-000000000001`.
POINT fixture: every B-T3E fact initially null, except id=E, trip_id=T,
temporal_contract_version=1, temporal_shape=POINT, semantic_revision=1,
title=Canonical, event_type=activity, status=planned, order_index=0,
participant_scope=UNASSIGNED, is_estimated_time=false, location_input_revision=1,
start_quality=UNKNOWN, start_basis=DERIVED_CIVIL, start_civil_resolution=PENDING,
start_provenance_refs={}, itinerary_transport_endpoints=[]. Read wrapper is exactly
readVersion=1/disposition=READ_ONLY/legacyCompatible=false.

Pointer fixture adds accepted_address=Station, accepted_place_id=P and
spatial_provenance_refs={accepted_address:"otr-event/confirmation/address"}.
Loss fixture changes only accepted_place_id to null. TRANSPORT fixture starts from
POINT, changes shape to TRANSPORT, nulls start_quality/start_basis/
start_civil_resolution/start_provenance_refs/location_input_revision, and adds both
endpoints. Each endpoint has every field null except event_id=E, its role,
quality=UNKNOWN, basis=DERIVED_CIVIL, civil_resolution=PENDING, provenance_refs={},
location_input_revision=1. Root event_type stays activity, as B-T3E permits.

| Fixture                   | Leaf bytes including prefix/LF | Leaf SHA-256                                                       | Collection SHA-256                                                 |
| ------------------------- | -----------------------------: | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Empty                     |                              — | —                                                                  | `2de0e2f1c8e62730cbe6c2a9fad7fe95962d0549b25e83b36bc1f8079cd6cbb2` |
| POINT                     |                           2140 | `146f954a8f869d78d246f30284cb77bef4e669eafdb955839e8091c8e1e95e68` | `c309fd3f17c8722fdb92805c3f8be2fd883f8f69c4a7783ee520b2ae4ed420a7` |
| Pointer                   |                           2228 | `09b5daee7b9fe27dca6afc6fed9d832050f0647cde8ace1a58f5218d063e5d2c` | `2ef7b999cae0fbae1fd2b027d081cc3dcb1a99aca838d7c7bc1a5086483f82e6` |
| Loss, same Event revision |                           2194 | `92be2fa0d01bb4eba4335d3bca9db248f263c7d1d2e373b1b1958490f621ff53` | `c48e08190a25614721677542c64a742b863ced01fbfb069e52b8127336e4f972` |
| TRANSPORT                 |                           4212 | `e2994781763cf82f41c45a6ec58a28a9c69579ff7d98d8db1cdc3af4ff4f852b` | `05ff9d868a7822415e280936bc0124b01846dfc0c44fd205dd3716e21b67a561` |

Empty collection framed bytes are exactly 88 bytes, ending in
`[1,1,1,"20000000-0000-4000-8000-000000000001",[]]`.
Each single-Event collection is 195 bytes; its manifest is exactly
`[["30000000-0000-4000-8000-000000000001","<leaf hash above>"]]`.
Node crypto and independent Python hashlib computation verify these byte counts
and hashes. Future codec acceptance must additionally pin binary64 coordinate,
control-character/Unicode, map reorder and endpoint reorder byte vectors; comparing
two calls to the same serializer is insufficient.

## F. Cursor identity and page recovery

Exact decoded token, in normative encoding key order:

```text
{
  version:1,
  purpose:"TRIP_CANONICAL_EVENTS",
  accountId:<canonical UUID>,
  tripId:<canonical UUID>,
  collectionContractVersion:1,
  readVersion:1,
  temporalContractVersion:1,
  fingerprintVersion:1,
  snapshotEpochId:<canonical UUID>,
  snapshotRevision:<positive decimal string>,
  fingerprint:<64 lowercase hex>,
  eventCount:<safe integer 0..10000>,
  nextOrdinal:<positive safe integer>,
  ordering:"EVENT_ID_ASC"
}
```

Encode compact UTF-8 JSON in that exact key order, no whitespace/BOM/trailing LF;
canonical unpadded base64url. Maximum token length 2048 ASCII characters. Reject
duplicate/extra keys, alternate encoding, bad UTF-8, coercion, noncanonical numeric
tokens including -0, future versions, and anything whose canonical re-encoding
does not equal the input. nextOrdinal is divisible by 100 and <eventCount;
terminal/empty pages never issue a cursor. Tokens are unsigned observation metadata,
not permission or proof of completeness; server/client validate every binding.

Server authenticates/read-admits, then obtains B's complete single-statement read.
Require live epoch/revision/count/hash to match token before returning any page.
Mismatch/malformed/scope mismatch returns HTTP 400
INVALID_EVENT_COLLECTION_CURSOR, without Events or replacement cursor. An equal
epoch/revision with a different live hash is an integrity failure (HTTP 500
CANONICAL_EVENT_SNAPSHOT_INVALID), not normal churn or permission to silently reset.
Unsupported Events use D withholding instead of skipping them. Continuations are
stateless: a retry returns identical content for the same revision, or invalidation
if a newer change committed. No held snapshot/locks remain after response creation.

Client requires initial startOrdinal=0, strict ascending IDs globally with no
duplicates, and each next startOrdinal=prior endOrdinal. It binds the exact returned
cursor to the next request and checks decoded metadata against the attempt.
No mixing of pages from different Account/Trip/epoch/revision/hash/count/version.
Count and recomputed full hash must match at the final page, including empty set.
A valid final certificate observed before a later server commit remains historical
truth; it cannot claim the server did not subsequently change.

One eligible owner cycle allows at most **two complete attempts**: initial and one
recovery from ordinal zero for invalid/stale cursor or superseded local evidence.
Each attempt makes at most 100 page requests, with at most one immediate replay
of a lost/transient page response. Maximum 400 collection requests per cycle;
there is no recursive refresh/rebootstrap. Second invalidation, capacity failure,
integrity failure, invalid body or repeated network failure stops. No immediate
retry for contradictions/unsupported versions. Later eligible wake may try again
under existing auth/backoff policy; no canonical timer/queue operation is created.

Final-page response loss replays its exact input cursor (or initial request for a
one-page attempt). If mutation invalidates it, discard the entire buffer and use
the one recovery. Restart discards all incomplete buffers and begins at zero;
no durable page cursor or resumable partial certificate is needed in V1.

## G. Local durable certificate and reconciliation

Proposed dedicated `trip_canonical_event_collections` record, not a financial
cursor or extension of A's participation metadata. Exact minimal fields:

| Field                   | SQLite contract                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `account_id`, `trip_id` | Nonnull canonical UUID TEXT, composite primary key.                                                |
| `contract_version`      | INTEGER exactly 1; fixes read/temporal/fingerprint versions and ordering.                          |
| `snapshot_epoch_id`     | Canonical UUID TEXT, same epoch as the admitted server certificate.                                |
| `snapshot_revision`     | Canonical positive decimal TEXT within C's bound; compare exact integers, never lexicographically. |
| `fingerprint`           | 64 lowercase hex TEXT.                                                                             |
| `event_ids_json`        | Compact strictly ascending unique canonical UUID array TEXT; [] valid.                             |

Seven columns total. Row absent means never certified; no partial-null record.
No extra count (derive ID array length), timer, persisted generation, page cursor,
status, observation timestamp, copied payload or per-Event tombstone. A newer local
contract/corrupt certificate is non-destructive and blocks replacement, not a legacy
fallback. Preserve the record across restart, Account switch, network/auth failure
and unsupported responses: it is also the durable anti-resurrection fence.

All collection and individual refresh/application for a scope share the existing
owner cycle serialization. At collection-attempt start drain earlier individual
reads, then capture the exact scoped local root/endpoint baseline inside a short
read transaction. The baseline stays in memory. Before final apply compare the
same scoped rows/certificate again: any intervening change supersedes the attempt
and requires bounded fresh recovery. This prevents an unstamped B-T3E individual
read from racing a buffered collection's absence. Cancellation is not the proof.

Final application, one Account-gated SQLite transaction:

1. Retain request `{accountId,tripId,generation}` captured before credentials/I/O.
   Check after every asynchronous credential/response step and at transaction
   entry. Validate full buffer, final certificate, resource limits and baseline.
2. Compare durable certificate. Older revision in the same epoch: discard without
   writes. Same revision/different fingerprint or ID set: integrity error. Changed
   epoch: preserve state and require separately reviewed namespace recovery.
3. Reconcile every included Event using B-T3F rules. Higher semantic revision
   applies; equal/identical is neutral; equal UUID→null-only loss is permitted;
   every other equal difference rejects the **whole** certificate. If incoming
   revision is lower than any cached Event, abort rather than ignoring it and
   certifying a hash the resulting mirror cannot match. Unknown local read/temporal
   versions also block replacement/removal; no future cached row is downgraded.
4. Apply H's scoped membership removal, then recompute hash over the exact complete
   included IDs and resulting mirrors. Require advertised fingerprint. TRANSPORT
   root/endpoints remain atomic; no incremental page commits or nested applyRead
   calls with independent transactions/gates.
5. Persist all seven certificate fields with the mirrors/removal in that transaction.
   Check Account identity/generation again immediately before commit. The existing
   apply gate spans transaction commit/rollback and serializes Account transitions;
   hold no gate during network. Publish invalidations only after commit.

Same revision/hash/set can renew historical proof only if current mirror hash
matches; it cannot roll back a newer individual observation. Known facts remain
available offline with no network/auth refresh requirement. Certificate validity
is derived by recomputing the hash for its ID set against current mirrors; a later
individual update may make that historical certificate stale without erasing its
revision/membership fence. No age-based claim of current server truth is made.

Trip selection uses the captured Trip, never the current selected Trip substituted
into a response. The owner maintains a process-local selection lease; switching
Trip invalidates that active selection cycle, including T→U→T. An explicit refresh
of an independently addressed Trip may finish only in its captured scope. Account
A→B→A always fails the retained generation checks; same Event UUID in two Accounts
remains separate. Offline reads retain the existing scoped context rechecks.

## H. Absence, removal and individual-read fencing

V1 server semantics explicitly certify **current canonical read-mirror membership**,
not a business deletion cause, Actor, timestamp or deletion receipt. Certified
complete absence authorizes removal of reconstructible B-T3F mirror rows for that
Account/Trip only. Delete scoped endpoints then scoped root in G's transaction;
persist the new complete ID set/revision even if it is empty. No Source, file,
financial reference, receipt, Person, legacy itinerary or durable intent is removed.
If a later product introduces protected Event intent/dependencies, removal cannot
be extended to those records without another contract; that scope is absent today.

| Observation                                   | Meaning / local action                                                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Missing ID in newer certified complete scope  | Remove its read-only mirror; record membership exclusion via G certificate. Cause remains unknown.                                                           |
| Domain Event deletion                         | Only a later approved server mutation can perform it; snapshot absence is its read effect, not an enabled delete command.                                    |
| Loss of entire Trip visibility / Trip removal | Auth/read failure; no empty certificate/removal. Existing admission/security policy owns access handling; B-T3G authorizes no purge.                         |
| Future Event version / contract               | Withhold entire collection; retain rows and fence. Never count unsupported rows as absent.                                                                   |
| Partial page / failed/truncated response      | No membership effect and no certificate change.                                                                                                              |
| Legacy marker-null row                        | Outside canonical set; preserve legacy table/queue. A cached canonical ID reverting to legacy is an invalid server downgrade, not a supported deletion path. |
| Accepted Place cache loss                     | Event remains included; only allowed pointer fields clear at equal semantic revision.                                                                        |

No per-Event tombstones are needed for V1 **only because** the durable full ID set
and snapshot watermark remain, complete attempts are atomically applied, and all
old page/individual application paths consult that fence. Never drop the fence
while permitting old observations to apply. Cache eviction/reset must retain it
or atomically drain/invalidate all outstanding cycles under a separately approved
reset policy; an ordinary purge/cleanup may not erase it.

Before the first certificate, accepted B-T3F individual mirroring remains available.
After certification, an individual response cannot insert a missing member, restore
an absent ID, remove membership or renew completeness. If its ID is outside the
certificate, preserve existing state and request one owner collection refresh;
even a higher Event semantic revision alone cannot prove newer presence.
For IDs already included, B-T3F revision/pointer rules still apply under the same
owner/apply gate. A changed individual mirror invalidates derived hash freshness
and schedules a coalesced complete refresh; its historic certificate fence remains.
An unchanged individual read is neutral. A WITHHELD/404 individual response removes
nothing. All application entrypoints must enforce these rules, including direct
applyRead/default repository callers; wiring only the collection caller is unsafe.

Stale resurrection examples: snapshot 7 includes E, snapshot 8 excludes E.
After committing 8, pages for 7 reject by watermark; an unstamped individual E
rejects by membership even after restart/A→B→A. A complete snapshot 9 including E
can re-admit it if normal per-Event validity holds. Empty snapshot 8 provides the
same fence. There is no fabricated Event revision to represent deletion.

## I. Existing owner and compatibility

Future integration extends the existing `ledgerReportingCoordinator.ts` scoped
cycle boundary, with a separate canonical Event repository/transport step and
independent result. It does not create a second owner, piggyback on the financial
cursor, alter A completeness, or couple Event failure to successful money apply.
Canonical work runs only for these eligible central signals:

| Signal                         | Required behavior                                                                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cold online start / Trip entry | Render local data first; schedule one captured active-Trip complete attempt.                                                                                         |
| Foreground                     | Coalesce an eligible active-Trip refresh through the same owner.                                                                                                     |
| Reconnect / auth recovery      | Refresh even with an empty mutation queue; preserve Account/backoff policy.                                                                                          |
| Explicit Trip refresh          | One same-scope attempt plus F's one recovery; no hidden repeated bootstrap.                                                                                          |
| Future post-command wake       | After separately approved atomic command result apply releases its gate, drain older reads and request one fresh complete set. A receipt is never a set certificate. |

Signals during an in-flight cycle coalesce to at most one subsequent eligible
cycle; failure itself does not recursively signal another. Account/Trip changes
invalidate the captured active selection work. Existing financial polling or queue
timers must not invoke this collection step; add no Event interval/timeout worker.
Continuous idle/offline clients have no instantaneous freshness guarantee.

| Backend/client situation                       | Exact behavior                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Endpoint absent / old backend                  | Mark cycle unsupported; keep B-T3F reads and any durable fence; do not try to infer an empty set.      |
| Individual-read-only backend                   | Individual reads continue within H fencing; they cannot certify completeness or absence.               |
| Old response without certificate               | Reject for collection use; do not synthesize fields/count/hash from a list.                            |
| Explicit withholding / future Event version    | Preserve all cache/certificate; stop this cycle.                                                       |
| Future collection/read/fingerprint version     | Reject unsupported present envelope/token; no old-backend fallback.                                    |
| Older collection after newer local certificate | Ignore whole attempt without removals/checkpoint regression.                                           |
| New backend after old backend                  | Next eligible zero-cursor attempt may certify; never trust a financial/private cursor as continuation. |

Do not change B-T3E's individual/receipt routes or advertise enabled semantic
commands. Collection support is negotiated by its explicit version header/response;
the existing strict capabilities DTO need not gain unreviewed additive fields.
Scope/validation/capacity/network errors preserve readable cache; only existing
explicit security/admission policy governs access restriction or reauthentication.

## J. Proposed implementation slices and biggest blockers

These are proposals for separate approval, not work authorized by this document:

1. **Protected collection observation foundation:** additive state/counter coverage
   and one fixed coherent admitted aggregate-read seam; isolated schema, writer,
   concurrency/ABA/Place-FK/restore/overflow/security tests. Commands remain closed.
2. **Backend/transport contract:** exact GET envelope, codec/hash vectors, bounded
   full enumeration and page slicing, withholding and replay/error tests. No UI.
3. **Local certificate/application:** later additive SQLite record, shared atomic
   B-T3F reconciliation/removal and individual fence, baseline-race protection,
   cross-Account/restart/crash tests. Retain existing migrations 44/45 unchanged.
4. **Existing-owner wake integration and acceptance:** central event signals only,
   financial non-interference, empty-queue reconnect, old-backend upgrade, real
   multi-page SQLite/transport and later separately authorized device acceptance.

Biggest blockers are non-bypassable counter coverage of every allowed neutral
Place/cascade path without weakening B-T3B/D, and proof that enumeration/counter/
admission/endpoints share one uncapped observation. Next are routing every local
individual application through the durable membership fence and bounded-memory
buffer baseline validation. Exact cross-runtime binary64/Unicode fingerprint
vectors and lock/grant review are implementation gates. Failure to prove any gate
keeps collection certification disabled; it does not justify a partial certificate.
No runtime deployment, credentials, delete/Source commands or semantic activation
is implied by completion of these read-only slices.

## K. Acceptance matrix

PASS below means **contract coverage**, not implemented or executed runtime proof.

| Requirement                                                  | Contract evidence      | Status  |
| ------------------------------------------------------------ | ---------------------- | ------- |
| Exact full Trip scope, legacy/future/admission distinctions  | B/D/H                  | PASS    |
| Seven-shape lossless root/endpoint aggregate                 | B/E/G                  | PASS    |
| Versioned envelope and final complete certification          | D/F/G                  | PASS    |
| Deterministic full-read hash and independent golden digests  | E                      | PASS    |
| Place-neutral changed hash and narrow equal-revision apply   | C/E/G                  | PASS    |
| Deterministic multi-page cursor, retry/churn/ABA bounds      | C/D/F                  | PASS    |
| Authoritative absence versus deletion/visibility/withholding | H                      | PASS    |
| Durable no-tombstone fence and stale resurrection rejection  | G/H                    | PASS    |
| Account/Trip/generation, selection ABA and no network gate   | G/I                    | PASS    |
| Monotonic revisions, contradiction and atomic crash boundary | G                      | PASS    |
| Existing owner/wakes without financial cursor/poll coupling  | A/I                    | PASS    |
| Old backend/future versions preserve B-T3F offline reads     | H/I                    | PASS    |
| Protected server/codec/local/owner runtime acceptance        | J                      | PENDING |
| Independent/human review                                     | This proposed contract | PENDING |

Participant-scope certification gate and separately reviewed adapter boundary:
**PASS** for contract coverage (B/C/D/E and cases 33–37); runtime adapter remains
**DISABLED**. Existing snapshot/cursor/fingerprint/removal/Place decisions are retained.

## L. Golden acceptance cases

Unless stated otherwise, same admitted Account/Trip/epoch; snapshots have strictly
increasing collection revision. Cases below are future runnable acceptance vectors.
Only E's local byte/hash computations and document checks were executed here.

|   # | Input / fault                                                                                         | Required outcome                                                                                                                            |
| --: | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | Empty canonical set plus legacy rows                                                                  | E empty digest; one certified empty page; legacy retained; scoped old canonical mirrors removed atomically.                                 |
|   2 | One POINT / date-only / microsecond source facts                                                      | Complete READ_ONLY round-trip without scheduledDate, timezone inference or Date rounding.                                                   |
|   3 | 1,203 aggregates                                                                                      | 13 pages: twelve of 100, final 3; no SQLite page apply; count/full hash match before one commit.                                            |
|   4 | TRANSPORT near page boundary                                                                          | Both endpoints in one aggregate; role order normalized; no orphan/split endpoint page.                                                      |
|   5 | Mutation after page 1 before page 2                                                                   | Counter mismatch → INVALID_EVENT_COLLECTION_CURSOR; buffer discarded; at most one fresh recovery.                                           |
|   6 | E changes text A→B→A                                                                                  | Advancing semantic and collection revisions invalidate old continuation despite identical final title.                                      |
|   7 | Insert E then remove E between pages                                                                  | Collection revision advances despite original set/hash restored; old cursor invalid.                                                        |
|   8 | Delete E between pages                                                                                | No early removal; invalidation; newer complete set commits exclusion and fence. No delete command activated.                                |
|   9 | Final-page response lost, unchanged server                                                            | Replay exact request; same page/hash; single atomic certificate commit.                                                                     |
|  10 | Final-page loss then server mutation                                                                  | Replay invalidates; use only one complete recovery; no certificate from remembered partial data.                                            |
|  11 | Continuation from older completed attempt                                                             | Server mismatch or local newer watermark discards it; never reintroduce excluded E.                                                         |
|  12 | A→B→A during I/O or commit                                                                            | Captured generation rejects/rolls back; B cache/certificate unaffected.                                                                     |
|  13 | Trip T→U→T selection while buffering                                                                  | Selection lease invalidates old T cycle; no U write; fresh T selection gets a new attempt.                                                  |
|  14 | Same Event UUID for two Accounts                                                                      | Independent roots/endpoints/ID sets/fences; neither application removes the other's mirror.                                                 |
|  15 | Future nonnull Event temporal version on later page                                                   | Entire collection WITHHELD before certification; old mirrors/fence preserved, not certified omission.                                       |
|  16 | Future collection/read/fingerprint version or changed epoch                                           | Non-destructive rejection; no fallback, reset or empty set.                                                                                 |
|  17 | Root, ORIGIN, DESTINATION UUID→null at same Event revision                                            | Changed full hash/new collection revision; old cursor invalid; only pointer changes plus collection certificate commit.                     |
|  18 | Pointer loss plus title/time/address/provenance/location_input_revision change at same Event revision | Whole local apply rolls back as contradiction, including removal/certificate; no broad ignored field.                                       |
|  19 | null→UUID or UUID_A→UUID_B at same Event revision                                                     | Fail closed, preserve all cache/fence; no recovery loop labelled churn.                                                                     |
|  20 | Snapshot has lower Event revision than cache, or UUID after local null loss                           | Abort whole certification; one fresh recovery; never certify mismatched resulting bytes.                                                    |
|  21 | Duplicate/reordered/omitted IDs, wrong ordinal/count/hash/scope/token or missing end                  | Reject complete attempt; no inferred deletion or cursor checkpoint.                                                                         |
|  22 | Local individual update while pages buffered                                                          | Baseline changes; discard attempt and bounded recovery; old absence cannot erase the update.                                                |
|  23 | Snapshot 8 excludes E; old individual E arrives, including after restart                              | Membership fence rejects insertion; newer Event revision alone proves no newer presence.                                                    |
|  24 | Snapshot 9 legitimately includes previously excluded E                                                | Only newer complete admitted set reintroduces mirror; legacy/financial data unchanged.                                                      |
|  25 | Old backend / endpoint absent / bare list without certificate                                         | Preserve offline cache and durable fence; finite unsupported branch; no absence inference.                                                  |
|  26 | Crash before final certification or during root/second-endpoint/removal/certificate writes            | Old complete committed state remains; any transaction failure rolls everything back. Restart starts at ordinal zero.                        |
|  27 | Crash after successful atomic commit before notification                                              | New rows/endpoints/membership fence survive; replay neutral; no stale-page resurrection.                                                    |
|  28 | Repeated churn, oversized page/set, response parse or unknown read error                              | Stop at F's bounds; cache preserved; later eligible wake only, no timer/new worker.                                                         |
|  29 | Trip read revoked/Trip removed, then access restored                                                  | Denial never becomes empty set; later read-admitted fresh complete attempt required; existing security policy retained.                     |
|  30 | Same collection revision but changed hash; counter overflow; rollback                                 | Integrity failure / affecting write rejected / increments rolled back; never reuse revision.                                                |
|  31 | Reconnect with zero queue; cold/foreground/explicit refresh; financial poll tick                      | Eligible signals coalesce through existing owner; poll tick does not request this collection.                                               |
|  32 | Newer individual read for included ID then old same-revision certificate                              | Historical certificate remains a fence but hash freshness invalid; no rollback/false completeness; schedule fresh collection.               |
|  33 | Every canonical Event UNASSIGNED with zero participant rows                                           | Eligible for V1 certification only when all other scope/version/aggregate checks pass.                                                      |
|  34 | Any ASSIGNED Event, including beyond the current page                                                 | Entire collection WITHHELD/UNSUPPORTED_EVENT_CONTRACT; no skipped Event, scope-only hash or complete=true.                                  |
|  35 | Any WHOLE_GROUP Event                                                                                 | Entire collection WITHHELD/UNSUPPORTED_EVENT_CONTRACT; no dynamic-roster inference or participant omission.                                 |
|  36 | UNASSIGNED Event with an unexpected participant row                                                   | Invariant violation fails closed as entire collection WITHHELD/UNSUPPORTED_EVENT_CONTRACT; no repair, rows discarded or certificate issued. |
|  37 | Participant scope/set changes between pages after a future separately reviewed supported adapter      | Collection revision advances; old cursor invalidates. Current V1 withholds unsupported scope/rows; this case grants no adapter activation.  |

Validation for this document: startup Git gate, scoped source/contract inspection,
independent Node/Python golden bytes/hashes, document formatting/whitespace/link
and one-file Git-scope checks. No runtime/SQL/device suite or remote access is
claimed. This task expressly excludes current-state/ADR edits; the real decisions
remain proposed here pending review and later implementation approval.

Migration/code/config changed: **NO**. Current-state changed: **NO**.
Event commands enabled: **NO**. Deletion command enabled: **NO**.
Deletion implementation added: **NO**. UI added: **NO**. Polling/timer: **NO**.
Production/Hosted Dev accessed: **NO**. Sibling modifications: **NO**. Commit: **NO**.

V1 collection certifies ASSIGNED/WHOLE_GROUP: **NO**.
Current B-T3E fingerprint omits participant set: **ACKNOWLEDGED**.
Future participant adapter enabled: **NO**.
Code/migration/config changed: **NO**. Production/Hosted Dev: **NO**. Commit: **NO**.

**STOP — B-T3G PARTICIPANT-SCOPE CORRECTION COMPLETE — REVIEW PENDING.**
