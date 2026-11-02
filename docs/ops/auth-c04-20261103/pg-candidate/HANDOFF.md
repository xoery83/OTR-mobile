# AUTH-C04 registered directed invite — PG integration candidate

Golden Slice: original Trip Owner A invites exact registered Account B to an
existing never-linked Trip Person. B explicitly claims through normal Auth, the
same transaction writes the existing canonical connection and immutable receipt,
and current Core membership is read back. Account C cannot claim B's invitation.
No names, emails, AKA or provider identity matching is used.

## Existing pipeline and files

`createTripMemberClaimPgPort(existing CorePgConnection, {inviteExpiresAt})` implements
existing `MemberClaimAuthorityPort`; existing `executeMemberClaim`, HTTP boundary
and `recoverMemberClaimReceipt` remain the command/receipt owners. No second
Session, repository, membership table or sync engine is added. Reuses existing
`journey_invites`, `journey_members` and `trip_core_lock_actor_scope`; it never writes
`trip_members`, roles, Creator, visibility, Ledger or private Profile data.

Server configuration explicitly supplies the invitation deadline. Native cannot
choose it, and this candidate defines no production invitation lifetime policy.
No runtime port is mounted; absent port stays closed. Root owns shared Bootstrap,
Core role composition and Hosted SQL. Native owns its shared UI/navigation.

## Atomicity and actual local proof

Same held connection: BEGIN, bounded lock/statement timeouts, trusted Actor/Trip
scope, canonical Trip row lock, current normal/enabled Auth user check, all facts,
conditional connection, receipt, post-write Core access, COMMIT. The private target
extension binds Invite/Trip/Person/Account/current original Owner; receipts are
immutable and recover only the original actor/operation. Whole-method pending work,
caught validation failures and escaped methods cannot commit or keep issuing SQL.
Unknown COMMIT retires the lease and is not retried.

Real PostgreSQL tests include original receipt recovery after COMMIT succeeds but
its acknowledgement is deliberately lost; real receipt-trigger failure rollback;
held two-connection Claim/Revoke in both orders, two-Person competing claims and
concurrent same-op duplicates; expiration; foreign Account; raw missing/null kind;
function/table ACL negatives; immutable receipts. Claim raises Core access revision
from a baseline read immediately before Claim. The isolated administrative unlink
only tests loss observation/old receipt returning NONE: it is NOT a production
remove-member API or proof of approved Reset/revoke.

Runner: `python3 scripts/auth/member-claim-isolated-pg.py`. Fixed existing local
Colima Unix endpoint and cached image, network none, 256MB/1CPU, owned random
container, bounded execution and cleanup. It rejects Docker endpoint/config overrides.
`ISOLATED_PG_RESULT.json` binds current SQL hash and actual cleanup result. No JWT
forgery, real Provider login, Hosted SQL or device operation is certified by this test.

## Legacy compatibility and precise protected difference

The existing legacy `accept_journey_invite` accepts active bearer links. Therefore
these directed records are created permanently legacy-inactive; the new dispatcher
uses the private target status and existing expiry. A mapped-row-only trigger on
`journey_invites` blocks legacy reactivation/metadata edits/deletion. Core gateway
can only advance usage at most once, with other legacy fields frozen. Unmapped
legacy records retain their original behavior. Token bytes are never returned.

Exact candidate: two empty private tables (target extension and receipt), two RLS
enables with zero policies, three functions, two triggers (one on the existing
`journey_invites`), one EXECUTE to the existing NOLOGIN Core gateway. No new role,
role membership, direct table privilege, RLS relaxation or business-data migration.
Install requires exact DEV marker/absence/dependencies and validates owners/ACLs.
Root must independently verify actual DEV project and fresh preimage; a SQL GUC
is a guard, never proof of which Hosted project is selected.

## Deliberately still closed / missing

Only original Owner + registered target + never-linked Person is qualified.
Delegated Organizer, unregistered identity confirmation, general link/QR, Reject,
Choose Another/Create New, Switch/Reset and member removal remain unqualified.
Previously linked Persons are rejected so this cannot bypass cutoff/reconnect rules.
Do not equate unclaimed invite revoke with revoking an accepted member.

Hosted object/ACL/Auth metadata preflight and exact Owner permission approval are
pending. No actual normal A/B Hosted login/claim, Item visibility negative, Native
Invite entry, cross-account cold restore or formal member removal PASS exists.
`PREFLIGHT_READONLY.sql` targets only exact synthetic registration/membership cases
and owning catalog metadata; no token/session/password fields are selected.
