# G1 — Minimal Data Foundation implementation plan

Date: 2026-10-11 (Pacific/Auckland). Status: **G0/G1 audit complete; proposed changes require Owner Review.**

Implementation baseline: canonical main `5076174`, `/Users/xoery/Project/otr-mobile`. Paths below are relative to that checkout unless marked **chat-only**. Source inspected directly; no live database accessed. IMPLEMENTED describes the named capability, not blanket product readiness. Tests, runtime wiring, historical DEV evidence and real-file E2E are separate dimensions. This audit authorizes no implementation or activation.

## Implementation readiness

**Ready for bounded contract/Owner Review; not ready for blanket migration or runtime activation.** Preserve existing protected Event/Source/Person foundation. Freeze one full Beta P1–P6 logical and physical field/relationship/access/admission contract, then implement additive dependency batches. No implementation is authorized by this audit.

Four material decisions are D1–D4 in the [decision register](G1_OWNER_DECISION_REGISTER.md). Ordinary names, file organization, validation bounds and internal adapters are Agent responsibilities. Authorizing a data implementation package does not authorize provider activation, private-file import, deployment or production access.

## Eight execution packages and dependencies

| Package                         | Complete scope                                                                                                                    | Depends on / parallel work                                    | Completion gate                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| W0 Contract freeze              | reconcile schedule authority, partial Flight, visibility, automatic policy; exact schema/API/mirror/output/read matrix            | Owner D1–D4; all teams may review facts                       | one accepted contract, no competing model                       |
| W1 Core save/access             | canonical P1 CALENDAR and sparse Flight same identity, participant/default/visibility, local intent and guarded typed commands    | W0; security/certificate changes designed together            | offline save/restart, scoped read, strict Flight unchanged      |
| W2 Shared relations             | reuse Reservation as Booking, N:M joins, lifecycle/history, entitlement/holder/link, operational attachment and Ledger references | W0; may build alongside W1 with disabled gates                | nine synthetic relationship cases + adversarial rights          |
| W3 Typed P3–P6                  | Stay/Rental/Activity extensions, Instructions, P5 transport adapter, distinct meeting/entry/pickup facts                          | W0 + W1/W2 accepted reference shapes                          | fields admitted through same canonical contracts                |
| W4 Capture adapters             | executable typed candidate/closure/matching/augmentation/output intent, exact evidence/lineage/recovery                           | W0; synthetic parser work parallel, admission depends W1–W3   | N:M replay/UNKNOWN/user-edit preservation                       |
| W5 Local mirror/sync/read       | exact SQLite mirrors/pending overlay, typed receipts/pull and permission invalidation, one central lifecycle; derived Day v2      | W1–W3; current queue/account/fencing reused                   | upgrade, response loss, scoped convergence, mixed projection    |
| W6 Experience adapter           | repository supplement, P3 multi-day/P4 operations/P5 segments/P6 original-ticket actions                                          | W0 fixture contract; live integration depends W5              | missing fields, historical status, no duplicated writable facts |
| W7 First bounded DEV/native E2E | synthetic source first, separately authorized private original later, mixed accepted-data native QA                               | first Flight W1/W4/W5 path; no need to wait for all rendering | actual Source→receipt→collection→Day→offline reopen             |

Provider Integration remains separate: normalized observation capability for basic Flight schedule and Place Search/OCR, licensing/privacy/budget/retention gates independent. Core offline save must pass without providers. Flexible/TTR build their independent models and consume narrow shared adapters; they are not W2 business tables.

## Schema and migration impact

Do not edit SQLite1–53, historical server1–84, legacy baseline or applied DEV-forward scripts. Allocate new numbers only against the then-current canonical integration HEAD. Aim for **one coherent server data/security foundation and one SQLite mirror foundation**, plus an activation/compatibility follow-up only if test/provisioning boundaries require it. Migration count is not a reason to mix unreviewed permissions or enablement.

Extend existing Event/Reservation/endpoint/service families; add N:M links, entitlements, small typed details/Instructions and authorized attachment/Expense references (reuse server `expense_links`, add only missing Mobile mirror/typed authorization). Define all null/unknown meanings, revisions, actor scopes, FK restrictions, receipt payloads, read DTO versions and capability negotiation before SQL. Participant-aware complete collections and Day projection require versioned validation/mirror replacement because SQLite47 CHECK and current collection guards reject new scopes. Preserve v1 historical/certificate bytes; never recompute an old certificate under new semantics. Account-specific privacy-filtered completeness must be explicitly defined, not treated as globally complete membership.

Stay/Rental schedules use current root start/end semantics; typed details do not get duplicate independently writable dates. P5 endpoints use their current role authority. Session/access/meeting/cutoff/instructions are additional facts with their own roles. Pending sparse plans cannot be inserted as qualified Flight service solely to satisfy rendering. Define shared Flight-instance reuse only to the extent D1 requires; provider cache reuse alone is not shared canonical truth.

## Repository/API changes

Reuse repositories, `withAccountApplyGate`, account generation, queue idempotency/CAS and private gateway receipt patterns. Add typed methods for plan save/qualify, Booking create/link/amend/cancel/replace/hide/restore, entitlement/attachment links, typed details/Instructions and permitted supplemental reads. Expose one scoped command/result family with bounded typed discriminants and a compatible read bundle where practical; do not create endpoints for every display row or a generic arbitrary patch API.

Capabilities report installed vs enabled vs permitted actions. Do not route unsupported canonical writes through `/itinerary` legacy create. Current Catalog GET and native explicit install remain read-only. New activation must separately establish credentials, current DB contract/ACL roots, actor/Trip admission and safe worker/recovery path; source-code gates alone do not establish live readiness.

