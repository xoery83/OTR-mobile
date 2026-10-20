# OTR P6 Ticketed Activity — Product Design Delta

**Date:** 2026-10-13  
**Status:** OWNER APPROVED — nine-state product design (9/9)  
**Domain:** Experience / P6 Ticketed Activity  
**Audience:** OTR Beta Main Product Chat → unified Codex Beta Delivery Coordinator  
**Nature:** Incremental product-design handoff; **not** an engineering authorization, implementation claim, or replacement for prior contracts.

## 1. Executive Summary

P6 presents scheduled, booked or ticketed activities (performances, museums, timed entry, guided experiences, sporting events) within the existing Day Feed Browse / Focus / Immersive experience. It also accommodates free reservations and activities with Booking Confirmation but no separate Ticket. The nine-state design is now Owner-approved. Today prioritizes arrival/entry and ticket access; Future prioritizes checking arrangements; Past prioritizes historical context, linked memories and financial review. Reuse shared G2 Composer, NOW, TNS, Focus, Ticket, Booking, Documents, Ledger, and Edit/Capture contracts. No separate ticketing system or activity controller is requested.

## 2. Approved Product Decisions

All entries below were explicitly confirmed by the Owner in the P6 nine-grid conversation on 2026-10-13.

| Decision | Approved product behavior | State |
|---|---|---|
| P6-TB-01 | Today Browse emphasizes an explicitly required arrival, meeting or entry time; show activity start as secondary. Do not infer advance arrival time. | OWNER APPROVED |
| P6-TB-02 | Today Browse shows one concise line of known entry, seat or meeting details. | OWNER APPROVED |
| P6-TF-01 | Today Focus opens a single clearly applicable authorized Ticket directly; offer selection when multiple accessible or selectable shared tickets exist. | OWNER APPROVED |
| P6-TF-02 | Today Focus directly displays the current user's authorized seat, entrance and section information when known. | OWNER APPROVED |
| P6-TI-01 | Today Immersive organizes by Ticket, identifies covered participants and displays one shared Ticket only once. | OWNER APPROVED |
| P6-TI-02 | Today Immersive shows Ledger Total Cost and My Share; original currency only under Total; no per-person average. | OWNER APPROVED |
| P6-FB-01 | Future Browse retains one line of known seat/entrance/meeting information, consistent with Today. | OWNER APPROVED |
| P6-FB-02 | Activity with neither a fixed time nor a separately planned time belongs in the shared top TNS presentation; a time-planned visit does not become untimed merely because its ticket is all-day valid. Exact existing TNS ordering implementation requires coordinator reconciliation. | OWNER APPROVED (product rule) |
| P6-FF-01 | Future Focus provides both Booking and Ticket shortcuts when authorized source material exists. | OWNER APPROVED |
| P6-FF-02 | Future Focus displays only admission/seat information confidently matched to the current user; full authorized participant detail is in Immersive. | OWNER APPROVED |
| P6-FI-01 | Future Immersive lists all authorized Tickets, each shared Ticket once, with applicable participants and known entry/seat facts. | OWNER APPROVED |
| P6-FI-02 | Future Immersive retains fast Ledger expense editing, material additions, and Edit / Update from Document. | OWNER APPROVED |
| P6-PB-01 | Past Browse emphasizes scheduled activity start; if absent, use explicitly recorded entry or meeting time. This is presentation priority, not a change to Core time or Composer sorting. | OWNER APPROVED |
| P6-PB-02 | Past Browse shows count only for photos explicitly linked to this activity and authorized for the viewer; no thumbnails or empty placeholder. | OWNER APPROVED |
| P6-PF-01 | Past Focus shows authorized participant/seat summary, collapsing long lists; complete information stays in Immersive. | OWNER APPROVED |
| P6-PF-02 | Past Focus retains historical Ticket and Booking shortcuts. | OWNER APPROVED |
| P6-PI-01 | Past Immersive displays up to three authorized activity-linked photos at top with View all; hide the entire section if empty. | OWNER APPROVED |
| P6-PI-02 | Past Immersive displays Total Cost, My Share, original currency under Total, fast Edit Expense, and Add Photo / Attachment / Expense. | OWNER APPROVED |

## 3. Nine-State UX Contract

