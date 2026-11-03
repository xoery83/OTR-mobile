# AUTH-C04 one-member revoke consumption packet

CONTRACT ONLY. No business operation, SQL install or runtime activation authorized.
Existing Core candidates66497/67e374 and Root1's current10e35b2e gap return are the
starting point; do not introduce a separate Auth receipt store or membership model.

## Approved authority and retained identity

Root1 current policy: exactly one valid linked journey_members.role=owner may
remove a non-Owner in that same Trip. No Organizer, legacy admin, Item Creator,
historical trips.created_by fallback or ownership transfer is granted. The old
66497 intersection with creator was provisional and is not the final predicate.
Reject self/Owner/foreignTrip/foreignPerson/Account mismatch/inactive/ambiguous/
denied caller. Bind trusted normal Session to Actor server-side, never payload.
This fixture's actual A is linkedowner and B linkedgroup_member. Preserve Person
ID, Account link, role, participation and history; revoke Trip access, not Account
login, Person identity, Ledger participant or Item Creator. No automatic regrant,
account reconnect, deletion or date/time-policy invention is part of this slice.

## Exact version/receipt transition

Fixture metadata observed epoch4907c5b0/revision4/accessRevision4. It is not a
normal Reader success or permission grant. Before execution re-read current Owner
qualification and the actual Core reference; use TRIP_ACCESS baseVector revision
from accessRevision, not general revision/participation/Auth authorizationRevision.
Do not manufacture after=5: producer returns actual same epoch and strictly
advanced revision/accessRevision for a new denial; no-change keeps reference.
Reuse existing v2 canonical hash/envelope/operation identity. A Person is not an
Item, and no Item baseVector or fake Person revision may represent this mutation.
The candidate67e schema is still rejected by production; it must be formally
incorporated by Core before consumption. Reuse67e's distinct10/7 unit reference
case to detect mixing general revision and accessRevision; do not rerun old tests.

Atomicity covers Owner/target observation, operation identity, membership denial,
actual Core invalidation and immutable receipt. Failure before commit rolls all
back. ACK loss preserves the original command/digest/operation and queries only
its original receipt; absent receipt is not NoCommit. Confirmed duplicate returns
the same receipt without another accessRevision advance. Conflicting stale
epoch/vector or rebound Actor/Person/Account/intent is rejected. A recovered old
Claim LINKED receipt never proves current access or clears denial.

## Read denial and existing Native cache

Current read-scope helper denies removed users, but a generic404/503, a closed
capability, network timeout or logout is not a formal revocation observation.
Core must supply a B-authenticated, sameTrip authoritative access-loss result with
actual Core epoch/accessRevision; whether as a minimal existing Reader error
extension or owning observation port is for Core to fix. Do not invent a public
route in Auth. Foreign account C cannot obtain a revocation record from a known
Trip UUID. Data reads and original receipt recovery must reject revoked B.

On verified access loss, Native consumes its OWN B AccountRequestContext and
existing createTripCoreV2Repository.revoke(ctx, actualAfter.accessRevision). That
existing apply-gated transaction marks account/trip scope revoked, increments its
refresh generation, fences late work and blocks pending Core queue operations.
Do not apply A's receipt under B's SQLite context, use a separate native revoke
number, delete SQLite or infer revocation from connectivity. Normal B own other
Trips/global private Profile remain unaffected. Existing offline behavior remains
until an explicit legal denial is observed; this is not a new offline grant.

Required cache fixture: install legal pre-revoke B snapshot → revoke metadata
observed by normal B → acceptedSnapshot/projection/roster denied → deliver delayed
old snapshot/old Claim receipt → neither reinstalls access → App restart remains
denied. Account switch late responses must not affect a different scope. No
regrant implementation requested; old lease/generation never self-reactivates.

## Join/revoke ordering and negatives

Serialize Trip/Owner/target/operation/denial consistently with Claim and readers.
An earlier in-flight snapshot may complete before a committed revoke; its late
network delivery must fail the Native fence. A join racing revoke must not erase
a later denial. Existing legacy invite acceptance may clear a removed marker;
that is an owning gap, not a valid implicit regrant. Old/pending invites or old
Claim receipts must not restore B access; keep regrant closed pending its contract.

After actual revoke require authoritative denied reads for B across collection,
item, discovery/access and receipt recovery; separate private Source/Document/
Ledger owning grants remain enforced. Invite revoke is not member revoke. Do not
claim stronger all-product revocation than verified. Owner A retains legal reads,
B unrelated ownTrip still works, wrong/nonOwner/Owner-target attempts have no
transition. No price, entitlement or Provider consumption enters this slice.

## Ownership and acceptance

Auth owns this normal A/B fixture, consumer/UNKNOWN retention and E2E coordination.
Root1 owns formal Core command/receipt/atomic PG/read denial and shared source.
Native owns existing cache/UI caller and cold recovery. Root2 owns exact protected
install/deploy/fresh preimage/rollback; no existing Gate is reused by this packet.
First complete current Hosted Member Read, then execute Revoke only after the
formal port, independent Review and applicable exact execution qualification.