## Admission and reconciliation

Reuse Run/Input/Candidate/Confirmation/slot lineage and exact evidence addresses. Add non-Flight schema adapters and typed object/link targets; unknown fields stay immutable evidence. Match Booking namespace/reference plus qualified scope; supplement selects an exact existing Item instead of creating another. An N:M source does not require a Booking output. Preserve selected raw facts/user changes and exact parent revisions.

One supported aggregate transaction has one immutable command and correlated receipt. For different aggregate owners use explicit dependent slots and partial-result vector; uncertain committed outcomes block duplicates. Evidence finalization may follow domain success durably; failure cannot delete the accepted Event. Do not treat parse READY, C4a assessment or publication membership as permission to execute. Automatic admission, if D4 approved, gets a new bounded policy and audit identity; existing reviewed v1 stays intact.

## SQLite / Sync / Day

Local save and stable command identity commit before UI returns. Exact accepted baseline and pending user intent remain separable; remote pull cannot overwrite protected intent. Dependencies, retry, recovery and permission failures use existing sync owner; feature screens own no timers or upload lifecycle. Asset transfer uses authorized custody workflow, not financial receipt storage reused with weaker rights.

Day v2 reuses independent source-bound accepted projection and emits role rows, not fake Events. Add certified supplemental revisions for relevant objects or a validated read bundle; stale details cannot claim a newer schedule. P3 middle-day base only if person/place unambiguous; P4 pickup/return only; P5 every actual segment; P6 access capability from exact original/device verification. Historical v1 remains readable and cannot claim current private access merely from old availability.

## Migration and rollback

1. Rehearse from exact53/84 lineage plus documented frozen `otr-r3-dev-v1`/68-row-history and DEV-forward baseline, populated legacy/canonical fixtures, protected pending/UNKNOWN operations, Person certificates and financial rows. Check FK ON/OFF local preservation.
2. Add nullable/versioned facts and links; safe legacy reservation FK backfill only as attributed association, with same-Trip validation. Do not infer reservation times as accepted canonical schedule or PNR as unique identity. Quarantine ambiguous rows for review.
3. Install disabled writers/read capabilities and explicit upgrade negotiation; retain v1 readers. Verify new SQL permissions/RLS/guards and certificate semantics before rollout.
4. Activate bounded DEV reads/writes only after a separate approved runtime gate. Never flip existing CLOSED checks without the accepted activation mechanism.
5. Roll back by closing newly activated capability and restoring compatible old readers while retaining additive rows, original bytes, receipts and unresolved intent. Do not drop schemas or rewind migration history. Old clients encountering new privacy/schema version withhold unsupported access; do not open a legacy fallback.
6. Any destructive cleanup/data repair requires its own future proposal. General rollback cannot compensate domain success by deleting it or alter Ledger rows.

## Tests and acceptance order

- Current baseline: 14 suites/610 PASS. No new product-source tests added for documentation-only work.
- Contract tests: per-field requirements, date-only/unknown time, offset/IANA/fold/gap, namespace/codeshare identity, exact proofs, null clears and selected-field completeness.
- SQL negatives: ordinary/service-role bypass, forged receipts/support, cross-Trip link, group/SELF leakage, revoked actors, cascade/replace graph drift, legacy policy compatibility, filtered completeness.
- Repository upgrade/offline: old53 rows unchanged, atomic save, A→B→A, FK ON/OFF, crash before/after receipt, UNKNOWN replay, local privacy invalidation and no financial cascade.
- Nine relationship cases; add user edit plus late evidence, import duplicate/reprocessing, no Booking document, pass with no Item, capacity vs holder and multi-segment Ticket.
- Day/Experience fixtures: check-in/middle/check-out, ambiguous stay bases, rental grouped pickup/separate return, all rail legs, local original vs dynamic access, missing metadata; no guessed time/QR/paid amount.
- Approved DEV synthetic HTTP command→receipt→pull→projection followed by isolated native restart/offline/access tests. Full relevant static/UI guards run when implementation/UI changes exist. Private exemplars and production remain separately authorized.

## Capture first end-to-end path

**Earliest now:** deterministic synthetic Flight text intake/interpretation/closure/preparation and persisted local original can be tested with existing foundations; this audit's integration suites pass. This is not a real booking file persisted as canonical data.

**Earliest canonical E2E:** after a narrowly approved Source acquisition/actual-format verifier, complete Flight publication/closure/review, exact CP13A gateway+worker/receipt recovery and collection/Day convergence are ready. Choose one supported actual format, preferably a simple original text flight confirmation or static-PNG profile whose verifier is independently accepted. PDF requires an actually installed/accepted decoder; MIME or filename does not qualify it. Use qualified independent departure instant and explicitly unknown arrival if needed. No Booking/Ticket write is required to prove Flight Event persistence; retain their evidence as DEFER.

Run synthetic first: original → Capture/Source pins → READY published Flight candidate → explicit reviewed confirmation → exact CREATE receipt → evidence finalization → certified collection → Day projection → native offline reopening. Reimport same purpose must reuse/recover, never create another Event. Source terminality/IO_UNKNOWN and populated live publication remain prerequisite gates; empty Catalog200/R3B synthetic install alone cannot satisfy them.

Then obtain separate Owner authorization for a private original and scoped DEV account/Trip. An Air NZ round-trip file may yield two independent Flight outputs, but complete commercial Booking relation acceptance waits W2. Experience can continue fixture development while these gates are completed. No calendar date promise is possible until the runtime prerequisite evidence is available.
