# Trip Canonical A1-I2C1 — Participation Lifecycle Command Contract / Integration Preflight

Date: 2026-10-04 (Pacific/Auckland). Status: **A1-I2C1 CONTRACT / PREFLIGHT COMPLETE — REVIEW PENDING**.
Design only. Lifecycle and Event participant commands remain disabled.

Startup verified `/Users/xoery/Project/otr-mobile-canonical`, branch
`integration/ledger-polish-canonical`, clean exact HEAD
`45eed53880263633afeb0b9c8f7bb20469eff5f6`. Recent commits: `45eed53`,
`0cc6616`, `d2d3ee2`, `b3fe04b`, `c3fb253`. Both sibling worktrees were clean.
Only this document is created. The task's one-file limit excludes current-state,
ADR and other contract edits. No commit or remote access is authorized.

CURRENT describes checked-in source; MUST describes the proposed contract after
separate approval. PASS means preflight/contract coverage, never implementation,
device or activation acceptance. The owner's accepted I2A/I2B1/I2B2/I2B3 authority
controls this task; their historical review labels and I2B3 physical PENDING cases
are retained as evidence, not silently upgraded. I2B convergence is closed.

## A. Executive scope

Select one first command: **SET_PARTICIPATION**, desired-state CAS on an existing
TripPerson, performed by a currently linked `journey_members.role=owner` Actor.
This includes the Organizer's own Person and unlinked/inactive target Persons.
Deactivate/reactivate are names for false/true intents to the same command.
They are not access leave/rejoin. No Person is created or deleted.

The inherited I2A command precondition is Organizer-only. Ordinary traveller
self-toggle cannot be smuggled in as a small permission exception. Access leave,
rejoin, link/claim, unlink, invite/person creation, remove/archive and transfer
remain deferred. This is the smallest useful first slice compatible with accepted
authority; expanding it requires review of the affected policies in N.

Use the already specified **trip_person_participation_receipts** family, not a
second generic `trip_person_operation_receipts` family. One immutable receipt is
both exact operation outcome and, for APPLIED only, transition audit. Keep
operation identity independent of Ledger/Event/Source receipts and sequences.

### Evidence consulted

| Authority / current source                                                                                                                                                                                                                                        | Consequence                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [A1 identity/membership](TRIP_CANONICAL_A1_IDENTITY_MEMBERSHIP_CONTRACT.md), E/F/I/J/O                                                                                                                                                                            | Person, Account, link, participation and access are distinct; leave is access termination; new claim/revoke policies are not implemented.                  |
| [I1](TRIP_CANONICAL_A1_I1_REPORT.md), [I2](TRIP_CANONICAL_A1_I2_PERSISTENCE_PREFLIGHT.md), [I2A schema](TRIP_CANONICAL_A1_I2A_SCHEMA_CONTRACT.md), E/F/O, [I2A report](TRIP_CANONICAL_A1_I2A_REPORT.md)                                                           | Same Member ID, protected safe pair, owner-only desired-state command, scoped immutable receipts and no financial side effects.                            |
| [I2B preflight](TRIP_CANONICAL_A1_I2B_CONVERGENCE_PREFLIGHT.md), [I2B1](TRIP_CANONICAL_A1_I2B1_SNAPSHOT_CURSOR_CONTRACT.md), H–P, [I2B2](TRIP_CANONICAL_A1_I2B2_IMPLEMENTATION_REPORT.md), [I2B3](TRIP_CANONICAL_A1_I2B3_DEVICE_CONVERGENCE_ACCEPTANCE_REPORT.md) | Complete vector/shared v2 protocol, monotonic apply, Account-transition gate, bounded central refresh and wake coverage stay fixed.                        |
| [B-T3A](TRIP_CANONICAL_B_T3A_SCHEMA_WRITER_CONTRACT.md), N; [B-T3C](TRIP_CANONICAL_B_T3C_COMMAND_RECEIPT_CONTRACT.md), B; [B-T3D](TRIP_CANONICAL_B_T3D_PROTECTED_COMMAND_FOUNDATION_REPORT.md)                                                                    | Event semantic machinery exists with gate CLOSED; only UNASSIGNED first scope. No participant activation or Event receipt reuse.                           |
| [C-I3A](TRIP_CANONICAL_C_I3A_SCHEMA_ACCESS_CONTRACT.md), M; [C-I3C](TRIP_CANONICAL_C_I3C_SOURCE_LIFECYCLE_COMMAND_CONTRACT.md), Q/R                                                                                                                               | Source owner/Account, evidence and operations remain C-owned; no Person inference or domain adapter activation.                                            |
| `backend/src/supabaseGateway.ts`: canReadTrip/canWriteTrip/canFinalizeSettlement                                                                                                                                                                                  | Creator, legacy membership and linked Member admission differ. Participation is absent from these predicates.                                              |
| `supabase/migrations/20260910000100_canonical_production_baseline.sql`: membership helpers, accept_journey_invite/claim_email_invited_journeys/claim_journey_member/remove_journey_member                                                                         | Legacy claims preserve Person ID but have heuristic matching, role projection and destructive removal behavior; they are not exact new lifecycle commands. |
| `supabase/migrations/20261003000100_trip_person_participation.sql`                                                                                                                                                                                                | Reserved NOLOGIN writer has no DML/entrypoint and private execution fails PARTICIPATION_COMMANDS_DISABLED.                                                 |
| `src/data/repositories/ledgerReadRepository.ts`, `tripPersonCertificate.ts`; SQLite migration 43                                                                                                                                                                  | Preserving upsert, all-null/all-present seven-field certificate, local rehash and atomic Account-gated application.                                        |
| `src/data/sync/ledgerReportingCoordinator.ts`; `src/data/auth/accountRequestContext.ts`                                                                                                                                                                           | scopedCycle/cycleTails serialize reads; one INVALID_CURSOR bootstrap; generation and commit gate already exist.                                            |

