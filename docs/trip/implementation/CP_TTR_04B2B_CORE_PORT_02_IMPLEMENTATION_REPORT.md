# CP04B2B-CORE-PORT-02 implementation report

2026-10-13 · **CLOSED CORE IMPLEMENTATION PASS. STOP AT OWNER REVIEW.**

## Exact implementation and scope

Branch `codex/cp-ttr04b2b-core-port-02`, isolated worktree
`/private/tmp/otr-cp-ttr04b2b-core-port-02-20261013`.
Verified local/origin/actual remote main at start: `e9e4511c0bcbf668627a8bc99b02bb8962580a17`.
Implementation commit `64c84e0a9ba201281ce7d693adc46c6ecc0703ad`, tree
`52eee91790e576ba391543f442a37996dfbe59e4`.
A documentation-only follow-up adds this report and a current-state prefix; final
HEAD/tree and per-file hashes are in `/private/tmp/otr-core-port02-final-evidence-20261013.json`.

Exact final six-file manifest:

```text
src/data/repositories/tripCoreV2Repository.ts
src/data/repositories/tripCoreV2Repository.test.ts
src/domain/trip/tripCoreTtr.ts
docs/trip/contracts/CORE_TTR_PUBLICATION_PORT_V1.md
docs/trip/implementation/CP_TTR_04B2B_CORE_PORT_02_IMPLEMENTATION_REPORT.md
docs/CURRENT_IMPLEMENTATION_STATE.md
```

No schema/migration, SQLite57 definition, Controller, nine-field selection schema,
G2 Composer, Source Publisher/Admission, Provider or runtime factory changes.
The domain change only narrows unavailable reason to the existing finite union.

## Typed interface and ownership

`createTripCoreV2Repository` exposes the enriched existing `readTtr` and transaction
helpers, plus additive `guardTtrPublication`. It reuses the same private accepted
snapshot and qualification path; no parallel reader or writer.

- `CoreTtrReadResult`: finite UNAVAILABLE or `CoreQualifiedTtrRead` with raw input,
  opaque authorityKey, spatial sideband and coherent transient `CoreTtrAuthority`.
- Authority contains scope Account/Trip/generation; Person/branch; order id/revision;
  accepted collection epoch/revision/access/manifest/binding/roster/applied-generation
  facts; local refresh generation; A/B stable UUID/token/role; Item semantic and
  location-input revisions; NONE_PROVEN coverage; B ENTRY date/IANA expiry.
  Endpoint dependencies are composite, not a fabricated standalone/global counter.
- `ttrWithinTransaction` and `revalidateTtrWithinTransaction`: existing caller-owned
  gate/transaction contract; metadata comparison when present, backwards compatible
  raw Core captures. No public snapshot recursion or nested gate/transaction.
- `guardTtrPublication(ctx,orderId,fromId,toId,captured,handoff)`: fresh outer gated
  read transaction, invoked only after selection transaction **and its gate** finish.
  Returns CURRENT, STALE (AUTHORITY_CHANGED/REFRESH_PENDING) or typed UNAVAILABLE.
  Known scope/access failures are normalized here; unexpected storage/hash/integrity
  faults propagate. Existing capture API's established scope exceptions remain.
- `CoreTtrPublicationLease`: copied envelope, `isCurrent()` and synchronous
  `ifCurrent(emit)`. No revisions/access facts/coverage enter the selection table.

Full contract: `../contracts/CORE_TTR_PUBLICATION_PORT_V1.md`.

## Publication fence semantics

The guard compares the full raw captured result/vector with the fresh accepted
result. Through existing `withAccountApplyGate` afterRelease, it synchronously
hands off before queued gated Core writers resume. An ephemeral Account/Trip token
is shared by repository instances over the identical initialized serialized DB
object; beginRefresh/install/revoke invalidate it before mutations. Account
transition/generation checks also fence emission. Getter copies protect the retained
Core envelope from consumer mutations. Tokens are not persisted or global revisions.

CURRENT means that Core's synchronous handoff occurred while authority was current;
it is not a G2 publication receipt and cannot alone authorize emission after await.
Retain the lease and call `ifCurrent` for every delayed emission. Synchronous callbacks
must return undefined; no I/O, Promise, SQL transaction or nested Account gate. This
is a trusted callback contract, not an arbitrary async-code sandbox.

Core touches no personal-selection rows. Stale/unavailable publication leaves the
successfully committed selection intact. G2 independently decides final actionability,
insertion, NOW/Focus/scroll; Core emits no TTR presentation.

