# W1–W5 owning Source authority gate

Status: OWNERSHIP RESOLVED; publisher implementation pending; Core continuous implementation is incomplete.
All runtime, hosted, provider and native activation remains CLOSED.

## Demonstrated gap

W0_CAPTURE_HANDOFF_CONTRACT §4–6 requires complete sealed Source/input/Candidate
catalogs, exact qualified airport/service/date identity evidence, whole-Source
relationship/retiming/continuity checks, and all prior claims before purpose certification.
Different candidate IDs, source positions or confidence never prove distinct physical legs.

The accepted Stage 1 Capture owner confirmed on 2026-10-12 that:

- `trip_source_publish_flight_run` seals legacy candidate origin/destination authored
  labels; `accepted_place_id` is NULL.
- `FlightInterpretationBatch.resolved_airports` and `matching` are transient observations.
  They are not included in that sealed publication.
- `trip_source_core_v2_candidates` has no authoritative publisher or accepted
  `candidate_json` sealing shape in the existing Capture implementation.

Consequently an owning PostgreSQL adapter cannot reproduce the qualified purpose
certificate from actual stored authority. The executable synthetic Source port tests
verify orchestration but do not fill this production authority gap.

The actual Source PG binding verifies current Source/run/input/proposal pins and hashes,
retains legacy UNKNOWN claims, and keeps absent qualified identity in REVIEW. It cannot
store certified READY commands or finalize their Source evidence. No arbitrary booleans,
transient provider interpretation, fictional v1 candidate or old-v2 approval is used.

## Accepted ownership decision — 2026-10-12

Owner directed Core/Source to own authoritative v2 Candidate publication. Capture owns
interpretation, evidence and candidate preparation; it receives no direct Canonical SQL
mutation authority. Source acceptance commit c316688 is integrated here as16e2d33.
The prior assignment question is resolved. Sealed authority implementation and its
qualification/admission gates remain required.

## Concrete implementation unit

The smallest compatible next unit is an owning v2 Candidate/Evidence publisher in the
W4 Source boundary, jointly integrated with Core's existing verifier. The publisher must:

1. Pin immutable existing Source/run/input descriptor hashes and current Source revision.
2. Seal finite, independently verified qualified airport namespace identities and exact
   service/departure-date evidence; absent authority stays REVIEW.
3. Seal complete Source/run relationships needed to distinguish physical legs, retiming,
   codeshare and continuity. Extractor confidence/positions cannot assert these rights.
4. Preserve exact per-field review origin: USER_ENTERED/EDITED_EXTRACTED must remain
   manually protected; never silently reclassify them as unprotected Source facts.
5. Let Core verify this authority inside the owning Source/claim transaction and bind the
   existing candidate2/plan2/command2/receipt2 interface. Existing legacy UNKNOWN handling,
   actual no-commit authority and strict SOURCE_INSTANT admission remain unchanged.

Core/Source now implements this publication boundary under the accepted Owner direction.
It is not permission to turn on providers, hosted writes, sync's five C operations or
native Capture runtime. The existing W0 public command/plan DTOs need no change unless
implementation identifies a concrete incompatible sealing requirement.

## Remaining work; no complete claim

Before Core completion: verified publisher/admission/finalization and Source SQL acceptance;
operational custody registry/host/grant/CREATE_DOCUMENT binding; owning Ledger association;
remaining lifecycle and all 20 acceptance target traces; final compatibility/integration.
Current tests demonstrate isolated SQL/SQLite/backend policy mechanics. They do not
certify Hosted DEV, source bytes/custody provider, native restart or actual travel E2E.

First W7 step after this gate: one retained, source-owned Flight original through sealed
candidate2, prepared same-ID sparse creation, exact Core receipt, guarded qualification,
Source finalization, complete read2 install and native Day view. A two-leg original also
requires independent certified purpose claims before simultaneous preparation.