Root guide, current-state opening checkpoint, PRODUCT/ARCHITECTURE/DATA_MODEL/
API_CONTRACT/OFFLINE_SYNC/ENVIRONMENT_AUDIT and retained legacy audit were consulted.
No legacy Web checkout, live permissions, deployed schema or remote data was read.

## B. Identity and state pins

Trip=`trips.id`; Person=`journey_members.id`; local mirror=`ledger_members.id`.
Account/Actor is authenticated Auth/Profile UUID, never a Person ID. Exact target
is `(tripId,personId)`, not name, email, inviter, current-user substitution or a
global human key. Duplicate display names are valid independent Persons.

Participation pair `(participation_active,participation_revision)` is Boolean plus
integer in **0..9007199254740991**. Server baseline true/0 is initialization, not
historical transition evidence. Local null/null is unobserved; authoring requires
a known pair. An unlinked Person may persist indefinitely. Link preserves Person
ID and participation, including inactive status; uniqueness `(trip_id,user_id)`
includes retained inactive Persons. No ID reuse, replacement or financial remap.

V1 pins the exact prior Boolean AND revision. Revision alone is the inherited CAS
ordering authority; the extra Boolean diagnoses contradictory equal-version input.
There is no generic updated_at, Trip counter, Event semantic revision, Ledger
sequence, Source revision, access version or link revision in participation CAS.
Role/link authorization is checked live under locks, not represented by this pair.

Client allocates one canonical UUID `operationId`; `idempotencyKey=operationId`.
Server allocates receipt UUID once. Existing Trip/Person IDs are supplied, never
allocated by this command. Generation is process-local request context, not part
of server identity or digest; restart binds the same operation to a new valid
generation of its originating Account.

## C. Command catalog and exact request

| Candidate                                    | V1 disposition / reason                                                                                                                             |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| SET_PARTICIPATION                            | Selected; false/true, existing Person, current linked owner only.                                                                                   |
| Self participation toggle                    | Organizer self is selected; group_member/guest self is PENDING separate authority approval.                                                         |
| LEAVE_TRIP / REJOIN_TRIP                     | Deferred access lifecycle. No alias to participation, unlink or deletion. Current all-path denial/regrant contract is not installed.                |
| LINK_PERSON_TO_ACCOUNT / CLAIM_INVITE        | Deferred. Exact target already exists in legacy claim, but target-specific authorization/consent and immutable recovery are not proven by that RPC. |
| UNLINK_PERSON_FROM_ACCOUNT                   | Deferred remediation policy; no ordinary link reassignment or account/debt ownership rewrite.                                                       |
| Organizer create Person/invite               | Deferred; no new Person IDs, tokens, invite quota/expiry or access grants in this slice.                                                            |
| REMOVE_MEMBER / archive / ownership transfer | Deferred; no hard Person delete or use of destructive legacy remove RPC.                                                                            |

Proposed fixed Backend seams, **not installed routes**:

- POST `/v2/trips/:tripId/persons/:personId/participation-commands`.
- GET `/v2/trips/:tripId/person-participation-operations/:operationId` for the
  Actor's exact historic result; no enumeration/search endpoint.

POST requires bearer authentication and UUID `Idempotency-Key` equal to body
operationId. Exact body keys, all required (reason is nullable):

```json
{
  "contractVersion": 1,
  "command": "SET_PARTICIPATION",
  "operationId": "40000000-0000-4000-8000-000000000001",
  "actorUserId": "30000000-0000-4000-8000-000000000001",
  "actorMemberId": "20000000-0000-4000-8000-000000000002",
  "tripId": "10000000-0000-4000-8000-000000000001",
  "personId": "20000000-0000-4000-8000-000000000001",
  "expectedParticipation": { "isParticipating": true, "revision": 0 },
  "isParticipating": false,
  "reason": null,
  "intentDigest": "<64 lowercase SHA-256 hex characters>"
}
```

Illustrative digest placeholder is not a valid request. IDs must be canonical
lowercase hyphenated UUIDs; route/body/header scope must agree. Actor is derived
from verified session, asserted equal to body actorUserId. actorMemberId is UUID
or null contextual assertion; a UUID must equal the live server-resolved Member.
Null means omitted assertion, not Person-less authority; receipt records resolved
Actor Member. Unknown/duplicate keys, other commands/versions, coercions, -0,
fractional/exponent/unsafe revision tokens, invalid UTF-8/unpaired surrogates and
U+0000 reject before execution. Ingress limit is 32 KiB UTF-8, not a UI limit.

Reason is null or text: strip only leading/trailing ASCII space/tab/CR/LF;
empty becomes null; maximum 2,000 Unicode scalar values after trimming. Preserve
remaining text exactly, no case folding or Unicode normalization. Authoring
persists this normalized body; server requires normalized input rather than
silently changing an attempted operation. No ordinary toggle-specific route,
arbitrary PATCH, generic command bus or retry-generated new key.

## D. Receipt, intent digest and immutable result

Retain I2A F's one `trip_person_participation_receipts` family and unique
**(actor_user_id,idempotency_key)** across Trips/targets. Do not adopt B's
Trip-scoped operation key or broaden A into all membership commands. operationId
is the same key, not a second independent identity column.

