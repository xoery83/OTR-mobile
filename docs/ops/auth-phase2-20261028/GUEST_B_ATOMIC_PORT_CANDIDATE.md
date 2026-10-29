# Guest B atomic publication port — Core Writer review candidate v1

Status: **COMPOSITE PUBLICATION NOT IMPLEMENTED / NOT AUTHORIZED FOR DEV EXECUTION**. This is an
engineering interface request under approved AUTH Final V1, not a replacement
permission model or a claim that publication is ready.

Existing owning types:

- `backend/src/tripCreate.ts`: `TripCreatePort`.
- `backend/src/tripMetadataV2.ts`: `TripMetadataV2Port`.
- `backend/src/tripCoreV2Commands.ts`: `CoreCommandStorage`,
  `CoreCommandTransaction`, `executeCoreCommandV2`.
- `backend/src/tripCoreV2PgStorage.ts`: `CorePgLease`.

Minimal requested internal seam, subject to the unique Core Writer's review:

```ts
type GuestPublicationScope = {
  actorAccountId: string; // existing authenticated canonical target Account
  adoptionId: string;
  sourceGuestLocalId: string; // provenance only, never a server actor
  inventorySha256: string;
  sealedManifestSha256: string;
  grantId: string;
};

// Backend-internal callback, never a client-supplied mutation/SQL executor.
type GuestPublicationTransaction = {
  trips: TripCreatePort;
  metadata: TripMetadataV2Port;
  core: CoreCommandStorage;
  // Stable source Person -> actual owning server Person mapping, not name matching.
  personMappings(tripId: string): Promise<
    readonly {
      tripId: string;
      sourcePersonId: string;
      targetPersonId: string;
    }[]
  >;
};

interface GuestAtomicPublicationPort {
  withLockedPublication<T>(
    scope: GuestPublicationScope,
    work: (owning: GuestPublicationTransaction) => Promise<T>,
  ): Promise<T>;
}
```

The scope/type alone supplies **no authority**. The owning adapter must verify and
lock an actual server staging/grant record belonging to this authenticated Account,
with the complete sealed manifest, before constructing these internal ports. It
must revalidate/reserve the approved entitlement policy at publication. Client
resource counts cannot grant access; unknown commercial policies stay unenforced,
with no invented numeric limits. Preflight metadata DTOs are separately defined in
`src/domain/auth/guestAdoptionPreflight.ts`; that boundary remains unmounted/closed.

Required behavior of the returned owning ports:

1. One real PG lease and one outer transaction; no inner BEGIN/COMMIT/ROLLBACK and
   no network/HTTP composition. Preserve the existing lock order. Full rollback
   if any Trip, Person mapping, Ledger initializer, metadata operation, Core command,
   receipt or final dataset check fails. Only outer COMMIT makes data visible.
2. Bind every actor/Trip/operation to the sealed manifest. Reject pre-existing Trip
   collisions; never merge by name or allow overwriting target Account data. Guest
   Trip IDs may remain stable only when the owning new-Trip collision contract is
   satisfied. Original operation identities remain stable across retry/status.
3. Reuse original `executeCoreCommandV2` and its Actor/Creator/visibility/CAS,
   admission, audit and immutable receipt checks. `core.withLockedCommand` exposes
   the same owning semantics on the held transaction; it is not a bypass flag.
   Only supported complete Guest families qualify. Golden A is Manual P1; any
   unknown/nonempty family blocks the entire dataset rather than being omitted.
   A normal command returning CONFLICT/REJECTED is a publication failure even if
   its owning service returns a receipt instead of throwing.
4. Reuse Trip/Person/Ledger owning initialization and approved metadata semantics.
   Explicitly map the local creator Person to the actual new Trip owner Person,
   preserving Participant/Creator references; no email/name/AKA inference. Include
   automatic Ledger and private cover preference state through their owners.
   Mapping lookup occurs after owning Trip/Person initialization inside the same
   transaction; it cannot assert a pre-existing server Person before creation.
5. Retain all per-operation domain receipts plus one dataset receipt bound to the
   Account, adoption ID, source/digest/sealed manifest and complete reference map.
   Return final results only after outer COMMIT. Commit response loss/UNKNOWN must
   use an authenticated same-Account adoption-status read, never a new adoption ID.

Current source observations: accepted held-transaction seams exist for Core,
TripCreate and MetadataV2 (exact replay db97ccfc, main ee246658; directed148,
independent131 and disposable real-PG transaction1 PASS). Standalone factories
still own their transactions. The held ports preserve all normal SQL/principal
checks; Core, TripCreate and MetadataV2 require three different session_user
principals. These seams do not authorize their cross-Gateway composition. Do not
intercept COMMIT, substitute service_role, strip principal checks or borrow
Manual/Source QA qualification.

Any required new Role/RLS/GRANT, staging/publication functions or modifications of
protected actor/principal fences need an exact preimage/diff, isolated PG negatives,
independent Core review and applicable Owner execution approval before DEV install.
Auth can prepare candidates; only the unique Writer changes shared Core sources.
Backend bootstrap/config/Host integration remains separately serialized.

Still missing: actual atomic storage/authority and explicit Person/Creator mapping;
protected cancellation/status; Native login/adoption/recovery and Supabase readback.
Current schema74/fileless Trip/P1-only source is frozen and projected through
owning readers. Immutable journal v3 retains semantic source, drafts and hashes
across cold recovery while source SQLite stays locked after publish intent. Other
nonempty/unknown families and unqualified files still block the whole dataset.
The journal has no local success state or publication permission.

## Focused owning-interface progress — 29 October

Original Core ab33fc9f, TripCreate2c04394d and MetadataV2 1a34e1c1 were replayed
as seven byte-verified source/test files onto accepted dd53870c, rather than merging
unaccepted Native history. Their accepted source and limitations are recorded in
GUEST_B_PG_TRANSACTION_REPLAY.json and GUEST_B_PG_PORTS_MAIN_INTEGRATION.json.

Actual GuestA SQLite74 retains Trip1/P1intent1/queue3 with zero Cloud receipts. The
third operation is TRIP_LOCAL_ACTION:TRIP_METADATA_DEFERRED from normal Native edit.
Canonical source retains its stable dependency/before/after identity, current Trip
metadata, original Create, People, P1 hashes, Ledger initialization and timestamps.
Never omit it or relabel it server-Applied.

Native Guest UI live-draft freeze and local journal capture are accepted within
their recorded limits. P1 CREATE can restore through the owning repository; EDIT
v1 lacks an owning revision and stays closed. Full Native recovery routing and
Provider/publisher consumers are not accepted. GuestQA65 is finite existing-data
and unsaved-editor/cold regression, not actual adoption. All UI/Repo/PgStorage
Writer leases were returned to Native; coordinate new edits explicitly.

Three distinct Gateway principal fences still prevent the complete atomic
publisher. Precise protected role/function changes, complete source-to-server
identity mappings and Ledger initialization must be reviewed separately before
requesting an exact Owner execution Gate. Physical one-lease PG tests alone cannot
supply that business authority.
