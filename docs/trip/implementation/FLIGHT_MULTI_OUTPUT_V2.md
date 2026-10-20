# Core Flight output purpose v2

Owner authorized this bounded implementation on 2026-10-12. Base canonical main
741579c; Capture baseline 8e45c8d. W0 Capture handoff sections 5–6 remain the
normative plan/command/receipt transport. The W1–W5 foundation chat owns the
shared schema, private writer, access, CAS and receipt implementation; this
worktree contributes the narrow Flight purpose validator, owning Source port,
and their regressions.

Root cause reproduced at741579c: the first reviewed CP13A preparation allocates an
active CREATE claim without a result receipt. `readClosureEvidence` loads every
claim in the same Run/ancestry and Source scope. `assessFlightClosure` treats any
unclassified pending claim as UNKNOWN. The second candidate therefore receives
PREDECESSOR_OUTCOME_UNKNOWN and preparation throws CLOSURE_REVIEW_REQUIRED.
Distinct Candidate IDs and Flight route/date observations alone are not durable
Core disjointness proof. The repository and server repeat the lineage fence.

The v2 purpose certificate binds the sealed plan/slot, Source revision, exact
input catalog and candidate hashes, immutable target and independently proven
physical Flight identity. Identity hashing excludes plan/slot/target allocation.
The owning Core proof verifier must verify exact Source evidence, operating or
otherwise qualified service attribution, airport namespace identities and date,
not an extractor's qualified flag. No automatic v1 DISTINCT_OUTPUT is generated.
All prior locked claims are inspected. Legacy UNKNOWN, equivalent physical output
under another target, competing target, stale/forged certificate and ambiguous
same-date service/route changes remain fenced. Independent certified return legs
may coexist even when one result is unknown. Exact replay retains its slot/target.

Sparse Flight save has no qualified occurrence certificate and uses the existing
separate save/qualification boundary. This helper does not grant mutation rights,
change participation/visibility, relax Flight Option A, write any domain row or
reconcile a receipt. Those remain owning Core command/repository responsibilities.

## Core helper port

`src/domain/trip/flightOutputPurposeV2.ts` exports:

- `mintFlightOutputPurposeV2(binding, identityFacts, identityEvidenceRefs,
verifyEvidence, sha256)` → `{purpose, identitySha256}`. Binding includes
  authenticated Account/Trip, sealed Run/Candidate IDs, plan/slot IDs, Source
  revision, exact catalog/candidate hashes and selected stable target. The
  mandatory owning verifier checks each of those against authoritative private
  records, actual selected values and exact retained locators. Airport identities
  are opaque qualified IDs from the existing resolver contract, not invented IDs
  or qualification inferred from a name/code. Service identity must be the
  verified operating tuple where available; unresolved marketing aliases cannot
  mint a second operating purpose.
- `assertFlightOutputClaimsV2(binding, certified, fullPriorClaims, sha256)` →
  `NEW_OUTPUT | EXACT_REPLAY`. CERTIFIED claims carry their immutable original
  binding and certificate; LEGACY claims use actual Account/Trip/slot identity
  without fabricated v2 pins. Only authoritative exact no-commit disposition
  releases a legacy claim. Same slot replay remains replay even after terminal
  no-commit; it is never permission to execute that terminal command again.
- `compareFlightOutputPurposesV2(left, right)` →
  `SAME_OUTPUT | DISTINCT_OUTPUT | UNKNOWN`. Different independently evidenced
  dates or reversed qualified route can establish distinctness. Same route/date
  with different service identifiers, same-date reroutes and unreviewed connecting
  observations remain UNKNOWN. A shared verified operating/supplier leg with
  contradictory route/date also remains UNKNOWN. Optional continuity anchors
  require their own exact evidence; extra provenance does not alter the normalized
  physical tuple fingerprint. No heuristic codeshare merge or route synthesis.

The writer must acquire existing Account/Trip/Source and identity/claim locks,
load every related active claim including legacy and successful pending
finalization claims, verify complete lineage, and persist the frozen certificate
and identity fingerprint atomically with the exact operation/target/CAS binding.
Caller-supplied certificates, no-commit flags or filtered claim lists are never
accepted by the HTTP preparation route. Hash validation protects stored
correlation; it is not a signature or substitute for Core evidence authority.

