# OTR Mobile 2.0 — P5 Scheduled Transport Product Design Delta

**Date:** 2026-10-13  
**Domain:** Experience / Day Feed — P5 Scheduled Transport  
**Status:** OWNER APPROVED — nine-state product design complete (9/9)  
**Audience:** OTR Beta Main Product Chat → Unified Codex Beta Delivery Coordinator  
**Nature:** Incremental product-design handoff; not implementation authorization or code audit.

## 1. Executive Summary

P5 covers scheduled train, intercity bus/coach, ferry and water-taxi Trip Items. Flights remain P2; rentals P4; personal Event-to-Event travel assistance belongs to TTR. The Day Feed presents each scheduled transport **Segment as its own Canonical Trip Item** even when multiple segments share a Booking or Ticket. The design emphasizes immediate boarding information and usable tickets Today, planning and location verification in Future, and accurate historical recall in Past. It does not infer actual travel, guaranteed connections or live status from scheduled records.

Nine Browse / Focus / Immersive states have been confirmed by the Owner. The last confirmation approves **Past Immersive**: up to three photos explicitly linked to the current Segment at the top, View all for more, and a full Ledger-linked expense presentation with editing and post-trip additions.

## 2. Approved Product Decisions

Decision IDs below identify this P5 design discussion. Approval is for **product semantics**, not proof of runtime capability.

| ID | State | OWNER APPROVED decision |
|---|---|---|
| P5-TB-01 | Today × Browse | Do not show a Show Ticket action in Browse. Ticket is prominent in Focus, using existing NOW/Focus behavior; no new timing threshold. |
| P5-TB-02 | Today × Browse | Show one compact line of known boarding facts (platform/bay/pier, coach, seat as applicable); do not invent missing facts or imply real-time validity. |
| P5-TF-01 | Today × Focus | If exactly one eligible accessible ticket applies, open it directly. When multiple accessible tickets or shared-ticket selection requires disambiguation, show a lightweight selector. |
| P5-TF-02 | Today × Focus | Boarding details precede the prominent Ticket action. |
| P5-TI-01 | Today × Immersive | Current Segment is the primary detail; other explicitly related Segments appear as quick links, not one merged multi-segment timeline. |
| P5-TI-02 | Today × Immersive | Show Booking-level linked expenses with explicit multi-Segment coverage; never duplicate a shared expense or mislabel it as the cost of one Segment. |
| P5-FB-01 | Future × Browse | Separate Segment cards, with lightweight Booking association markers only where an explicit relationship exists. |
| P5-FB-02 | Future × Browse | Do not display connection/transfer gap calculations in Browse. |
| P5-FF-01 | Future × Focus | Provide direct Booking and existing Ticket shortcuts when accessible; retain single-ticket direct opening / necessary selection. |
| P5-FF-02 | Future × Focus | Do not repeat other Segment links in Focus; related Segments remain in Day Feed and Immersive. |
| P5-FI-01 | Future × Immersive | Show accessible passengers individually with their known seat/coach/boarding details. |
| P5-FI-02 | Future × Immersive | Do not add a separate Booking Summary page; use the related Segment list and original Booking. |
| P5-PB-01 | Past × Browse | Retain departure and arrival scheduled time/location two-sided layout. |
| P5-PB-02 | Past × Browse | Show count of authorized explicitly linked photos if nonzero, without thumbnails. |
| P5-PF-01 | Past × Focus | Show accessible passenger/seat summary, collapsing when numerous. |
| P5-PF-02 | Past × Focus | Retain Ticket and Booking historical-document shortcuts. |
| P5-PI-01 | Past × Immersive | Top photo preview contains up to three photos explicitly linked to the **current Segment**; View all opens more; no empty gallery. |
| P5-PI-02 | Past × Immersive | Show full linked Total, My Share, original currency and expense coverage; quick edit via Ledger; allow adding photos, attachments and expenses after travel. |

