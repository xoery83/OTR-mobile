# COORDINATOR HANDOFF — Part 2
**Delivery type:** approved product/UX design contract and original screenshot reference package; not engineering completion.

## Suggested implementation work packages
1. Contract reconciliation: compare this supplement with baseline P3–P6 nine-state Delta, current Core admission/schema, existing Day Feed, Capture, Documents and Ledger APIs. Report blockers before coding; do not invent new schema paths.
2. Shared Form shell: contextual prefill, Save/Cancel, inline scan draft, changed-field highlights, duplicate resolution, local-first behavior and preserved Day Feed position.
3. P3 Create/Scan/Edit/Immersive; P4 Create/Scan/Edit/Immersive; P5 Create/Scan/Edit/Immersive; P6 Create/Scan/Edit/Immersive, staged with acceptance checks.
4. Ticket-Identity-01 shared implementation for P5/P6, reuse existing Documents/Capture admission and identity controls. Ensure original-access and offline state truthfulness.
5. Regression across Future/Today/Past × Browse/Focus/Immersive; NOW/TNS/TTR and Ledger correctness.

## Hard gates
- A UI form cannot bypass protected admission or sync authority. Unsupported Core data paths require explicit coordinator resolution.
- Source-derived Tickets require original evidence and access; Booking is not Ticket.
- No provider-based hotel/car hero images; no invented provider lookup for P5.
- Photos, Ledger item association and other deferred modules are NOT automatically Beta-complete by virtue of these mockups.
- No third-party reservation mutation implied by local edits.

## Known reconciliation items
- P3 mandatory stay dates versus any existing Core NTC exception.
- P5/P6 dynamic field provenance/semantic mapping storage and secure Ticket identity/coverage.
- P1 undated-plan contract and shared NTC/TNS ordering remain governed by earlier Core remediation decisions; not modified here.
- Shared expenses Link executor and photo associations may need deferred capability handling.
- Any booking-level Ticket/Expense ownership conflicts require explicit authority resolution.

## Acceptance deliverables requested from builders
Design-to-code traceability matrix; test evidence for duplicate/identity/access/offline; screenshots from iOS simulator and device; regression report; blockers and changes against Owner-approved contracts.