I2A receipt fields remain: server receipt id; Trip/Person/Actor/resolved Actor
Member; key; contract_version=1; desired Boolean; observed revision; normalized
reason; request_hash; outcome; prior/result Boolean and revision; committed_at.
Exact I2C additions proposed for a later additive migration are command literal,
codec version, asserted Actor Member input, expected prior Boolean, immutable
result JSON and result hash. These bind the additional request pin and exact
reply; they do not change accepted pair/authorization semantics. No table exists
yet and this document supplies no SQL.

Intent codec version 1 is deliberately a fixed array, not generic JSON sorting.
SHA-256 lowercase hex over UTF-8 bytes, with no BOM or trailing LF:

```text
otr-trip-person-intent-v1\n
[1,"SET_PARTICIPATION",operationId,actorUserId,actorMemberIdOrNull,tripId,personId,expectedBoolean,"expectedRevisionDecimal",desiredBoolean,reasonOrNull]
```

The displayed LF is one byte between prefix and compact JSON array, not a blank
line. Values occupy exactly that order. Revision string is canonical unsigned
ASCII decimal, zero permitted; wire revision is validated number. JSON strings
escape quote/backslash and controls U+0001..001F (lowercase `\u00xx`, with
`\b\t\n\f\r` for their standard controls); slash/non-ASCII scalars remain literal
UTF-8. NULL is literal null. No whitespace between tokens. Header/key and
intentDigest itself are excluded. Backend independently recomputes before DB
dispatch; protected DB entrypoint independently recomputes, not trust client or
Backend hashes. Cross-runtime byte/digest vectors are a required later gate.

Exact immutable `receipt` has these keys only:

```text
receiptVersion: 1
receiptId: server UUID
contractVersion: 1
command: "SET_PARTICIPATION"
operationId: client UUID (= idempotency key)
actorUserId: verified Account UUID
actorMemberId: resolved linked owner Person UUID
tripId: exact Trip UUID
personId: exact target Person UUID
intentDigest: recomputed 64-hex SHA-256
expectedParticipation: {isParticipating: Boolean, revision: safe integer}
desiredParticipation: Boolean
outcome: "APPLIED" | "UNCHANGED" | "REVISION_CONFLICT"
priorParticipation: {isParticipating: Boolean, revision: safe integer}
resultingParticipation: {isParticipating: Boolean, revision: safe integer}
errorCode: null | "PARTICIPATION_REVISION_CONFLICT"
observedAt: YYYY-MM-DDTHH:mm:ss.ffffffZ (UTC)
```

Result digest is SHA-256 of prefix `otr-trip-person-result-v1`, LF, then compact
JSON array of those values in displayed field order; pair objects become
`[Boolean,"revisionDecimal"]`. Same string encoding as intent. Timestamp must
be real UTC with six fractional digits, four-digit year 0001..9999, no leap
seconds or session-timezone dependence. It observes locked evaluation inside
the transaction; I2A storage name committed_at does not promise physical WAL
commit time. receiptId plus resultDigest is an exact historic reference.

Transport envelope has exactly `{receipt,resultDigest,idempotentReplay}`.
receipt and resultDigest never change on replay; envelope replay Boolean can.
First APPLIED/UNCHANGED returns HTTP 201, exact successful replay 200;
REVISION_CONFLICT returns 409 with that same receipt on first/replay. Exact GET
returns 200 for any stored outcome; no receipt is 404 without disclosing other
Actors' operations. Domain outcome is authoritative, not GET HTTP status.
No current-row projection, cursor, complete flag, roster fingerprint or renewed
certificate is returned. Link state is not observed/returned in this command;
later link commands must define exact prior/result link pins and access effects
in their own approved receipt contract before activation.

Mutation and immutable result commit atomically. APPLIED requires exactly one
same-transaction receipt for `(Trip,Person,resultingRevision)`, deferred evidence
validation and immutable update/delete/TRUNCATE denial, including zero-row DML.
UNCHANGED and stale-CAS outcomes are durable receipts with no Member UPDATE.
No IN_PROGRESS row, separate financial audit, receipt expiry or cleanup is added.
As specified by I2A, evidence UUIDs need no new cascading/retention-changing FKs;
identities are validated under transaction locks. RLS/private grants deny API
direct receipt INSERT or broad service-role command execution.

Authorize before key lookup; same key/changed normalized intent rejects without
effect. Matching receipt returns before new CAS/state tests, never writes Member
again, and never advances revision. Later state changes do not alter old replies.
Malformed/auth/missing-target/internal failures do not consume a key. Exhaustion
and inconsistent-base errors likewise roll back without receipts in V1.

## E. Authorization

| Action                                                  | Exact authority / gate                                                                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selected Organizer manage participation, including self | Current authenticated Actor has exact Trip Member with user_id=Actor, status=linked, role=owner. Recheck under locks. Inactive owner remains eligible.                |
| Ordinary self toggle                                    | Not admitted by V1; awaiting change to I2A's owner-only policy.                                                                                                       |
| Self leave/rejoin                                       | Deferred all-path access deny/regrant and last-effective-Organizer policy; no existing permission helper substituted.                                                 |
| Self link/claim                                         | Deferred exact Person-bound authority and claimant consent, same ID, no automatic Organizer promotion. Email/name/general bearer possession is insufficient.          |
| Organizer link/invite/person management                 | Only participation management is selected. Other management needs explicit target consent/admission policy and reviewed compatibility writes.                         |
| Unlink                                                  | Deferred exceptional recovery; no ordinary account or debt reassignment.                                                                                              |
| Invite acceptance                                       | Existing RPC remains legacy. New exact acceptance requires target/purpose/expiry/quota/Account restrictions and atomic consumed authorization+receipt, not activated. |
| Remove/archive/transfer                                 | Deferred; no hard delete or role model change.                                                                                                                        |