**Inherited approved cross-renderer decision — EXP-EDIT-01:** manual grouped Edit with an `Update from Document` Capture entry; results proposed for user confirmation before changing current item. Adding an attachment alone does not imply AI parsing. Existing permission and owning mutation rules apply.

## 3. UX / User Journey Contracts — Nine States

| Period | Browse | Focus | Immersive |
|---|---|---|---|
| **Today** | Operator/mode/service; scheduled departure and arrival; one line of known boarding facts; no Show Ticket action. | Boarding location/platform/bay/pier, coach/seat as applicable; then prominent usable Ticket action; station/location and contact affordances only if available. | Current Segment complete details; accessible tickets/passengers; related Segment links; original Booking/Documents; linked expenses with coverage; edit/add actions. |
| **Future** | Same route/time structure; independent Segment cards and subtle explicit Booking grouping; no connection gap or ticket action. | Departure and arrival locations each have View on Map; Booking and accessible Ticket shortcuts; no redundant related-Segment panel. | Segment-centered planning details; accessible passengers/seats; linked Segments; original documents; expenses and editing; no new Booking Summary. |
| **Past** | Preserve two-sided scheduled departure/arrival; optional linked-photo count; no boarding actions. | Scheduled route, authorized passenger/seat summary (collapse when long), photo count and expense count; Ticket and Booking historical shortcuts. | Top 3 current-Segment photos + View all; journey/people and related Segments; complete Ledger-linked expenses and coverage; original tickets/documents; add/edit actions. |

### Journey and interaction details

- **Ticket access:** For Today Focus and Future Focus, directly open a single unambiguously eligible accessible Ticket. Show a chooser only where needed. A shared Ticket is one entitlement/document, not duplicated per passenger or Segment. Past Ticket is a historical-document action, not an assertion of current boarding validity.
- **NOW:** The existing Experience NOW/Focus contract controls focus timing and arbitration. P5 specifies what appears once focused; it does **not** authorize a new automatic-focus trigger or threshold.
- **Location:** Future uses `View on Map` for each relevant departure/arrival point; Beta may hand off to an external map, including name/area keyword search where coordinates are not qualified. No in-app unified Map View is required for this P5 Delta. Today can emphasize immediate boarding location and applicable directions. Do not invent qualified coordinates.
- **Editing:** The Immersive top-right menu contains authorized Edit/Cancel/Remove actions; bottom content area offers Add Attachment/Photo/Expense. The edit form includes `Update from Document` via Capture. Editing OTR records does not amend a supplier booking.
- **Expenses:** Quick edit opens the existing Ledger flow. One linked expense can cover multiple Segments, displayed with explicit scope (e.g. “Booking total · covers 2 segments”) without double-counting. Total and My Share use Ledger authority and Trip currency; original currencies are presented for the total, respecting mixed-currency reality. No Per Night/Per Day calculation for P5. Do not infer payment from a quoted fare.
- **Photos:** Past Browse count, Past Focus count, Past Immersive three-photo preview. Current-Segment photo association is required; do not silently aggregate every photo in the Booking. If Photos integration is unavailable, gracefully omit evidence UI rather than block the Segment renderer.

## 4. Beta Product Scope

### Beta required product behavior

- P5 mode-specific labels for train, coach/bus, ferry/water taxi with shared route/time geometry.
- Independent Segment Browse/Focus/Immersive and explicit Booking/Ticket relationships.
- Ticket and original-document access governed by actual availability and actor permission.
- Appropriate date/time and boarding details only where source facts exist.
- Current Segment primary in Immersive; related Segment shortcuts only in Immersive.
- Past historical presentation without inferred completion.
- Existing shared editing, Capture, Documents and Ledger entry semantics, subject to available accepted integrations.

### Conditional / graceful degradation

