# AUTH-C03 precise existing Profile / Person boundary

Request `AUTH-C03-PRIVATE-PROFILE-PORT-PACKET-20261104-01`.
This reconciles existing approved scope and fixed source hashes in CONTRACT_PACKET.json;
AUTH-C04 remains Primary. No new model, permissions, migration execution or Hosted test.

## One Account-private target and current API contract

The sample payload targets only synthetic Account A. Account/subject comes from normal
verified bearer identity, never request names, an Account ID body or a Trip membership.
The sample operation was never submitted; expectedRevision0 is not a live database fact.

| Port     | Existing route / method                                 | Qualification                                                                         |
| -------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Read     | GET /v1/account/private-profile                         | Same Account snapshot/schema/revision/fields; absent row is revision0 + empty fields  |
| Patch    | POST /v1/account/private-profile/operations             | operationId + expectedRevision + nonempty changes; Idempotency-Key equals operationId |
| Receipt  | GET /v1/account/private-profile/operations/:id          | Original Account/operation; historical revision/time, not current names               |
| Recovery | GET /v1/account/private-profile/operations/:id/recovery | APPLIED original receipt or ABSENT_UNCONFIRMED; absence is not NoCommit               |

These are implemented candidate boundaries, not mounted Hosted routes. app.ts only
mounts the separate accountProfileBootstrap ensure endpoint. Bootstrap is not a save,
clear, Profile read or Person binding port. UI never calls Supabase directly.

## Fields, patch / clear and privacy

| Field                  | Omitted                   | Explicit clear / value                                                                                 | Ownership                                                       |
| ---------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| displayName            | Preserve                  | null clears optional value; empty string remains exact empty string                                    | Account-private; not Trip Nickname                              |
| travelDocumentName     | Preserve                  | null clears whole document name; SPLIT has nullable familyName/givenNames; UNSPLIT has fullName string | Account-private original Unicode, independent from displayName  |
| globalAka              | Preserve                  | [] clears array; ordered exact Unicode strings, no normalization or inference                          | Account-private candidate; local UI does not auto-publish       |
| TripPerson.displayName | Not part of Profile patch | No nickname clear/write contract is qualified here                                                     | Trip-scoped Person/normal roster; no Account identity authority |

SQL merges top-level changes into fields; explicit JSON null is stored, not key deletion.
Edited document-name objects replace that field as a complete split/unsplit object;
hidden editor drafts do not become cloud mutations. No arbitrary extra optional
Profile fields, Trip settings, role, connection, Organizer Note or document passengers
are accepted as private-profile fields. Native nickname change needs its own owning
self-Person endpoint, precise writable fields/clear/revision/receipt; this is an
explicit gap, not permission to reuse AddTraveler or participationRevision.
AKA array support is not a complete provenance/correction/inactive lifecycle. Do not
claim that lifecycle or enable automatic global AKA upload based on this candidate.

## ACL, revision, failure and offline behavior

Existing candidate uses normal verified self identity; Guest, anonymous/disabled Account,
foreign subject, delegated MCP/OAuth resource identity are rejected. The Supabase adapter
uses public configuration + that same normal bearer; auth.getUser and the bounded
actor RPC must both match. No service-role credential or second user/session system.
Candidate RLS allows only self SELECT; authenticated has no direct table mutation.
The save SECURITY DEFINER function derives the actor and serializes per Account,
checks original operation fingerprint before CAS, commits fields+immutable receipt
in one transaction. Same operation+same request returns original receipt; changed
request under same operation collides409. Stale expectedRevision conflicts409;
accepted revision is expectedRevision+1. There is no silent rebase or LWW.

Local accepted snapshot and private draft are Account-scoped behind existing
AccountApplyGate/SQLite transaction/generation fences. Local save/cancel/cold recovery
stays available without network; cloud save is not silently queued by this candidate.
A dirty draft preserves its original CAS base when a remote snapshot arrives; stale
or same-revision-different snapshots reject. Late Account responses fail closed.
Switch/logout must retain established Account-private isolation and clear consumers;
no name matching, copied credentials, new sync engine or startup network auth gate.

UNKNOWN retains the original immutable request. Recovery receipt metadata is not an
intent hash proof or current-name readback; absence never authorizes retry or a new
operation. Caller-retained durable original-attempt production and normal Cloud UI
binding still require qualification; do not reconstruct the attempt from new draft text.

## Accepted Person read and remaining integration gaps

Native accepted People Reader projects stable personId/connected/isCurrentActor plus
accepted certificate under Account/Trip/generation/epoch/access revision. No foreign
Account UUID or private names. Missing/inactive/local-pending is UNKNOWN; explicit
reader denial propagates. Existing TripPersonRepository owns roster names and drafts.
Core/Native own real revoke and cache invalidation; Auth projection is not authority.
The older NATIVE_READER_ACCEPTANCE record describes local delivery; actual C04 Member
Read71da1578 separately proves B binding, not cloud Profile or nickname persistence.

Minimal next interfaces: Auth supplies default-closed Runtime composition and exact
shared app dependency/mount patch; Root1 reviews/integrates only that shared source.
Root2 separately qualifies new private storage/ACL install and deployment. No Cloud
Profile permission is included in already approved C04 or read-state repair Gates.
No Native Cloud Save is enabled until storage, strict client schema, route, identity,
receipt and account-isolation readback are all actually qualified.

Reuse existing local Profile/AKA/operation recovery/People Reader reviews. This packet
adds no product code, so do not rerun stable Auth/PG tests. Required future acceptance:
A explicit self patch/read/receipt; B denied A private values; conflict + original UNKNOWN
recovery; draft preservation and same-account Native cold restore. Trip nickname and
AKA lifecycle remain separately stated gaps, not hidden prerequisites or fabricated PASS.