Creator-only, legacy admin/member, group_member, guest, cached owner display,
participation state, payer status, link inference or financial balance are not
Organizer authority. Cached roster is never server authorization. On lost owner
authority both new execution and receipt disclosure fail; restored authority can
recover the original receipt. Another Actor cannot replay/lookup that key.

Future gateway must bind verified Actor through fixed typed entrypoints and
actual protected execution identity, not caller GUC/JWT-role impersonation. Keep
I2A writer reserved/closed until reviewed least-privilege gateway, RLS and column
grants, fixed search paths and transition evidence are installed together.
B-T3D's reserved gateway/reader inventories and isolation tests are patterns,
not reusable credentials, writer roles or permission to open A. New execution
must use READ COMMITTED; unsupported isolation rejects before mutation/key use.
Historic authorized read-only recovery must remain possible after feature closure.

## F. Revision, CAS and serialization

Future fixed execution order:

1. Validate ingress, verified Actor and scope; check live owner authority.
2. Serialize `(Actor,key)` using transaction lock plus unique receipt constraint.
   Recheck current authority, then exact immutable replay or changed-intent reject.
3. For new intent acquire activation fence, lock Actor and target Member in stable
   UUID order (same row once); verify Trip ownership and authority again. Deletion,
   link/role update and two-device participation writers must serialize on rows.
4. Compare revision first. Stale revision records unchanged REVISION_CONFLICT,
   even when desired equals current. Equal revision/opposite expected Boolean is
   PARTICIPATION_BASE_INCONSISTENT, never permission to invent a revision.
5. Equal base and equal desired state: UNCHANGED. Equal base and opposite desired:
   APPLIED, exactly r+1; ceiling rejects state change. No-op at ceiling is allowed.
6. Build immutable receipt/result and verify transition evidence in the same
   transaction; any failure rolls back everything before replying.

Same-key contention runs one outcome; changed-body competitor cannot mutate.
Different-key same-base race runs one transition and one stale conflict. ABA
true/r → false/r+1 → true/r+2 remains observable. No silent rebase, reset,
timestamp ordering, LWW, extra row-update for no-op or last-ACTIVE-member guard.
Role is unchanged, so participation does not remove the last Organizer.
Gate closure must use the corresponding exclusive activation fence; an admitted
transaction either commits before closure completes or is denied. Replay is
read-only and does not require reopening mutation capability.

## G. Snapshot, shared cursor and certificate integration

APPLIED changes the complete server participation vector. Every token/certificate
bound to its pre-transition hash is stale, including ABA back to the same Boolean.
Server's existing shared v2 pull must return INVALID_CURSOR before financial page
delivery. UNCHANGED/replay do not themselves change server hash; a newer complete
snapshot may already be valid. Do not falsely claim every replay invalidates all
server tokens. Client receipt application conservatively invalidates its local
certification and requests a new check for either successful outcome.

Command result proves only exact operation and affected Person pair at its
historic observation. It cannot certify presence/absence/count of all Persons,
mint a v2 token or replace a complete-set fingerprint. Never return complete=true
or fabricate a roster by patching a single hash/ID list.

Future local integration must use the existing central reporting cycle tail:

1. Capture immutable Account/Trip/generation before credentials and dispatch.
2. On validated result, append a narrow result-application step to the existing
   same-scope `scopedCycle`/`cycleTails` ordering. Drain earlier admitted refresh
   application before receipt reconciliation; do not join an older `activePulls`
   promise as the post-command refresh. This is a necessary future seam, not a
   current exported helper or a new scheduler/command bus.
3. Under existing `withAccountApplyGate`, one SQLite transaction validates exact
   operation/key/digest/Actor/Trip/Person, stores receipt+result, merges resulting
   pair monotonically, invalidates certification and closes success queue state.
   Expected pending intent is never a canonical row value. Missing local Person
   is not synthesized from a receipt without display metadata; persist result and
   obtain complete bootstrap. Wrong-Trip existing ID rejects the whole application.
4. Clear **all seven certificate columns together**, keeping active shared cursor,
   server_time and every financial row/checkpoint unchanged. Nulling only
   bound_cursor violates migration 43's all-null/all-present CHECK. Because cached
   `ledger_members` rows are shared, invalidate all existing Account certificate
   rows for that Trip when applying a canonical pair. Do not create other Account
   rows or grants. Their prior certificate values/times can be retained as
   historical reconciliation evidence in the originating operation's local result
   metadata for that same Account only, never presented as currently valid
   verification. Do not copy another Account's certificate/cursor into A's result.
5. After commit, request exactly one newly admitted same-scope shared refresh via
   the reporting owner, outside the Account apply gate. Owner still uses saved
   opaque cursor. Missing local certificate or changed server hash takes existing
   INVALID_CURSOR recovery to coherent complete bootstrap; no cursor clearing,
   fabricated zero sequence or financial history rewind. Fresh bootstrap must
   pass the existing finance coherence/monotonic reconciliation checks.
6. Only complete certified bootstrap reinstalls the set and certificate. Lightweight
   verification cannot revive a cleared set. Bootstrap remains <=3 coherence
   attempts; at most one recovery bootstrap per cycle. Failure/churn ends that
   cycle, preserves result/cached reads, and retries at later eligible wake/backoff.