| Time | Browse | Focus | Immersive |
|---|---|---|---|
| **Today** | Activity/title, venue, required meet/entry time first and start time second; one concise known admission detail. No Ticket button. | Arrival/entry time and location, current user's known entry/seat/section, prominent Ticket immediately after essential admission details; directions to explicitly stated meeting/entry location and Call where available. | Full activity and entry facts, Tickets grouped by Ticket identity, participants and seats, original instructions/Booking, Ledger totals and edit, additions and edit actions. |
| **Future** | Same known arrival/entry and one-line admission detail; untimed/no planned time follows shared TNS. No Ticket action. | Time, venue/map, current-user matched admission detail, Booking and Ticket shortcuts; no group seat list. | Full authorized Ticket/participant list, venue and original documents, Ledger totals, Edit / Update from Document, additions; View on Map rather than on-site navigation emphasis. |
| **Past** | Activity and venue, scheduled start first (otherwise recorded entry/meeting), photo count if present; no active Ticket/directions/call or financial amount. | Activity, authorized participant/seat summary (collapse when long), photo count, expense count, historical Ticket and Booking shortcuts; no amount. | Photos first (max 3, View all), historical activity facts, Ticket and participant details, Ledger Total/My Share/original currency, fast expense editing, historical documents and additions. |

## 4. User Journey / Interaction Contracts

1. **Approaching a scheduled activity:** user sees required arrival/meeting time in Today Browse; shared NOW/Focus behavior may surface Focus according to its existing accepted contract. P6 does not invent a new threshold or Focus controller. Ticket is an important Focus action, not a Browse button.
2. **Presenting admission:** one clearly applicable Ticket opens directly. If more than one accessible Ticket requires selection, show a small selector. One shared QR/PDF remains one Ticket, with multiple applicable participants as metadata, not duplicate tickets.
3. **Checking plans in advance:** Future Focus gives authorized Booking and Ticket access; Future Immersive supports complete ticket/participant review, source documents and updates.
4. **Updating material:** upper-right Edit opens the shared grouped edit form with Update from Document near its top; capture-derived changes are suggestions to review and confirm, not silent overwrite. Add Attachment saves original material without necessarily invoking AI; Add Photo and Add Expense remain independent Immersive actions.
5. **Reviewing a past activity:** Past Browse/Focus show compact historic context; Past Immersive gives photo-led recall and access to documents, expenses and later additions. A historical Ticket is an archive reference, not a claim of current admission validity.

## 5. Business Rules & Authority Boundaries

- **Activity versus attendance:** scheduled activity, Booking, Ticket, linked photo or expense does not prove the user attended. Do not automatically show Attended/Completed.
- **Distinct people and rights:** Trip Member, Booking Holder, Ticket Holder and authorized attendee need not be identical. Never derive attendee/seat assignments merely from Trip membership. Show only authorized records and confirmed matches.
- **Ticket identity:** a shared ticket remains a single original object. No synthetic QR, duplicate document or forced paid-ticket requirement. Booking-only and free/no-ticket activities remain valid.
- **Time semantics:** meeting, entry, start and general venue hours are different. Use only explicit source facts. All-day ticket validity does not override a specifically planned visit time. Do not change Core scheduling or G2 ordering authority.
- **Location:** when a specific meeting/entrance location exists, on-site Directions should target it; Future uses View on Map, with keyword lookup if only a venue name is known. No Beta embedded map dependency.
- **Ledger:** Total and My Share come from authorized Ledger calculations; original amounts belong under Total. Do not calculate per-person average, synthesize NZ$0, or duplicate an expense per ticket/participant. Edit via existing Ledger surfaces, respecting permissions and correction semantics.
- **Documents and Capture:** show original Booking/Ticket/instructions where authorized; don't manufacture access summaries or imply OTR changes third-party bookings. Automatic parsing is not required for ordinary Add Attachment.
- **Offline:** show already available local documents and data under existing offline policy; do not promise unavailable remote ticket content or live status.

## 6. Cross-Module Dependencies & Interfaces

| Module | P6 expectation | Ownership / verification note |
|---|---|---|
| Core / Day Feed | Canonical activity identity, date/time/venue and actor-scoped visibility; single Composer for placement and TNS. | Core/G2 own authority; P6 only presents. TNS exact top ordering and activity mapping need Git reconciliation. |
| Experience / G2 | Shared Browse, one global Focus, NOW, Immersive navigation, date/scroll restoration and TNS. | Existing shared contracts; no second controller. |
| Booking / Tickets / Documents | Booking references, original admission documents, per-ticket participants, rights and device availability. | Feature-owning modules supply trusted data and authorization. P6 doesn't duplicate ticket objects. |
| Members | Viewer/participant permissions; no automatic Trip-member-to-ticket matching. | Membership and document permissions remain authoritative. |
| Ledger | Total, My Share, original currency, linked expense list, quick edit and add. | Ledger is calculation/write authority; P6 is a consumer. |
| Import / Capture | Update from Document suggests reviewed changes for the current activity; original attachment-only flow is distinct. | Reuse shared approved Edit/Capture UX. No new P6 parser requirement. |
| Photos | Explicit activity-linked authorized photos, counts, first-three preview and View all when available. | Photos integration may be incomplete; preserve graceful absence rather than blocking Renderer. |
| Notifications | Existing NOW behavior only; no P6-specific alert policy or automatic reminders added. | No new notification scope authorized. |
| TTR / Map | Location lookup and qualified inter-item travel assistance remain external to P6. | Do not infer travel feasibility or build a map/routing subsystem. |

