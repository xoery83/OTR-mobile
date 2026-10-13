# OTR Mobile 2.0 — P3 Accommodation Product Design Delta

**Date:** 2026-10-13  
**Domain:** Experience / P3 Accommodation  
**Status:** OWNER APPROVED — PRODUCT DESIGN; implementation authorization remains with main Product Chat / Codex Coordinator  
**Purpose:** Incremental handoff of the nine-state P3 Renderer. Do not wait for P4–P6.

## 1. Executive Summary

P3 presents a multi-day Stay through a shared accommodation identity, with date-specific Check-in, Daily Base and Check-out appearances in Day Feed. Future emphasizes planning and map location; Today emphasizes timely access and operations; Past emphasizes memory and authorized linked expenses. All three time contexts share the same Stay Immersive, with contextual priority changes. No new accommodation data authority, AI access-fact extractor, or embedded map is required for Beta.

## 2. Approved Product Decisions

| ID | Decision | Status |
|---|---|---|
| P3-TB-01 | Today middle-day Daily Base is a lightweight Day Feed row **at the end of the day's scheduled activities**, not a top TNS item; no invented evening time. | OWNER APPROVED |
| P3-TB-02 | Today Browse does not repeat check-in/access instructions; relevant material belongs in Focus. Existing NOW/Focus behavior applies; exact automatic-trigger threshold is not redefined here. | OWNER APPROVED |
| P3-TB-03 | With no precise address, allow external map **keyword search by accommodation name plus known area**, clearly distinct from verified navigation. | OWNER APPROVED |
| P3-TF-01 | Today Focus directly offers an **original Check-in Instructions** link/document rather than a generated Access Facts summary. | OWNER APPROVED, latest superseding clarification |
| P3-TF-02 | Today Focus quick actions vary by Check-in / Staying / Check-out; omit unavailable actions. | OWNER APPROVED |
| P3-TI-01 | Check-in, Daily Base and Check-out open **one Stay Immersive**, with contextual information priority. | OWNER APPROVED |
| P3-TI-02 | Open original instructions in OTR when supported (PDF/image/text), external app/site when necessary. | OWNER APPROVED |
| P3-TI-03 | Edit and cancellation/removal management are in the upper-right menu, respecting existing Booking/Item lifecycle contracts. | OWNER APPROVED |
| P3-TI-04 | Add Attachment, Photo and Expense affordances belong in the lower content/action area, respecting owning module availability and permissions. | OWNER APPROVED |
| P3-FB-01 | Future displays a lightweight Daily Base **on every middle night**, at the end of that day's activities. | OWNER APPROVED |
| P3-FB-02 | Show `Confirmed` only with explicit supporting source; otherwise show **no booking-status label**. Do not infer Pending/Not booked or continually verify supplier status. | OWNER APPROVED |
| P3-FB-03 | Future prioritizes **View on Map**, not Directions; Beta may use an external map entry. | OWNER APPROVED |
| P3-FB-04 | Do not build an embedded OTR map for Beta; revisit common Map View / Immersive relationship later across modules. | OWNER APPROVED scope direction |
| P3-FF-01 | Future Focus displays **full Stay dates and night count**, while retaining the selected date's node role. | OWNER APPROVED |
| P3-FF-02 | Future Focus Booking action opens the original confirmation directly; if several authorized documents exist, first offer a selection list. | OWNER APPROVED |
| P3-FI-01 | Future Immersive offers only **View on Map**, with no empty embedded-map placeholder. | OWNER APPROVED |
| P3-FI-02 | Do not display nearby Trip Items in P3 Immersive; future unified map design may revisit spatial presentation. | OWNER APPROVED |
| P3-FI-03 | Show **registered guest names where supplied**; do not infer them from Trip Members; keep Booking/room association and privacy. Applies to shared Stay Immersive. | OWNER APPROVED |
| P3-PB-01 | Past retains a lightweight Daily Base on each middle day, at the end of the day's activities. | OWNER APPROVED |
| P3-PB-02 | Past Browse shows linked-photo **count only** when authorized photos exist, no thumbnail or empty gallery. | OWNER APPROVED |
| P3-PF-01 | Past Focus retains original Booking shortcut, lower priority than accommodation identity and photos. | OWNER APPROVED |
| P3-PF-02 | Past Focus shows authorized linked **expense count**, not money amounts. | OWNER APPROVED |
| P3-PI-01 | Past Immersive shows **up to three photos at the top**; tap View all for more; no empty gallery. | OWNER APPROVED |
| P3-PI-02 | Past allows later addition of authorized photos, attachments and expenses. | OWNER APPROVED |
| P3-PI-03 | Past Immersive groups **Total Cost + Total Per Night** together and **My Share + My Share Per Night** together. Primary amounts use Trip currency; original currency appears **only under Total Cost**, not My Share. | OWNER APPROVED, final revision |
| P3-PI-04 | Linked expense amounts, FX conversion, shares and visibility come from Ledger, not an independent P3 ledger. | APPROVED existing authority boundary |
| P3-AI-01 | Beta does **not** extract or summarize structured Access Facts with LLM; direct access to original instructions instead. | DEFERRED to Phase 2 / REJECTED as Beta requirement |

