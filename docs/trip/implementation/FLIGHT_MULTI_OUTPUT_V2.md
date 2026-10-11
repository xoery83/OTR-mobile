# Core Flight output purpose v2

Owner authorized this bounded implementation on 2026-10-12. Base canonical main
741579c; Capture baseline 8e45c8d. W0 Capture handoff sections 5–6 remain the
normative plan/command/receipt transport. The W1–W5 foundation chat owns the
shared schema, private writer, access, CAS and receipt implementation; this
worktree contributes the narrow Flight purpose validator and its regressions.

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

Integration ports and validation evidence will be recorded after implementation.

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