Serialize receipt application with reads to prevent an in-flight pre-command
snapshot from restoring certification after result application. Do not hold the
Account gate over network. Other Account flights are generation-fenced; future
same-scope refreshes start after the result barrier. Restart sees persisted
invalid certification even if the post-commit wake was lost; I2B3 cold/foreground/
reconnect/Trip-entry wakes recover without needing financial queue residue.

Lower resulting revision closes the exact operation without overwriting a newer
cached row; equal/same is neutral; equal/opposite rejects atomically. A stale
historic success is not current state. Conservatively invalidating on first local
consumption remains safe; an already reconciled duplicate result must not re-close
new intent or repeatedly invalidate/refresh solely because a callback repeats.
REVISION_CONFLICT stores conflict/result and can merge its observed pair under the
same monotonic rules; it never completes the desired mutation or renews freshness.

Private-payment v1 cursor is independent and is never cleared, promoted or bound
to the participation digest. Existing reporting owner may independently refresh
private data with its normal authorization; participation does not alter it.

## H. Offline intent and read-your-write

Offline authoring persists normalized command, originating Account/Trip/Person,
stable key/digest, known prior pair and desired Boolean in the existing durable
queue through a repository transaction. Cache participation remains last observed
canonical truth. V1 allows a distinct pending-intent overlay only; no optimistic
canonical revision+1 or direct feature SQLite write. Feature owns no retry lifecycle.
Missing prior pair cannot author accepted CAS; first obtain an observation.

Across restart/retry use identical body/key/base. Existing worker leases/due-time/
backoff/auth pause apply; no new timer or infrastructure. Stale base becomes
explicit conflict. Fresh observation and explicit new choice create a new key,
never silent replacement/rebase of an attempted operation. Sequential opposite
intents wait for the prior operation's exact outcome and newly observed base;
ambiguous response loss is not a reason to issue an opposite command.

Response loss retries same command or exact operation lookup. Row equality,
email/name or a later bootstrap cannot prove that operation committed. Immutable
receipt can close its queue item while a newer cached pair remains unchanged.
After valid result, row/result/queue disposition/certificate invalidation commit
atomically; local failure preserves unresolved operation for exact recovery.
Refresh failure cannot undo accepted receipt, replace valid Account installation,
force login, delete offline cache or label desired state accepted.

Capture Account/Trip/generation before credentials, check after asynchronous auth,
before dispatch/retry, after parsing, at transaction entry and through commit under
the shared transition gate. Response from old A generation after A→B→A is rejected
even though Account UUID matches again; it cannot apply or finish queue work.
Durable A operation survives for new authorized A recovery with same key/digest.
B cannot replay/reassign it or inherit A actor/certificate/private context.

No self-leave UI is created. Future access leave must display its actual admission
effect under approved policy; pending/offline leave does not invent server denial,
and travel deactivation cannot be labeled leave. Valid cached offline Trip access
survives pending participation sync and token expiry. Existing explicit known
server denial policy remains separate; no new deletion/logout policy is selected.

## I. Legacy access compatibility

| Current source                  | Fact / V1 treatment                                                                                                                                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| journey_members                 | V1 changes only target pair; preserves ID, user_id, role, status, display name, linked_at and all relationships. Existing timestamp trigger may touch generic updated_at; it is not participation ordering.          |
| trip_members                    | Backend read permits any row; write also permits any legacy membership row. SQL helpers use membership/creator, or owner/admin for management. V1 makes no compatibility row update.                                 |
| trips.created_by                | Backend read/write and SQL creator bypass survive membership deletion; participation does not override them. Creator-only cannot use this new command.                                                               |
| canReadTrip / canWriteTrip      | OR of creator, legacy membership, qualifying linked Member. Pair is not referenced, so false does not revoke read/write.                                                                                             |
| canFinalizeSettlement / finance | Existing linked owner test, not participation. Inactive Organizer retains current authority; no finance filter/recalculation is introduced.                                                                          |
| claim_journey_member            | Exact target ID, but general member/creator authority, existing identity collision test, linked update, and legacy owner/member projection; not new target-specific consent or receipt proof.                        |
| claim_email_invited_journeys    | Iterates email matches, removed markers and identity collision checks; updates same Member and creates legacy row. Not exact intent recovery.                                                                        |
| accept_journey_invite           | Legacy membership returns already_member before Person claim; email matching then display-name=email fallback; may insert a Person and update quota. Not Person identity proof.                                      |
| remove_journey_member           | Deletes legacy membership, adds removal marker, may revoke email invites, physically deletes Member; last-owner check counts role rows. RESTRICT/canonical guards may roll back. Never used for V1 leave/deactivate. |

I2A ordinary-write guard preserves pair through claim/link/notes/upserts; a real
new legacy Person initializes true/0 and complete-vector checks detect set change.
Existing Person claim/link does not advance participation revision or hash if ID
set/pair remain unchanged. The certificate intentionally does not certify link,
role, display or access freshness. A future new link command must separately
refresh Actor/admission/private projections, even if shared fingerprint matches.

New link/claim compatibility would require atomic exact Member link plus reviewed
trip_members projection and side-effect inventory (including historical private
payment read grants). No role inheritance or removal-marker deletion is approved
here. Unlink alone cannot revoke creator/legacy paths. Real leave/rejoin requires
all-path deny precedence, explicit regrant, effective last-Organizer safety and
private-grant retention review. These are blocking dependencies for those deferred
actions; participation-only V1 has no access-revocation ambiguity to resolve.

## J. Track B participant boundary

Future Event selection consumes exact same-Trip Person IDs and a separate, valid
complete observation. Cached retained list includes inactive/historical IDs and
is not current candidate proof. Unknown/stale state is not implicitly active.
WHOLE_GROUP must persist the concrete reviewed selected ID set under Event's own
semantic CAS/receipt, never empty=everyone or a dynamic roster subscription.

