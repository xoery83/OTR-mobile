# Guest composite publication candidate — 30 October

NOT MOUNTED / NOT AUTHORIZED FOR DEV EXECUTION / NOT ADOPTION PASS.
Native's unique Writer delegated only new `backend/src/guestAdoptionComposite*.ts`,
their tests and this directory. Existing Core/TripCreate/Metadata/principal code,
roles, grants and public registration remain untouched.

The first internal step qualifies the existing frozen schema74 source against a
owning locked staging row's preflight grant and exact preparation SHA, plus the
trusted normal Account. Consume the existing immutable v3 PREPARED checkpoint,
revalidate canonical bytes/SHA/size, pin adoption/target/Guest/inventory to the
grant and validate the full source. Version1 plans have no drafts; version2 plans
retain all drafts after the same pure journal codec verifies their identities,
canonical bytes, hashes, sizes and scope. Grant liveDraft counts must match. The owning staging row
must have bound that exact preparation hash; a request-supplied grant/hash is not
an authorized staging row. Its storage/authority is still unimplemented. It retains exact source
canonical bytes/hash and every original operation/queue identity. This plan is
not a grant, reservation, staging receipt or publication capability. Nonzero registered file counts or unqualified photo references reject the entire
candidate, never omit those resources. The current fileless Trip/P1 source may
carry raw valid Drafts as private recovery material only; no additional published
Trip shell, Item, quota grant or post-Adoption restore qualification is implied.

## Exact delegated operation set for Core review

- Existing owning Trip Create, with original Trip/create operation UUID and full
  original metadata; a collision rejects the entire dataset.
- Existing Person Create for each explicitly local Person, preserving Person and
  operation UUID. Never connect these people by name/email. The source creator
  must map explicitly to the owning Trip Create's actual linked owner Person.
- Owning Ledger initializer preserving the source currency, scale, valuation
  policy; title/dates follow the final owning Trip. Retain the original local
  Ledger cache row separately; do not substitute defaults or backdate server settings.
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

## Private stage readback candidate

`guestAdoptionCompositeStatus.ts` implements the existing status port for private
staging existence only. The normal boundary supplies the authenticated actor;
strict adoption/actor/Guest/inventory predicates never select the retained private
source text. The existing owning connection requires a finished transaction, so
readback uses REPEATABLE READ READ ONLY, COMMIT or rollback on error/cancellation.
Missing and present staging both retain QUERY_SERVER_STATUS. This adapter must not
be mounted as the complete adoption status service: it has no actual terminal
publication/cancellation outcome store and cannot authorize source release.


## Draft preservation supplement

The existing local journal preparation schema and draft verifier now live in a
pure Auth codec, retaining old public exports and journal1/2/3 compatibility. This
reuses the same checks in private staging without importing Session/Native storage.
Draft-bearing plan/2 retains canonical P1 and Trip Create/Edit snapshot bytes,
including incomplete dates, whitespace and Unicode. Draft count is pinned to the
same preparation and preflight grant. A Trip Create draft is not part of the saved
Trip ID set and never turns into a published shell. P1 EDITv1 still has no owning
revision/restore qualification: preserving its bytes does not authorize restoring
or publishing it. Full publication remains blocked until all owning Draft restore
paths are verified. No new Draft repository, sync engine or identity promotion.

## Explicit Person identity mapping candidate — 30 October

`guestAdoptionCompositeIdentity.ts` qualifies the same immutable preparation and
staging grant through the existing plan verifier, then checks every initial Trip
creation field against the owning transaction's TripCreate readback. It maps only
the explicit source Creator Person to that result's actual linked Owner Person.
Other source People retain their own IDs; equal names never connect an Account.
Cross-Trip/reused target Person IDs, extra/missing/duplicate Trip receipts, wrong
Account/operation/initial metadata and source/grant changes reject the dataset.

Only the known participation/selfPerson and ACL Person leaves are transformed.
Operation IDs, Item IDs, base vectors and all other payload text remain exact.
Each resulting intent retains its source hash and separately hashes the mapped
canonical command. The canonical identity candidate pins the entire original
plan hash, including retained drafts and every source operation. It records no
APPLIED outcome and omits no source Person operation from the original plan.

This is pure `authority: NONE` preparation, not receipt authentication or a
publisher. Its input readbacks must eventually be obtained by the actual owning
transaction after real initialization, never a client-supplied list. Unlinked
People still require their owning initialization and receipts; mapping does not
claim they exist on the server. Source Creator/Person names, Ledger parameters,
deferred metadata dependencies and all drafts remain in the original sealed plan.
P1 EDIT restore remains closed. There is no route, SQL/role/grant, Native consumer,
Session promotion, Hosted readback or Adoption E2E associated with this candidate.

