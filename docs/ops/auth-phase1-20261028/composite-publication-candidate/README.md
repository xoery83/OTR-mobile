# Guest composite publication candidate — 30 October

NOT MOUNTED / NOT AUTHORIZED FOR DEV EXECUTION / NOT ADOPTION PASS.
Native's unique Writer delegated only new `backend/src/guestAdoptionComposite*.ts`,
their tests and this directory. Existing Core/TripCreate/Metadata/principal code,
roles, grants and public registration remain untouched.

The first internal step qualifies the existing frozen schema74 source against a
owning locked staging row's preflight grant and exact preparation SHA, plus the
trusted normal Account. Consume the existing immutable v3 PREPARED checkpoint,
revalidate canonical bytes/SHA/size, pin adoption/target/Guest/inventory to the
grant, require drafts empty and validate the full source. The owning staging row
must have bound that exact preparation hash; a request-supplied grant/hash is not
an authorized staging row. Its storage/authority is still unimplemented. It retains exact source
canonical bytes/hash and every original operation/queue identity. This plan is
not a grant, reservation, staging receipt or publication capability. File or live
Draft counts above zero reject the entire candidate, never omit those resources.
The current plan covers the saved, fileless Golden A Trip/P1 dataset only.

## Exact delegated operation set for Core review

- Existing owning Trip Create, with original Trip/create operation UUID and full
  original metadata; a collision rejects the entire dataset.
- Existing Person Create for each explicitly local Person, preserving Person and
  operation UUID. Never connect these people by name/email. The source creator
  must map explicitly to the owning Trip Create's actual linked owner Person.
- Owning Ledger initializer preserving the source currency, scale, valuation
  policy and source names; do not silently substitute current normal defaults.
- Every retained deferred Metadata action, in its original dependency order.
  Read and CAS the actual owning metadata revision inside the same transaction;
  no synthetic conversion of an old queued V1 revision.
- Only CREATE_ITEM(P1), SET_ITEM_TEXT, SET_ITEM_SCHEDULE, SET_ITEM_PLACE,
  SET_ITEM_PARTICIPATION through existing executeCoreCommandV2. Validate all
  participation/ACL Person references against that exact source Trip's people.
  Resolve explicit creator mapping after owning Trip initialization. Preserve the
  original source command/hash separately from the mapped server command/hash;
  stable operation IDs and both hashes must bind retry and final dataset receipt.

## Same-transaction requirements, still unimplemented

The actual adapter must lock an Account/adoption/source/inventory/grant/manifest
record, revalidate current entitlement and explicit existing-target confirmation,
reserve any approved limits, and reject another terminal outcome before mutation.
Unknown pricing/limits remain unenforced; this plan invents no entitlement policy.
One transaction must include all owning Trip/Person/Ledger/Metadata/Core writes,
all operation receipts, source→target identity maps, queue/dependency maps and the
final immutable dataset receipt. A Core CONFLICT/REJECTED/status-only result fails
publication and rolls everything back. No partial remote Trip shell is visible.
Commit response loss requires the same authenticated status/receipt readback.
Cancel must race on the same lock and produce an immutable mutually exclusive
cancellation receipt. Source locks cannot release from NOT_FOUND or a timeout.

The current three session_user fences cannot authorize this transaction. Core
Writer must review the exact minimal protected function/role/ACL delta before an
isolated PG candidate and Owner execution Gate; do not SET SESSION AUTHORIZATION,
borrow service_role, widen normal General RPCs or stitch multiple HTTP commits.
No SQL install or production access is performed by the plan tests.

## Private staging storage candidate

`staging.local.sql` is deliberately guarded by a disposable database-name prefix
and explicit fixture marker. It cannot be installed in the Hosted database. It
creates an owner-only, RLS-enabled schema/table with no policy, public RPC or
runtime grants. Existing principal/role contracts remain unchanged. Stored exact
plans/preparations and their hashes are immutable; adoption ID collisions never
replace an Account or source. This is private staging persistence, not a terminal
publication/cancellation receipt or Trip write.

`guestAdoptionCompositeStage.ts` uses the existing CorePgConnection lease and one
transaction, parameterized insert/readback and same-Account exact-retry checks.
Its trusted binding must eventually come from the owning locked server grant and
fully qualified sealed transfer; no mounted caller or binding issuer exists now.
Any COMMIT attempt followed by callback, outer deadline or cleanup failure remains
UNKNOWN. Outer scope expiration blocks a late pending callback from committing.
The same adoption ID must be retained for recovery, never replaced after UNKNOWN.

`staging_local_pg.py` creates and destroys one dedicated network-none256MB fixture.
It tests actual SQL hash/immutability/ACL/rollback and concurrent collision only.
The old fixture lacks the three newer Gateway roles, recorded as untested rather
than creating roles or claiming their normal permission checks passed. No normal
OTP/JWT, Hosted session, business publication, Supabase readback or Native Adoption
is certified by these local component tests.