Participation changes do not mutate existing Event participants, Event semantic
revision, authored whole-group set, reservations or financial Expense participants.
Historic inactive IDs remain valid and resolvable. Future selection must define
freshness validation at command admission/concurrency, not trust a mobile timestamp
or unsigned cursor as permission. B-T3D first scope remains UNASSIGNED with its
gate CLOSED. Enabling A participation cannot enable ASSIGNED/WHOLE_GROUP or C's
domain adapter. C source names/emails/uploader identity cannot choose a Person.

## K. Errors and retry disposition

| Error / HTTP                                                                | Receipt and behavior                                                                                                                                   |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| INVALID_PARTICIPATION_COMMAND / 400                                         | No receipt; malformed/version/key/digest/body/scope/numeric validation failure; correct authoring explicitly.                                          |
| UNAUTHENTICATED / 401                                                       | No receipt; pause auth, keep cached valid offline session policy.                                                                                      |
| PARTICIPATION_FORBIDDEN / 403                                               | No receipt/disclosure; current owner authority absent, including replay.                                                                               |
| PERSON_NOT_FOUND / 404                                                      | No new receipt; admitted exact target missing or wrong Trip, no foreign identity enumeration. Historic authorized receipt recovery may outlive target. |
| OPERATION_NOT_FOUND / 404                                                   | Exact own scoped lookup absent; not proof a concurrent uncommitted request failed.                                                                     |
| IDEMPOTENCY_KEY_REUSED / 409                                                | Existing key changed intent/Trip/target; no mutation or replacement receipt.                                                                           |
| PARTICIPATION_REVISION_CONFLICT / 409                                       | Immutable conflict receipt; actual unchanged pair, no silent retry with new base.                                                                      |
| PARTICIPATION_BASE_INCONSISTENT / 409                                       | No receipt; equal revision/opposite expected Boolean requires evidence diagnosis.                                                                      |
| PARTICIPATION_REVISION_EXHAUSTED / 409                                      | No receipt/effect; no wrapping or revision reset.                                                                                                      |
| PARTICIPATION_COMMANDS_DISABLED / 503                                       | New operation not consumed; retry only under reviewed capability. Exact authorized historic reads remain allowed.                                      |
| PARTICIPATION_ISOLATION_UNSUPPORTED / 400                                   | New execution rejected before key use; READ COMMITTED required.                                                                                        |
| INVALID_CURSOR / 400                                                        | Read-side recovery through existing owner only; not lifecycle command failure or conflict.                                                             |
| PARTICIPATION_SNAPSHOT_INVALID / 500; PARTICIPATION_SNAPSHOT_UNSTABLE / 503 | Existing I2B rules; no certificate from invalid/unstable source.                                                                                       |
| Network/timeout/429/unknown 5xx/invalid response                            | Ambiguous command outcome: same-key exact recovery under existing retry policy, no locally invented acceptance.                                        |

Account-generation mismatch or local equal-version contradictory result is a
local application rejection: no row, queue, actor, certificate or cursor commit.
Do not report it as server rejection or manufacture a replacement operation.
Only explicitly registered stable codes become terminal/conflict/auth pause;
the existing classifier must be extended narrowly in a separately approved slice.

## L. Golden cases — future runnable acceptance

These are specified outcomes, **not executed lifecycle tests**. P is one exact
Person, U an admitted linked owner, K a stable operation key, r a known revision.