- Photo galleries, linked expense summaries, ticket download/offline access and Capture updates appear only when their owning modules and permissions support them. Absence must not block basic P5 rendering.
- External map location/keyword handoff is the Beta-level location affordance; no placeholder embedded map.
- When arrival time, seat, platform, pier, phone, Ticket or document is unknown, omit that element without fabricating defaults or creating spurious warning states.

### Deferred / rejected

- **REJECTED for Beta:** Merged multi-Segment Browse card, Booking-wide multi-Segment Immersive timeline, extra Booking Summary page, related-Segment card in Future Focus, transfer-gap line in Future Browse, ticket action in Today Browse.
- **DEFERRED / outside P5 Beta:** New live train/ferry/bus provider status, guaranteed transfer validation, route planning, a new TTR-like transport relation, in-app map integration, generalized boarding-step engine, and low-frequency special bookings already deferred by the overarching P1–P6 contract.
- **Not approved:** A new automatic NOW threshold, a new P5-specific Ledger, Photos, Ticket or Capture persistence architecture.

## 5. Business Rules & Authority Boundaries

1. **Core:** Owns Canonical Trip Item/Segment identity, time/location/participation authority, actor-scoped access, mutations and sync. UI adjacency never establishes a relation.
2. **Booking:** One Booking may relate to many Segments; one Segment may have relevant Booking links. An explicit relationship is needed before labeling segments as associated.
3. **Ticket:** Independent passenger/segment entitlement and original artifact; a single Ticket may cover several Segments or passengers. Access does not follow automatically from shared Booking membership.
4. **Documents:** Owns original confirmation/instruction attachments, visibility and available local/offline viewing. P5 never fabricates a QR code.
5. **Ledger:** Owns amounts, original/Trip currencies, valuation, personal share, correction and permissions. Shared Booking expenses remain single Ledger records regardless of how many P5 Immersives link to them.
6. **Capture:** Supplies newly acquired source materials and suggested updates under its accepted admission/mutation workflow; P5 only establishes current-Segment context and a user-facing entry point.
7. **Photos:** Owns actual photo linkage and permissions. A linked photo does not prove the passenger boarded or completed travel.
8. **TTR:** Owns personal Event-to-Event assistance, not Canonical P5 segments. P5 must not infer transfer feasibility or create synthetic TTR transitions.
9. **Experience / G2:** Owns one Day Feed Composer, global Focus/NOW and scroll/date behavior. P5 consumes existing presentation contracts rather than creating its own navigation/focus system.
10. **Members:** Person applicability, participant visibility and passenger rights remain qualified upstream. A shared group itinerary does not grant access to all private tickets or passenger details.

## 6. Cross-Module Dependencies & Interfaces

| Module | Product interface expectation | Status / caveat |
|---|---|---|
| Core v2 | Authorized P5 Segment projections, stable identity, time/locations, relationships | Existing product contract; exact P5 production implementation **UNVERIFIED** in this design freeze. |
| Experience / G2 | P5 renderer in Browse/Focus/Immersive with shared NOW/Focus/scroll | Shared Day Feed Lab established; P5 final native integration **UNVERIFIED**. |
| Capture / Import | Booking/Ticket/Segment linking; Update from Document | Product expectation approved; complete P5 adapter and admission **UNVERIFIED**. |
| Ticket / Documents | Actor-scoped original Ticket, Booking and instruction viewing | Respect owning module readiness and offline availability. |
| Ledger | Linked costs, My Share, original currency, multi-Segment coverage and quick edit | Ledger exists; P5 linkage readiness **UNVERIFIED**. |
| Photos | Current-Segment linked-photo count/preview and add | Photos integration may be absent; not a P5 blocking dependency. |
| Members | Qualified passenger visibility and Ticket entitlement | Do not infer from Trip membership. |
| TTR / Maps | No P5 transfer calculation; future unified Map View | External map handoff is sufficient for Beta; TTR production authority separately gated. |
| Notifications | No new P5-specific alert contract approved | No implementation dependency introduced. |

## 7. Acceptance Criteria

