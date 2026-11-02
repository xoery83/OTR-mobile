# AUTH-C03 private Profile adapter increment — 3 November 2026

Profile Cloud DTO/Account Repository/Supabase adapter already exist and are reused.
No UI, SQL, Profile schema or permission change is introduced by this increment.

`repository.recoverPrivate(scope, originalMutation)` GETs
`/v1/account/private-profile/operations/:operationId/recovery` using the existing
bounded, authenticated, generation-fenced client. Its DTO is APPLIED + the original
receipt, or ABSENT_UNCONFIRMED. The client binds Account/operation/expectedRevision+1.
No local snapshot/draft is changed and no save is submitted. The immutable original
request must come from the caller's retained attempt, not reconstructed from edited
name fields. Receipt metadata is a historical disposition, not current Profile/name
readback, an intent-hash proof, a Person link or a sync certificate. Absence never
means NoCommit. Other HTTP failures remain failures; no generic404 downgrade.

The optional Backend boundary exposes this read-only projection using the existing
Profile receipt port. The original `operations/:id` path still returns its old DTO
or404; existing callers are compatible. New recovery routing remains unmounted and
requires the same normal Account/subject authorization. There are no new SQL/RLS/
GRANT/Session/Provider requirements or changes; Hosted Profile itself remains a
separate protected installation candidate. No runtime is enabled here.

Golden Slice and independent Review: PROFILE_RECOVERY_EVIDENCE.json. 33 focused
local tests; independent only8new,25stable skipped. Existing C04 PG/Review evidence
is retained unchanged and was not rerun.

People consumer gap: normal Person projection has no Account binding. Native has
confirmed a minimal accepted-cache port contract, not delivered it yet:
`readAcceptedPeopleConnections(ctx) -> null | {certificate, people:[{personId,
connected,isCurrentActor}]}`. Native keeps AccountApplyGate/SQLite transaction/
context/version/access-revision qualification; only active bindings are projected,
inactive/missing means UNKNOWN, participating is not connected. Other Account UUIDs
are excluded. Auth will consume stable Person IDs; no name/email/AKA matching.
No shared Core/Navigation/SQLite file was changed by Auth. Trip Nickname needs its
owning self-Person write/CAS path; Account-private Display Name is not that field.


## People connection display adapter candidate

`src/features/people/peopleConnectionProjection.ts` consumes the Native-agreed port
through `readPeopleConnectionProjection(context, {account, listTripPersons,
connections?})`. The existing Person repository remains the roster owner; Native
Core remains the accepted-certificate qualification owner. No direct SQLite or
new network/repository path exists here. Pass the existing scoped current-account
getter and Person repository method. Connect the Native Reader only after its
unique Writer delivers it; the adapter works with UNKNOWN when that port is absent.
It is not wired to a page yet and does not assert Native delivery.

Matches stable Person IDs only. Trip-scoped `displayName` is retained verbatim;
private global Display Name, travel-document names and AKA are not inputs. Only
OBSERVED_CACHE connection/self flags and non-private Core epoch/access revision are
projected. Missing/inactive/local-pending does not become not-connected. Participation
is independent. Bad duplicates/self-state or extra Account fields fail closed.
An explicit owning-reader rejection propagates; null is merely unknown. Existing
roster/downstream owners must enforce actual revoke/cache invalidation; neither
this adapter nor a mock exception proves server revocation. See
PEOPLE_PROJECTION_EVIDENCE.json (10 new tests, independent9+1).

Trip Nickname edit is not implemented by reusing global Profile mutation or the
Person Add create request. It needs its own approved self-Person write/CAS source
and existing repository/sync integration; no new engine or guessed revision is added.