**Decision provenance:** Owner confirmations in this Experience / Day Feed Chat on 2026-10-13, sequential P3 Today → Future → Past nine-grid discussion. Older illustrative mockups are not authoritative where contradicted by later Owner messages.

## 3. Nine-State UX / User Journey Contract

| Time | Browse | Focus | Immersive |
|---|---|---|---|
| **Future** | Check-in/Check-out operational nodes; middle-day light Daily Base at day end; hotel/name/area/time when known; evidence-backed `Confirmed` only; map-location intent, not navigation. | Full Stay date range/night count; selected node role; View on Map; direct original Booking or authorized document chooser. | Same unified Stay detail; location and external View on Map, check-in/out, registered guests if known, Booking/Documents; right-top management and lower Add actions. No nearby itinerary or empty map area. |
| **Today** | Check-in/Check-out operational nodes; middle-day light Daily Base at day end; no access-instruction text in Browse. | Check-in prioritizes original Instructions and Directions/Contact as available; Staying prioritizes return/location/contact; Check-out prioritizes deadline/instructions; adaptive quick actions. | Same unified Stay detail, contextual operational priority; original instructions internal-first; Directions/Contact; Booking/Documents; registered guests; right-top management; lower Add Attachment/Photo/Expense. |
| **Past** | Historical Check-in/Check-out nodes and middle-day Daily Base; linked photo count only; no money totals or inferred attendance. | Stay identity, full dates, location; photo and expense counts when authorized; lower-priority Booking shortcut; no money amounts. | Same unified Stay detail with first section up to 3 authorized photos + View all; Stay details; expanded linked-expense summary (Total+per night, My Share+per night, original currency only for Total); documents and lower Add actions. |

All nine states are product-approved at semantic level. Visual spacing, typography, animation and layout tuning remain Visual QA responsibilities.

## 4. Shared UX / User Journey Rules

- A Stay has one unified detail destination across dates; date-specific Day Feed appearances do not create separate Stay records.
- Check-in and Check-out appear as distinct operational appearances; a middle-day Daily Base has no invented clock time and is not forced into TNS. Same-day different accommodations remain distinct.
- Accurate location → map location/directions as context permits. Name/area only → external keyword map search; never promote a search result to authoritative coordinates automatically.
- Future `View on Map` is distinct from Today `Directions`; no Beta embedded map and no empty placeholder.
- The original Booking/Instructions source is accessible directly when available; several authorized documents require selection. Missing files/actions are omitted rather than displayed as fake availability.
- Existing Day Feed global Focus, NOW, Immersive navigation, row identity and nonzero scroll restoration remain shared G2 responsibilities. No new P3 Focus controller.
- Past Stay and linked evidence **do not prove actual check-in or attendance**. Do not infer `Stayed`, `Completed` or `Visited`.
- Right-top edit/cancel/remove respects existing Booking-versus-Trip-Item authority and permissions; lower Add actions link content to the Stay but do not create a new storage/ledger framework.

## 5. Scope Impact

**Beta 0 — required product semantics:** Nine-state renderer using accepted Day Feed/G2 contracts; unified Stay Immersive; check-in/base/check-out distinctions; context-sensitive Focus; original document links; external map handoff; optional registered guests; proper empty/permission states. Exact Beta 0 engineering feasibility must be reconciled by main Product Chat.

**Beta 1 — conditional on owning modules:** Actual Photos gallery/add, Ledger linked-expense summary/add, and richer Documents association where their accepted capabilities exist. Preserve UI contract and graceful absence; do not block basic P3 on unfinished Photos/Ledger linkage.

**Phase 2:** AI-structured Access Facts/summary, embedded unified Map View and map–Immersive composition, nearby-itinerary spatial presentation, supplier booking-status verification.

The Beta 0/Beta 1 labels above are **handoff recommendations for cross-domain scope reconciliation**, not a new unilateral implementation authorization.

## 6. Cross-Module Impact / Authority