## Refresh, geometry and multi-pair behavior

Read capture retains accepted offline data. The guard conservatively withholds
publication while applied generation differs from the current started refresh,
including a failed refresh until an accepted installation succeeds. REFRESH_PENDING
is not a durability failure or cleanup instruction. This limit must remain explicit
in consumer integration/Owner Runtime review; it was not changed into an online
freshness guarantee or a new business-authority rule.

UNKNOWN equivalence remains Core-qualified with accepted equal coordinates; local
geometry computes0m. No SAME_LOCATION inference/threshold or TTR domain redesign.
Accepted TTR spatial correction `841ff819bb73d0809fdeb7715f41dfda54d26d56` is preserved
as a separate consumer dependency, not adopted into this branch.

B changes still fence incident pairs while freshly qualified C→D remains usable.
Collection/order/access/branch dependencies can invalidate snapshot capture pins
scope-wide; they do not permanently unqualify unaffected pairs or erase modes.
Fresh C→D publication against its new coherent snapshot is tested CURRENT.

## Verification

**188 targeted tests PASS:** combined179 in7 suites; Flight domain6; owning ordinary
SQL/SQLite2; joined Flight Source→Core/read2→SQLite57→Day1. No full broad rerun.

Thirteen new real file-SQLite publication cases cover:
- Coherent fresh post-commit handoff, NONE_PROVEN, Person/branch/order/vector fields,
  equal-coordinate UNKNOWN/0m and copied envelope isolation.
- Access revoke, Person rebind, branch/order/endpoint/UNKNOWN coverage and accepted
  EXPLICIT_TRANSPORT changes between durable write and publication: no handoff.
- Actual collection replacement and tampered manifest metadata: stale rejected.
- Started refresh retains offline qualified read but denies publication.
- Hasher-paused recheck with queued refresh: valid synchronous handoff first,
  then late emission rejected, including a second repository on the same connection.
- Pending Account transition and wrong Trip: unavailable, no private relation emitted.
- B edit plus independent C→D fresh qualification/publication; old lease invalid.

Tests commit a test-owned stand-in with the exact nine selection columns in the same
disposable file DB, and verify the stored walking mode survives every denial. They
do not modify or claim Runtime integration of TTR's Selection Repository.

Existing SQL regression also verifies real receipt/replay, three pairs, cold offline
reopen, inner checker and private gap redaction. All379 installed functions remain
unchanged during scenarios; CLOSED gates and existing migration allocations PASS.

Typecheck, Backend build, full lint/UI guard (473 legacy/90 representative files),
touched formatting and diff checks PASS. Two duplicate-import lint warnings in the
initial run were removed; touched lint is clean. No test timeout or production
semantics were changed to obtain passes.

Evidence logs `/private/tmp/otr-core-port02-{combined,flight-domain,sql,flight-sql,
types4,lint,lint-touched,build,format}.log`. Disposable SQL fixtures were removed.

## Concurrent final canonical advance

During implementation, G2-TTR-02 independently advanced local main to
`ae70dc4a19fd927841cc95a78d011ea6ac335a4f`; actual remote remains
`e9e4511c0bcbf668627a8bc99b02bb8962580a17`. Its six-file scope overlap with this
candidate is only current-state documentation; Core port production files remain
unchanged there. The tested implementation remains isolated on the verified start
baseline. No merge/reconstruction was performed; later integration readiness must
preserve that new G2 ancestor and reconcile handoffs. No validation against the new
combined tree is claimed. Canonical dirty/untracked bytes remain unchanged.

## Remaining integration seams and gates

TTR must retain the raw capture separately from its derived presentation, invoke
Core's guard after durable Confirm/gate release, and use the lease on delayed
emissions. G2 must retain its own latest scope/overlay/version/fingerprint checks
and current-source invalidation when inserting or consuming presentations. Core
cannot make a later React frame safe if consumers bypass the lease; no Controller
or G2 integration is claimed here.

Leases are valid only within the identical shared DB connection/process lifetime.
Consumers discard them on teardown; separate connections/wrappers/direct mirror
SQL writes cannot share this fence. Canonical activation must use existing owning
Core mutation paths and local hasher/Account dependencies.

Separate Owner review/integration approval required. No canonical merge/push,
Hosted migration installation, TTR production consumer, Provider, paid LLM,
Production or unrestricted Native activation. No new schema/migration required.