**Implementation status disclaimer:** This document records product approval, not a claim that all data linkage, ticket download, photo, ledger or TNS behavior is currently implemented or live-validated.

## 7. Acceptance Criteria / Scenarios

- Today with explicit meeting 08:30 and start 09:00 shows Meet 08:30 first; with no meeting requirement it shows known start only; general venue opening hours do not override start.
- Today Browse has no Show Ticket; Focus has clear ticket access, appropriate admission facts and current-user matched seat; no unauthorized private ticket exposure.
- Unique ticket opens directly; multiple accessible tickets require selection; a shared ticket remains one entry with multiple covered participants.
- Free reservation and Booking-only activity remain usable without false missing-ticket warnings.
- Future with a time-planned visit and all-day-valid ticket stays time-placed; genuinely untimed/no-plan activity uses shared TNS. Verify exact top ordering against accepted G2 contract.
- Future Focus provides Booking/Ticket when present; Immersive shows full authorized ticket list and supports document-driven suggested updates only after user confirmation.
- Past Browse prefers scheduled activity start without modifying underlying chronological authority; counts only authorized explicitly linked photos.
- Past Focus collapses long participant lists, shows photo and expense counts (not amounts), and opens authorized historical documents.
- Past Immersive displays up to three photos then View all; no empty photo gallery; Total/My Share and original currency under Total; editing and additions work only where permitted.
- Changes in user access, source data, or local offline availability never expose stale private ticket, seat, photo or expense data.
- Light/Dark, accessibility, large text, one global Focus, NOW/TNS compatibility, and selected-date/nonzero-scroll restoration remain shared Experience QA criteria. Routine visual polish is owned by Visual QA, not a new Owner product gate.

## 8. Scope Impact

**Beta product scope:** P6 nine-state presentation and approved shortcuts using existing shared capabilities. Where Photos/Ledger linkage is unavailable, omit unavailable sections gracefully without invented values or placeholder galleries. The unified Coordinator decides feasible Beta 0/Beta 1 engineering staging; this design does not unilaterally classify unfinished integrations as Beta 0 prerequisites.

**Deferred / not introduced:** separate P6 ticket-management application, Booking Summary, venue admission verification service, real-time venue/seat updates, automatic attendance detection, generalized operational-step engine, custom embedded map, per-person cost averages, AI-generated access instructions, and a second NOW/TNS/Focus system.

## 9. Superseded Decisions

None within the explicitly approved P6 decision register. The Past-specific time emphasis is a presentation difference from Today/Future, not a repeal of their time priority or the Core/G2 ordering contract. Previously approved shared P3–P5 Edit, document, photo and ledger conventions remain applicable where semantically relevant.

## 10. Open Product Questions

**None required to complete the P6 nine-grid product design.** The exact TNS ordering/mapping is a **Git contract reconciliation**, not a request to redesign or block P6. If reconciliation reveals an actual product-semantic conflict, escalate through OTR Beta Main Product Chat rather than silently rewriting this decision.

## 11. Coordinator Handoff Notes

1. Main Product Chat reviews P6 against P1–P5 shared presentation, Ticket/Booking/Document and current Beta scope; do not re-open confirmed nine-state choices without a demonstrated product conflict.
2. Coordinator verifies the accepted G2 TNS placement contract, existing activity-to-TNS mapping, NOW/Focus behavior, and available ticket/ledger/photo linking in Git. Record implemented versus fixture-only versus design-only status accurately.
3. Implement P6 using the single existing Composer/Focus/Immersive surfaces and authorized data ports. Preserve stable ticket identity and current-user permissions. No new global controller or generic schema framework.
4. Stage independent work without waiting for Trips/Trip Home or other Renderers; gracefully omit unavailable optional integrations.
5. Route routine technical, QA and Visual QA matters through the unified Coordinator. Return to Owner only for genuinely new product decisions.

**Handoff flow:** Domain Product Design Advisor → OTR Beta Main Product Chat → unified Codex Beta Delivery Coordinator. This Delta is OWNER APPROVED as product design, **not IMPLEMENTATION AUTHORIZED** by itself.
