# Guest B atomic publication port — Core Writer review candidate v1

Status: **NOT IMPLEMENTED / NOT AUTHORIZED FOR DEV EXECUTION**. This is an
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

Actual source observations: `createTripPgStorage` and `createCorePgStorage` each
own transactions; Core additionally checks its exact Gateway principal, with
existing SQL `session_user` fences. No accepted caller-held complete seam has yet
been confirmed by Core's Writer. Do not intercept COMMIT, substitute service_role,
strip principal checks or borrow Manual/Source QA qualification.

Any required new Role/RLS/GRANT, staging/publication functions or modifications of
protected actor/principal fences need an exact preimage/diff, isolated PG negatives,
independent Core review and applicable Owner execution approval before DEV install.
Auth can prepare candidates; only the unique Writer changes shared Core sources.
Backend bootstrap/config/Host integration remains separately serialized.

Still missing: owning Guest file/all-live-draft collectors and consistent full
source freeze; normalized sealed manifest export; actual atomic storage/authority;
protected cancellation/status; Native login/adoption/recovery and Supabase readback.
The already integrated local recovery journal has no local success state, keeps
Guest originals and requires status query once publish intent is recorded.

## Focused owning-interface progress — 29 October

Core extraction ab33fc9f and TripCreate extraction 2c04394d are independently
reviewed private candidates handed back to Native; no deployment or publication
permission follows. Do not whole-merge the Core candidate's unaccepted Native
parent history. Normal owning SQL/principal/receipt logic remains unchanged.

A fresh read-only check of the actual GuestA vault confirms schema74, Trip1,
P1 intent1, queue3, zero Cloud receipts/read certificates. Its third queue entry is
TRIP_LOCAL_ACTION:TRIP_METADATA_DEFERRED, created by the normal Native Trip edit.
Do not omit it, overwrite the original Create intent, or label a deferred action
server-Applied. Its stable identity/baseline must be reconciled by the owning
Metadata pipeline and included in whole-dataset verification. The delegated MetadataV2 held-transaction candidate is fixed at 1a34e1c1
(13 storage + 9 handler checks, types/lint/build and independent review PASS). Its
normal query/method/error-classification AST remains identical to the owning
baseline. The narrow Writer lease has been returned. This is a private candidate
awaiting Native acceptance, not main integration, actual PG composition or DEV
publication authority.

TripCreate, MetadataV2 and Core use three different session_user principals today.
A single physical transaction is necessary but does not itself grant composite
business authority. Precise protected role/function changes remain a separate
closed candidate/Gate, including mappings and empty Ledger initialization.

Full live-Trip draft coverage is also still blocked. Read-only intake identifies
LocalTripWorkspace create fields/operation refs and TripBasicEditor baseline,
destination, cover and saveIntent state; child name/calendar/destination pickers
need owning freeze/block signals. Guest already disables Photo/Currency access.
Foreground load currently clears selected presentation on any repository error;
Native handoff must preserve frozen presentation when a known Auth fence rejects
reads, otherwise a mounted P1 draft can be unmounted. This is not a new Form design
or permission to edit Native-owned code without its unique Writer coordination.