Prepare/execute/finalize routes remain the W0 handoff routes. This helper alone
is not a durable preparation, canonical writer, receipt verifier or activation.
Shared integration is owned by W1–W5 and must be tested through those actual ports
before claiming the two-preparation acceptance or mutation completion.

## Initial validation

Baseline sibling fence fixture passes at741579c, including real SQLite cold
reopen. Pure helper has29 tests covering distinct return outputs, exact serialized
replay, success+unknown, identical purpose, competing target, overlap, legacy
UNKNOWN/no-commit, all-claim checking, scope/stale pin/forged hash rejection and
mutable asynchronous input isolation. Existing Core/Import regressions and static
checks are run separately; no new durable v2 or live mutation claim yet.

## Flight Source plan port

`backend/src/tripCoreV2Source.ts` exposes `prepareCoreSourcePlanV2`,
`finalizeCoreSourceSlotV2`, and `readCoreSourcePlanV2` using W0 §6 envelopes.
Capture supplies its reviewed plan and stable slot/operation/target IDs; Core
returns frozen `readyCommands`. Execute those commands through Core Mutation,
then finalize with the exact `slotId`, `operationId`, `intentSha256`,
`domainReceiptId`, and `receiptSha256`. The Source port never writes canonical
objects. `CREATE_SPARSE_FLIGHT`, `QUALIFY_FLIGHT`, `UPDATE_FLIGHT_FACTS`, and
`REPLACE_FLIGHT_SERVICE` are the finite Flight command set. AUTO and other kinds
remain Review with `CONTRACT_UNSUPPORTED`.

The owning `CoreSourcePlanStorageV2.withLockedSourcePlan` implementation must:

- Authenticate the current account/Trip and hold the Source, plan, and complete
  claim-set locks until commit, including legacy v1 claims.
- Read the complete immutable Source/input/Candidate catalog. Verify the actual
  pins, hashes, selected payload leaves, qualified airport/service/occurrence
  identity, D1 time authority, and target continuity before certifying evidence.
- Validate current ACL, participation, CAS, protected fields, and the complete
  candidate aggregate with Core command admission before freezing a command.
- Persist the immutable request, command/hash/certificate/binding, durable active
  CREATE claims, and operation ownership atomically. Prevent operation reuse
  across slots/plans, and never overwrite frozen fields on replay.
- Read an immutable owning receipt as `{domainReceiptId, receiptText}`; storage
  ID is separate from the full canonical receipt body. Both must correlate.
- Finalize associations atomically and idempotently. Anticipated evidence errors
  return `EVIDENCE_PENDING` without aborting the transaction or releasing claims.

Replay reads the stored plan and exact receipt before any new claim gate. A
missing, rejected, or unavailable receipt never releases an output claim or
allocates a replacement command. Only a dependency's exact successful Core
receipt can bind a deferred base revision. Current target revisions cannot
silently rebase it. Review requires a new reviewed plan; completed commands and
retained claims remain available for reconciliation.

The disposable SQLite adapter in `backend/src/tripCoreV2Source.test.ts` validates
metadata durability, cold reopen, two outputs, collisions, legacy UNKNOWN,
exact replay, receipt correlation, failed-finalization retry, and same-ID
receipt-dependent qualification/CAS. It is a test adapter, not a second writer
or a shipped database schema. **PostgreSQL storage binding and HTTP activation
are CONTRACT_ONLY until the Core foundation owner implements and validates them.**
No Capture v1 writer/fence or historical migration changes are included.

Pre-seal rejected/uncertified proposals remain in private preparation metadata
and `reviewSlots`; they are omitted from the sealed plan projection. Every
included slot therefore retains W0's required non-null `outputPurpose`.
Private status counts all submitted proposals, including omitted Review slots,
so partial success cannot falsely become COMPLETE. A dependency with no frozen
command remains private BLOCKED metadata until its exact prerequisite receipt
permits certification and freeze. GET returns `{captureVersion:2,plan,status}`,
where `status` is the exact W0 §3 status envelope. Core foundation confirmed this
binding; it changes no purpose authority or active-claim semantics.

## Capture integration sequence

1. Persist stable plan/Candidate/slot/operation/target UUIDs before submitting
   `POST /v2/trips/:tripId/core/source-plans/prepare` with the exact W0 §6
   `captureVersion:2` request. For each supported qualified Source leg, propose
   `CREATE_SPARSE_FLIGHT` with ITEM vector `{kind:"ITEM",id:targetId,revision:null}`,
   plus a `QUALIFY_FLIGHT` slot for that same target, distinct slot/operation IDs,
   `dependsOn:[createSlotId]`, and `baseVector:null`.