- **Single Segment:** Train, bus and water taxi show known route/time/operator/service facts without requiring absent seat/platform fields.
- **Multiple Segments:** Two or more explicit Booking-related Segments remain separate Feed items, each with its own Focus and Immersive; related Segment links exist in Immersive only. No inferred protected transfer or displayed gap in Future Browse.
- **Ticket:** One eligible ticket opens directly; ambiguous/multiple accessible tickets require selection; shared Ticket is not duplicated; no inaccessible passenger Ticket is exposed.
- **Boarding:** Today Browse shows a compact known boarding-fact line but no Ticket action; Today Focus shows boarding details then prominent Ticket action; missing facts simply disappear.
- **Future:** Each endpoint has a map-view action when location text/coordinates are usable; keyword search does not become a trusted Core coordinate. Booking and Ticket shortcuts are conditional on available accessible records.
- **Passengers:** Future Immersive lists accessible passenger/seat details; Past Focus summarizes them and collapses long lists.
- **Past:** Browse retains scheduled two-sided time layout; Focus shows photo/expense counts; Immersive shows at most three explicitly linked Segment photos and View all. No Travelled/Completed assertion merely because a date passed or evidence exists.
- **Expenses:** Booking-wide linked expense is labeled as covering multiple Segments; no duplicate ledger total; Total/My Share and original currency come from Ledger. Quick edit and add operations obey permissions and preserve owning Ledger behavior.
- **Editing/attachments:** Edit and Update from Document are distinct; adding an attachment alone does not invoke remote AI; user-reviewed suggested updates do not overwrite unrelated fields.
- **Offline/privacy:** Locally available original files remain viewable offline; missing local assets are represented honestly; account/member isolation applies across tickets, passenger details, photos and expenses.
- **Shared UX:** P1–P4 and Flexible/TTR behavior, one Composer, Focus, NOW, date and scroll preservation remain unaffected by P5 presentation.

## 8. Superseded Decisions

- No prior accepted P5 decision was revoked during the final Past Immersive approval.
- Suggestions for a combined multi-segment card, transfer gap display, Future Focus related-segment card and Booking Summary were explicitly not selected; do not revive them as Beta requirements.
- Existing P1–P6, W0/Core, Ticket/Booking/Document, G2 and cross-renderer Edit contracts remain valid unless an explicit newer Owner decision supersedes them.

## 9. Open Product Questions

**None blocking P5 nine-state design handoff.**

Any future question about the unified embedded map, expanded Photos capabilities, actual transport status providers or low-frequency transport edge cases belongs to its respective later product scope. Technical interface/readiness questions are for Coordinator engineering assessment, not automatic Owner product blockers.

## 10. Coordinator Handoff Notes

1. Submit this Delta first to **OTR Beta Main Product Chat** for cross-domain consistency/scope reconciliation. That chat alone issues Codex Coordinator updates and implementation authorization.
2. Reconcile accepted nine-state P5 semantics with current Git contracts; verify actual Core P5 data/read/write readiness, Ticket/Document access, Booking N:M relationships and Ledger/Photos linkage without redefining their ownership.
3. Implement or fixture-test independently of P6 design. Missing Photos/Ledger linkage must degrade gracefully; it is not permission to invent new schema or block the base renderer.
4. Preserve one shared G2 Composer, native Browse/Focus/Immersive geometry and existing NOW semantics. Ordinary visual details go to Visual QA, not Owner reapproval.
5. If current Git contracts materially conflict with an approved product behavior, surface a narrow product-semantic discrepancy through the main product chat; handle ordinary implementation details autonomously.
6. This document records Owner-approved **product behavior only**. It does not assert P5 production code or native acceptance, authorize migrations/providers, or grant protected-environment access.

---

**Freeze status:** P5 9/9 design states OWNER APPROVED on 2026-10-13. Ready for main-product review and incremental delivery handoff; P6 design proceeds independently.