| Module | Authority / P3 expectation | Status boundary |
|---|---|---|
| Core / Trip | Canonical Stay/Item identity, dates, participant visibility, Day projections and mutation rights. | Existing owning contracts; do not derive authority from UI placement. |
| Booking | Reservation identity, confirmation source, cancellation and multi-booking/room associations. | Original docs shown only when authorized. |
| Capture / Import | Import and later supplementation may associate source material to existing Stay. | No Beta AI Access Facts requirement; P3 does not initiate model calls on Focus. |
| Documents | Original Booking and check-in/out instructions; in-app viewing when supported, otherwise external. | Do not create P3-specific viewer or falsely promise offline content. |
| Members | Registered guests from reservation are **not** automatically Trip Members; apply source-specific visibility. | Names shown only if supplied/authorized. |
| Ledger | Linked expenses, Trip-currency values, FX, My Share and authorization; per-night display uses Stay night count. | No duplicate ledger; multiple original currencies displayed separately, no fictitious single original-currency sum. Hide unknown/unavailable totals rather than zero. |
| Photos | Authorized Stay-linked photos, top-three preview and View all, later additions. | Do not prebuild Photos framework or block base P3. |
| G2 / Experience | Single Composer, Focus, NOW, Day Feed and Immersive shell. | P3 renderer supplies only its content and intents. |
| Maps / TTR | Future map viewing versus Today navigation; location keyword search is not a qualified TTR endpoint. | Unified embedded Map View later; no new TTR relation inferred. |
| Notifications | Existing NOW/Focus behavior; P3 does not define new trigger timing. | No new notification engine requirement. |

## 7. Acceptance Scenarios

1. Three-night Stay: Check-in on first date, light Daily Base on each middle day at day end, Check-out on last date; all open same Stay detail.
2. Same day Hotel A Check-out and Hotel B Check-in remain distinct; same-day single-night Stay retains both roles without duplicate full Booking cards.
3. Unknown time: show known date/role without inventing 14:00/10:00 or 20:00.
4. Future Focus shows full Stay date range and opens authorized original confirmation directly; multiple confirmations show chooser.
5. Confirmed appears only with evidence; missing supplier status produces no `Pending`/`Not booked` label.
6. Precise location supports map view; hotel-name-only location opens map keyword search without claiming exact location or TTR authority.
7. Today Focus opens original instructions internally when supported, external fallback when needed; absent instructions create no empty entry or AI summary.
8. Registered guest names appear only when sourced and permitted, without auto-filling from Trip Members; multiple room/Booking links remain distinguishable.
9. Past Browse photo count and Past Focus photo/expense counts appear only with authorized linked content; no inferred attendance.
10. Past Immersive top shows maximum three photos and View all; zero photos yields no gallery.
11. Past expense area shows Trip-currency Total + total per night, My Share + my per night; original currency only under Total, with separate lines for multi-currency originals; missing or unauthorized data never becomes a fabricated zero.
12. Add Attachment/Photo/Expense affordances follow owning-module capability and permission; cancelled/removed Stay follows existing lifecycle rather than cascading unauthorized deletion.
13. Offline: previously available local originals remain accessible; unavailable remote/external resources are honestly represented; no hidden LLM call on opening Focus.
14. Focus, NOW, date, scroll and normal P1/P2/TTR behavior remain unchanged through P3 interactions.

## 8. Deferred / Rejected Designs

- **DEFERRED Phase 2:** LLM Access Facts extraction and synthesized operational instructions; unified embedded map, nearby activities, supplier status monitoring.
- **REJECTED for Beta:** showing `Pending`/`Not booked` merely because confirmation evidence is missing; invented arrival/departure times; duplicate Booking cards per Stay day; treating historical booking/evidence as actual attendance; separate P3 media or ledger engine; empty map/photo placeholders.
- **Superseded mockups:** earlier Today Focus example displaying extracted lockbox code, and early Past expense mockup separating Total and Per-night into unrelated cells. Final approved rules above supersede them.

## 9. Open Product Questions

**None blocking P3 nine-state design.** Unified Map View and cross-module map/Immersive presentation are intentionally deferred for later separate design. Photos/Ledger integration sequencing and Beta 0/Beta 1 cut are main Product Chat scope-coordination matters, not grounds to reopen P3 UX.

## 10. Coordinator Handoff Notes

1. Register this Delta as P3-approved product semantics; have OTR Beta main Product Chat check cross-domain consistency and Beta 0/Beta 1 scope before issuing any Codex instruction.
2. Allow P3 delivery independently of P4–P6; do not wait for all renderers.
3. Verify current Git contract against Design Knowledge Freeze, W0 L1–L3 and existing G2 shared renderer/Day Feed interfaces. This document is **not** a source-code audit.
4. Keep Photos/Ledger integration optional/graceful until owning contracts are available; do not invent migrations or duplicate frameworks.
5. Leave routine pixel-level decisions and native visual regression to Visual QA; escalate only genuine product conflicts.
6. Existing approved contracts remain in force unless this Delta explicitly supersedes a listed decision.

**Handoff status:** OWNER APPROVED PRODUCT DESIGN — AWAITING MAIN PRODUCT CHAT CONSISTENCY/SCOPE CHECK; NOT DIRECT IMPLEMENTATION AUTHORIZATION.