2. Submit only returned frozen `readyCommands`, unchanged, to
   `POST /v2/trips/:tripId/core/commands`. A preparation is not an execution grant
   when the negotiated Core capability is CLOSED. Sparse manual save remains
   separate; Source purpose verification does not authorize unqualified matching.
3. Re-submit the identical preparation after the creation receipt exists. Core
   binds each qualification to its own exact successful receipt revision; never
   replace that revision with the latest target revision. Execute the returned
   qualification commands. Two independently supported legs retain two targets.
4. Use the owning FULL receipt projection's separate `domainReceiptId` and full
   receipt's `operationId`, `intentSha256`, `receiptSha256` for
   `POST /v2/trips/:tripId/core/source-plans/:planId/finalize`, together with the
   original `slotId` and `captureVersion:2`. Caller HTTP success is not a receipt.
   EVIDENCE_PENDING retries finalization only. Missing/failed receipts retain
   claims; exact command replay uses the original operation and payload.
5. Read `GET /v2/trips/:tripId/core/source-plans/:planId` for the private
   `{captureVersion:2,plan,status}` response. Account-generation fencing remains
   Capture transport/repository responsibility, with current server authorization
   independently enforced by the Core storage adapter. Capture owns no canonical
   SQL or canonical writer.

Legacy undispatched preparations already have a Core-owned recovery authority:
`trip_source_revoke_undispatched_slot` in server migration
`20261005001100_trip_import_undispatched_revocation.sql`. It requires exact
confirmation CAS/digest, PREPARED state, no dispatch and no receipt under existing
locks. Dispatched or potentially committed legacy operations require exact
owning receipt reconciliation. Capture cannot assign NO_COMMIT or delete claims.
Unclassified legacy success remains fenced until an owning accepted-target
baseline classifies it; this helper does not forge historical v2 certificates.

Latest local validation: 14 focused Core/Import suites, 347 tests PASS, including
28 durable Source transaction/executor cases and 29 purpose cases; typecheck,
lint/UI guard, backend build, touched formatting and diff check PASS. PostgreSQL
Source authority/binding remains a separate required implementation gate.

## Owning PostgreSQL authority gap discovered during binding

`trip_source_publish_flight_run` seals the CP13A proposal containers and exact
Input pins. Capture's `flightInterpretation.ts` creates those endpoints with
`accepted_place_id:null`; it separately uses transient `resolved_airports`,
matching/relationship observations and supplier scope observations for its
assessment. Those observations are not included in the published Run proposal.
The v2 candidate table exists, but its `candidate_json` does not have an owning
publication command or a frozen verified-identity grammar. Database privileges
alone therefore cannot turn that table into a verified Candidate authority.

A PostgreSQL binding must not infer qualified airport identity from authored
labels, accept client `unique`/`verified` flags, or treat selected-field locators
as proof that the whole Source contains no retiming/overlapping alternative.
Core needs an owning v2 Candidate sealing/verification contract for qualified
identity and whole-Source continuity before the real multi-output slice can be
unblocked. Existing manual sparse save and the tested transaction ports do not
provide this missing authority. Until it exists, Source Admission remains CLOSED;
legacy UNKNOWN and exact undispatched revocation authority remain unchanged.

Core foundation has been notified under explicit Owner coordination authorization.
No speculative Source SQL writer, historical migration edit, or trust-flag bypass
was added to hide this gate.

`createCoreSourcePgStorageV2` now binds the Source port to a dedicated Core PG
lease, the owning Source scope lock and existing sealed legacy catalogs. It
checks current Input validity, descriptor hash and Candidate proposal hash,
preserves unclassified legacy claims, and persists only uncertified REVIEW or
BLOCKED metadata. It deliberately rejects certified command storage and
execution/finalization until the W4 verified Candidate authority is supplied.
Eight SQL-port tests include the actual preparation function returning
UNRESOLVED_IDENTITY with no ready command. They use a deterministic query lease,
not a PostgreSQL server; owning SQL helper/grants and a disposable SQL acceptance
run remain required. Latest recheck after shared Core dependency integration:
15 focused suites / 229 tests plus 8 Source PG binding tests PASS; typecheck and
lint/UI guard PASS. Earlier broader 14-suite / 347-test run remains recorded
above; these are different selections, not cumulative test totals.
