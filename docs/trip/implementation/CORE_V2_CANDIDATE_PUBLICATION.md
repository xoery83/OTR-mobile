# Core-owned Flight Candidate publication v2

Owner assigned publication authority to Core/Source on 2026-10-12. Capture owns
interpretation, evidence and Candidate preparation. Runtime, Hosted Import and
Provider activation remain CLOSED. This additive implementation preserves W0
candidate2/plan2/command2/receipt2; legacy CP13A publications remain unchanged.

The publisher re-reads exact retained Source TEXT bytes under the owning Source
scope lock, validates current Input descriptors/hash/ancestry and runs the existing
finite reference Flight grammar independently. Capture field values and locators
must match that owning extraction. Complete Source coverage and change/continuity
observations are sealed alongside candidates; partial, competing or uncertain
observations remain REVIEW. Unsupported binary/codeshare/supplier/manual-edit
branches remain REVIEW rather than being declared verified.

Qualified airport identity uses an owning private date-bound IATA registry.
Namespace identity `IATA_AIRPORT:<code>` requires exactly one enabled assignment
covering the departure date, with immutable registry version/digest. Syntax or a
caller `unique`/`verified` flag is insufficient. Endpoint accepted_place_id stays
NULL; qualified purpose identity does not grant place/map authority. Existing
SOURCE_INSTANT rules are unchanged; civil-resolution inference is not introduced.

Publication seals the existing Source/run/revision/Input pins and new version2
Candidate IDs, exact fact/evidence hashes, qualified purpose identity and registry
bindings. Exact publication replay returns the original response; changed content
under an existing publication/Candidate ID is rejected. Preparation verifies this
sealed catalog and all prior claims, then freezes the existing Core command. The
single Core writer re-verifies that slot in its own transaction. Finalization is
bound to its exact immutable receipt and target vector, never HTTP success.

The bounded publication transport envelope adds Source-owned evidence locators to
W0 Candidate objects, without adding Canonical permissions to Capture. Exact
schemas, route and accepted test results are recorded here as implementation lands.