Native reaffirmed this exact candidate-only file scope and the three-principal
composition gap on 30 October. Direct identity/plan/draft regression: 3 suites /
50 tests PASS; independent 3 suites / 50 tests and typecheck PASS, NO_BLOCKER
within candidate-only scope. See `IDENTITY_REVIEW.json`; final integration is
recorded separately.

## Owning transaction execution body — 30 October

`guestAdoptionCompositeExecute.ts` composes the qualified saved Trip/P1 operations
using existing TripCreate, unlinked PersonCreate, revisioned Metadata and Core
services. It requires a future owning single-transaction adapter and remains
unmounted/default closed. Standalone HTTP/PG factories must not be composed here.
The owner must lock the actual server stage/grant, confirm the existing target,
check policy and collision constraints, and supply all ports on one authorized
lease. This body creates no principal, grant, COMMIT or terminal publication.

The body requires genuinely new Trips, checks create and Person receipts against
same-transaction readbacks, preserves original Ledger settings exactly, obtains
Metadata CAS revisions from the owning snapshot, verifies the resulting snapshot,
and runs the existing Core executor/receipt validator. Only FULL APPLIED or
NO_CHANGE receipts qualify; rejection, conflict, redaction, wrong bindings,
cancellation or expiry throws to the outer transaction. Every original queue ID
must be represented, including deferred local action ID to actual operation ID;
source and mapped Core hashes remain separate. Local Person names never connect
Accounts automatically.

Changed deferred covers reject before any owning I/O because their owning restore
port does not yet exist. Other source names, timestamps and static/private cover
preferences are retained explicitly with `localRestoreStatus:
REQUIRED_NOT_EXECUTED`. Nonempty Drafts also reject until owning restore qualifies.
These preserved fields cannot be treated as already applied or source-release
permission by a future publisher.

Direct execution/identity/plan/draft regression: 4 suites / 66 PASS. Independent
execution suite: 16 PASS, NO_BLOCKER after the cover-completeness repair. Tests use
the real Core domain executor, but their outer map snapshot is a unit transaction
harness, not PG/RLS/Hosted atomicity proof. Actual grant issuance, cross-principal
adapter, cancellation/final receipt storage, Native recovery and DEV Adoption
remain pending. See `COMPOSITE_EXECUTION_REVIEW.json`.

Ledger projection repair: initialize/read back only after all deferred Metadata.
The existing bootstrap derives title/dates from public.trips and the settings
values/timestamp from ledger_settings. A stale Guest ledger_journeys title/date
is preserved in retainedLocalState, while the remote result must match the final
Trip plus exact original financial settings. Invalid timestamps or changed
settings fail the entire transaction. Directed3s63PASS, independent23PASS and
NO_BLOCKER/types/lint; this remains component-only, with no PG/DEV publication.

## Local terminal arbitration evidence — 30 October

`terminal.local.sql` extends only the disposable private staging fixture. Each
adoption has at most one immutable terminal-evidence row. Publication and
cancellation contend on SELECT FOR UPDATE of that exact stage; its original
Account/Guest/inventory/grant/plan tuple and exact text hash are rechecked.
Cancellation cannot carry execution evidence; publication evidence must retain
the separate executor text/hash and matching binding. UPDATE/DELETE/TRUNCATE
are refused. It adds no RPC, role, runtime grant, business write or mounted reader.

This table stores **authority: NONE** component evidence, not an authoritative
publication/cancellation receipt. Its local PG publication test deliberately uses
synthetic executor evidence without business writes, which can never release
Guest originals or install an Account. Actual authorized owning execution, final
dataset verification, grant/confirmation issuer, commit recovery transport and
Native restore remain required. The terminal fixture does not replace these.

The isolated network-none256MB PG run now passes22 checks, including real
concurrent publication/cancellation with exactly one winner, outer rollback,
Actor/plan/execution-hash mismatch, missing-stage cancellation, immutable terminal
rows and fresh-connection readback. Existing anon/authenticated/service_role
remain denied. The old fixture still lacks three Gateway roles, so their ACLs
and real business principal composition are explicitly untested.

## Person held transaction seam

Native explicitly delegated the Person Pg source/test to Auth as sole Writer.
`withTripPersonCloudCreateOnTransaction` now reuses the exact existing query and
receipt checks on a caller-owned lease, without transaction control. The normal
standalone factory still owns its original BEGIN/COMMIT/ROLLBACK. Unawaited,
parallel, escaped and swallowed failures retire the caller lease and reject.
Direct2s38PASS, independent Pg+HTTP2s31PASS/NO_BLOCKER, types/lint PASS. This adds
no SQL authority and has no runtime consumer; the four-principal composition
barrier remains. See PERSON_HELD_REVIEW.json.