| #   | Case                                           | Required result                                                                                                              |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | Active→inactive                                | true/r becomes false/r+1, one APPLIED receipt/audit.                                                                         |
| 2   | Inactive→active                                | false/r becomes true/r+1, same Person ID.                                                                                    |
| 3   | ABA                                            | true/r→false/r+1→true/r+2; old vector/token differs.                                                                         |
| 4   | Stale base, desired already current            | REVISION_CONFLICT before no-op; pair unchanged.                                                                              |
| 5   | Same key/same intent replay                    | Original receipt/digest/time; zero additional transitions.                                                                   |
| 6   | Same key/changed intent or Trip                | IDEMPOTENCY_KEY_REUSED; original evidence untouched.                                                                         |
| 7   | Committed response lost                        | Restart exact K retry recovers original success, no second increment.                                                        |
| 8   | Account A→B→A                                  | Old response cannot apply or complete queue; new A can recover K.                                                            |
| 9   | Old shared cursor after APPLIED                | INVALID_CURSOR before financial page, one complete recovery.                                                                 |
| 10  | Complete bootstrap after success               | Exact set/hash/v2 binding and row/result coherence; certificate reinstated atomically.                                       |
| 11  | Newer cached row                               | Historical result closes only its operation; newer pair remains.                                                             |
| 12  | Stale result after opposite transition         | No old Boolean restoration; exact historic receipt distinct from current pair.                                               |
| 13  | Certificate invalidation                       | All seven fields clear together, active financial cursor preserved; one row never certifies set.                             |
| 14  | Zero financial changes                         | Expense/splits/valuations/finalized Settlement/Adjustment/Review/FX/grants/digests and feed sequence identical before/after. |
| 15  | Two devices, different keys/same base          | One APPLIED, one immutable stale conflict; no double increment.                                                              |
| 16  | Leave/rejoin race request                      | Both outside V1; no delete, unlink, role/access grant or participation alias. Future access CAS required.                    |
| 17  | Exact link request                             | Deferred; cannot call legacy claim and label it receipt-backed success; future target retains ID/pair.                       |
| 18  | Duplicate claim/two Accounts                   | Deferred; future exact target authorization and unique Trip/Account enforce one link; no identity inference.                 |
| 19  | Person in wrong Trip                           | Reject exact scope without target mutation or foreign evidence disclosure.                                                   |
| 20  | Name/email collision                           | Two IDs stay separate; neither input chooses target/Actor.                                                                   |
| 21  | Legacy access after false                      | creator/legacy/linked-role predicates retain current results; no trip_members update.                                        |
| 22  | Inactive historical Expense Person             | Same financial references and values remain valid/resolvable.                                                                |
| 23  | Unauthorized Organizer action                  | Cached owner, creator-only, legacy admin or group_member denied; no receipt/effect.                                          |
| 24  | Private cursor                                 | Original v1 checkpoint unchanged; no shared digest or reset.                                                                 |
| 25  | Exact same-value new command                   | UNCHANGED receipt, no UPDATE/revision/audit; conservative local refresh only.                                                |
| 26  | Max revision                                   | Flip rejects atomically; exact-base no-op succeeds.                                                                          |
| 27  | Equal revision/opposite Boolean                | Base/result evidence rejected, no LWW.                                                                                       |
| 28  | Receipt insert/constraint failure              | Member transition rolls back; no orphan audit/result.                                                                        |
| 29  | Concurrent same key                            | One immutable outcome; changed-body competitor rejected.                                                                     |
| 30  | Owner link/role loss during command            | Lock/recheck determines legal serialization; replay disclosure requires current owner.                                       |
| 31  | Pre-command snapshot already in flight         | Existing cycle drains before result apply; cannot restore certificate afterward.                                             |
| 32  | Kill after local result commit, before refresh | Result+queue disposition+invalid certificate survive; existing cold/wake owner bootstraps.                                   |
| 33  | Restart offline/token expired                  | Known pair and pending intent readable; no network re-auth launch block.                                                     |
| 34  | Shared row used by two cached Accounts         | All existing Trip certificates invalidated; no B grants/context; stale flights fenced.                                       |
| 35  | Result for missing cached Person               | Store exact result, no invented display row/complete set; bootstrap hydrates metadata.                                       |
| 36  | Repeated cursor churn                          | One recovery/cycle, <=3 bootstrap attempts, then stop/backoff; financial commits retained.                                   |
| 37  | Old backend missing certificate                | Preserve observations; cannot renew complete freshness or advertise command support.                                         |
| 38  | Gate closure/runtime bypass                    | Current role/GUC spoof/direct service DML denied; admitted command/close serialize; historic read remains authorized.        |
| 39  | Ordinary legacy claim on inactive Person       | Same ID and false/r preserved; no participation transition or renewed link certificate.                                      |
| 40  | Future WHOLE_GROUP dependency                  | No mutation activated; concrete set required; existing Event set/revision unchanged.                                         |
| 41  | Receipt hash under different DB timezone       | Exact UTC result bytes/digest remain equal; no millisecond truncation.                                                       |
| 42  | Local commit/account switch race               | Same Account apply gate covers COMMIT/rollback; stale scope cannot write or finish.                                          |

## M. Activation and rollback

1. Human and independent review accept selected scope, codec/result additions,
   owner-only policy and read-side invalidation barrier. No implementation follows
   automatically from this contract.
2. Separately approve additive A receipt/guard/gateway migration. Keep command
   gate CLOSED and reserved writer without runtime capability while proving exact
   role inventories, immutability, evidence, isolation, CAS and concurrency locally.
3. Implement fixed Backend transport/auth/receipt recovery and independently
   recomputed codec only after authorization. No broad service-role direct mutation.
4. Implement minimum repository/global-queue typed intent, exact result apply and
   existing reporting-cycle seam; test Account transitions through commit, response
   loss/restart, migration-43 CHECK and certificate recovery with real SQLite.
5. Prove clean full-chain replays/manifests, populated forward compatibility,
   existing SQL/security/A/B/C/financial regressions and all applicable golden cases.
   Reuse accepted test helpers. Historical full-suite architecture-boundary failure
   is not waived or claimed fixed by this document; review readiness explicitly.
6. Advertise only explicitly enabled `tripPersonParticipationCommandsV1` with
   contractVersion=1 and SET_PARTICIPATION after local and Mobile acceptance/review.
   Missing/unknown capability means disabled, no legacy fallback. UI requires
   separate authorization and UI-foundation/glossary validation before creation.
7. Hosted Dev access/deployment requires separate approval. Production is excluded.
   All deferred access/link/invite/Event participant families remain closed.

Rollback closes new execution/advertisement and pauses new sends while retaining
Member pair, revisions, receipts, pending intent and nullable local mirror. Exact
authorized historic recovery remains available. Do not drop columns/evidence,
reset pair/sequence, restore permissive writes or delete Persons. Old readers keep
I2A/I2B bounded compatibility. Uncertain operations remain durable for recovery;
feature disable is not proof of failure or acceptance.

## N. Risks and blockers

