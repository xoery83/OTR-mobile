# CREATE-TRIP-01 — Local named Persons

Based on Day `72ec39a`. Owning local component candidate; **not integrated Create
UI, Hosted Person sync, invitations, canonical participation or Native PASS**.
No Schema/Migration, financial computation or original Nelson data changes.

## Existing storage / identity

`ledger_members` already permits UUID, Trip, name, null role, `status='local'`,
and null participation observation. Existing `sync_operations` holds owner,
Trip, operation/person IDs, immutable versioned name-create intent, and honest
`DEPENDENCY_BLOCKED / PERSON_CREATE_HOSTED_UNAVAILABLE / attempt0`. There is
no `dependency_operation_id`: successful Trip create must not release an
uninstalled Person writer. No names, credentials or custom Person model are
stored outside these existing owning tables.

`LocalPersonNameSlot` is `{operationId, personId, displayName}`. Caller allocates
stable UUIDs once with its retained create action/draft and reuses them on retry;
blank slots persist nothing. Do not reallocate IDs after a failed save. Trimming
is deterministic; duplicate names do not merge people. Each actual Person gets
one meaningful version1 `TRIP_PERSON_CREATE` intent, not a fake Trip CREATE field.
The separately required creator Actor/owner is neither autofilled into Traveler1
nor matched to a typed name. Three entered names save three additional explicitly
named people, never three connected Accounts. Exact total UI terminology must
preserve that Actor-versus-named-person distinction.

## Transaction interface / Root-only integration patch

`initializeLocalTripPersons(database, context, account, slots, clock)` must be
called **inside** the existing account-gated Trip-create Repository transaction,
after normal `initializeLedger`, before commit. It starts no nested transaction.
A malformed slot, changed replay, stale account or queue failure aborts the entire
caller's transaction. Name-only slots do not change immutable metadata-only
`TripCreateRequest`, original proof or original CREATE idempotency bytes.

`createLocalTripPersonRepository(...).initialize(...)` provides the same check in
its own transaction for existing local Trip callers. New rows require the exact
pending local creator binding, original normal Create request and current owner
Actor. After accepted Trip creation, exact already-retained intents can replay;
new rows are denied. This does not grant general Hosted organizer creation.

`ROOT_ONLY_INTEGRATION.patch` is an exact, **unapplied** handoff for the sole writer:

1. Add optional local-only `travelers` to `CreateTripInput`, not the strict Hosted
   request schema or JSON proof.
2. Call the initializer in the existing create transaction (including replay).
3. Hard-close `TRIP_PERSON_CREATE` in the generic Sync engine even if a manual
   retry/permissive consumer attempts to dispatch it. Required before exposing UI.
4. Add actual normal Trip Repository atomic creation/cold replay/whole-graph
   rollback tests plus generic-worker non-dispatch regression.

The patch changes only those direct callers/tests; this candidate does not write
the shared Trip Repository, Create API types, Sync engine or UI. Root must apply,
run those extra tests and independently review before enabling the form. It is
not safe to integrate only the form/initializer while omitting the hard closure.

## Reader / bootstrap / financial boundaries

- `TripPerson.localState === LOCAL_PENDING` is emitted only for a retained current
  account's unfinished name-create operation on a local row. Existing canonical
  Person DTOs remain unchanged. Local people have no participation revision,
  Account link, Organizer role or permissions.
- Normal bootstrap only upserts incoming canonical members, so other pending local
  UUIDs survive. An incoming canonical UUID colliding with an unfinished local
  Person operation is rejected atomically; no name-based or UUID-only claim.
- The certified participation vector still contains only exact server IDs. The
  real SQLite certified-bootstrap test proves pending people remain readable
  with null participation while the certificate contains only the canonical owner.
- Existing Ledger `listMembers` excludes these exact unfinished local-create rows,
  preserving the prior local creator owner. They cannot be offered as financial
  participants/payers before a lawful Hosted mapping. This is not a change to
  money, split calculation or existing canonical unlinked-person behavior.
- **Local Person save/read ≠ Hosted synced ≠ eligible financial participant.**
  Full Members, invitations and offline multi-person Expense are not completed.

## Future release condition (not implemented)

The retained operation contains version, account, exact Trip, original Trip-create
operation, Person UUID and normalized name. A future owning dispatcher may release
only after a lawful versioned Hosted Person creation port/receipt contract exists,
Trip/Actor authority is rechecked, exact intent is pinned, receipt replay/collision
is verified, the authoritative roster is refreshed and canonical mapping is
accepted. No current method sets COMPLETED or unlocks financial selection.
Do not manually change status or mark the operation synced. Hosted installation,
new privileges or schema would need a precise separate Gate; this slice does none.

## Verification boundary

Component tests use current migrations, real SQLite and existing normal Trip,
Person, Ledger and certificate repositories. Tests prove seven slots/three names,
empty names, stable IDs/cold replay, immutable CREATE bytes, owner separation,
role/account/binding/accepted negatives, changed intent/ID collisions, full name
batch rollback, account-generation rollback, certified bootstrap retention and
no canonical/financial authority. Root-only whole-Trip atomic tests are supplied
in the unapplied patch and must be run after integration. No Simulator or Hosted
operation ran in this candidate.
