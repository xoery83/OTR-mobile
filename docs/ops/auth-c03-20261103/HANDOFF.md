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