| Item                                                | Status / consequence                                                                                                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selected owner-only participation scope             | Defined and compatible; approval PENDING. No access-revocation policy is invented.                                                                                                |
| Ordinary traveller self-toggle                      | PENDING policy extension; cannot activate using current I2A authority.                                                                                                            |
| Access leave/rejoin/revoke                          | BLOCKED for deferred activation: no installed all-path denial/regrant, creator bypass and private-grant policy unresolved. Stop that work rather than aliasing false to leave.    |
| Exact link/claim/invite/unlink                      | BLOCKED for deferred activation: consent/target proof, role projection, private-history grants and immutable link/access CAS contract absent. Legacy RPCs do not fill those gaps. |
| Exact receipt codec/gateway and transition evidence | PENDING separately approved implementation; no receipt table/entrypoint exists.                                                                                                   |
| Central result barrier and all-seven invalidation   | PENDING implementation. Existing primitives suffice but do not already expose the required result step.                                                                           |
| Live grants/external writers/deployed parity        | UNKNOWN; remote access not required for this contract. Deployment review must obtain separate authority or stay blocked.                                                          |
| Device/server convergence acceptance                | I2B3 physical cases remain PARTIAL/PENDING; no new command/device acceptance is claimed.                                                                                          |
| Full-suite baseline boundary violation              | Historical blocker in LedgerExpenseDetailScreen API import; unchanged, no unrelated fix here.                                                                                     |
| Event participant selection                         | Deferred separately reviewed B/A dependency; no dynamic roster or new role workaround.                                                                                            |

If selected participation implementation proves to require access revocation,
destructive legacy redesign, financial edits, Event activation, falsely complete
single-row results or remote access to choose policy, STOP and report. Deferred
policy seams do not authorize those actions and do not block delivering this
participation-only reviewable contract.

## O. Acceptance matrix and completion evidence

| #   | Contract/preflight criterion                                  | Evidence                          | Result  |
| --- | ------------------------------------------------------------- | --------------------------------- | ------- |
| 1   | Exact clean startup baseline and sibling boundary             | Startup Git checks                | PASS    |
| 2   | Smallest compatible V1 and deferred catalog                   | A/C/E                             | PASS    |
| 3   | Identity, pins and ID allocation                              | B/C                               | PASS    |
| 4   | Immutable Actor-scoped command correlation                    | C/D                               | PASS    |
| 5   | Narrow receipt family, no Ledger reuse                        | A/D                               | PASS    |
| 6   | Exact request/intent/result serialization                     | C/D                               | PASS    |
| 7   | Atomic mutation/outcome and response-loss recovery            | D/F/H                             | PASS    |
| 8   | Separate authority for each action                            | E/I/N                             | PASS    |
| 9   | CAS/no-op/stale/ABA/exhaustion/races                          | B/F/L                             | PASS    |
| 10  | Single-row result cannot certify roster                       | G                                 | PASS    |
| 11  | Seven-field invalidation, financial checkpoint retained       | G, migration 43/saveCursor source | PASS    |
| 12  | Central serialized refresh/barrier and bounded recovery       | G, current reporting owner        | PASS    |
| 13  | Monotonic read-your-write and stale result rules              | G/H                               | PASS    |
| 14  | Durable offline intent, no silent rebase                      | H                                 | PASS    |
| 15  | Account/generation/COMMIT isolation                           | G/H, existing transition gate     | PASS    |
| 16  | Legacy rows/access/claim compatibility audit                  | I, gateway/baseline RPCs/guard    | PASS    |
| 17  | Financial/private-cursor non-interference                     | G/I/L14/L24                       | PASS    |
| 18  | Track B/C dependency without activation                       | J                                 | PASS    |
| 19  | At least 24 golden cases                                      | L: 42 specified cases             | PASS    |
| 20  | Stable errors and retry disposition                           | K                                 | PASS    |
| 21  | Safe activation/rollback and explicit stop seams              | M/N                               | PASS    |
| 22  | This task changes one document, no remote/runtime action      | Own tool writes and scope checks  | PASS    |
| 23  | Human + independent contract approval                         | Future checkpoint                 | PENDING |
| 24  | Executable codec/security/CAS/SQLite/queue/barrier acceptance | No implementation authorized      | PENDING |
| 25  | Device and rollout/deployment acceptance                      | Separate authorization/evidence   | PENDING |

Totals for this selected contract/preflight matrix: **22 PASS / 3 PENDING /
0 BLOCKED**. Deferred access/link activation blockers in N are outside this
matrix; this is not FULL PASS or activation readiness. Golden cases are design
obligations, not executed test counts.

Validation for this document: scoped source/contract inspection; section/golden/
matrix count and local reference checks; scoped Prettier, new-file whitespace,
Git HEAD/status/diff scope and sibling-status checks. No runtime suite or database
replay is needed for this design-only delivery. Current-state/ADR remain unchanged
under the exact one-document instruction.

Closing scope exception: startup was clean, but during final validation an
untracked `supabase/migrations/20261004000500_trip_source_command_foundation.sql`
appeared in canonical. Temporal also acquired modified `backend/src/app.ts`,
`backend/src/supabaseGateway.ts`, `docs/API_CONTRACT.md` and new
`backend/src/tripCanonicalRead.ts`, `src/data/api/tripCanonicalReadContracts.ts`,
`src/data/api/tripCanonicalReadTransport.ts`. Import remained clean at that check.
These writes were not performed by this task; they were not edited, deleted,
staged or adopted as authority. HEAD remained the exact startup baseline. Global
closing worktree cleanliness cannot be certified while concurrent work proceeds;
this is separate from the document coverage totals. Stop after this document's
local validation, with no implementation/commit. The attestations below describe
this task's actions, not the concurrent worktrees' aggregate state.

Production accessed: **NO**. Hosted Dev accessed/mutated: **NO**.
SQL/migration/code changed: **NO**. Lifecycle command enabled: **NO**.
Event participant command enabled: **NO**. Sibling worktrees modified: **NO**.
Deployment performed: **NO**. Commit: **NO**.

**STOP — A1-I2C1 CONTRACT / PREFLIGHT COMPLETE — REVIEW PENDING.**
