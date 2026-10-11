# OTR Mobile 2.0 — Unified Trip Data Contract: L1 + L2 v0.1

**Date:** 2026-10-11  
**Status:** Consolidated Owner design decisions; **not** authorization to code, migrate, or import.  
**Legend:** CONFIRMED = explicitly agreed; PROPOSED = recommended but not finalized; OPEN = to decide or audit.

## 1. Architecture and responsibility

**CONFIRMED:** Design a unified logical model covering P1–P10 now, then design P3–P10 Experience and Import around it. Logical design freeze does not mean immediate physical database migration. Core/Canonical owns persistent facts, permissions, versioning and offline sync; Import/Capture owns evidence, extraction, candidates and admission; Experience owns presentation; Ledger owns expenses; Documents owns originals; Wallet is a view of entitlements, not duplicate ticket storage. User should not maintain system data completeness.

## 2. L1 — Dated Trip Item

**CONFIRMED:** Trip Item is an independent dated itinerary arrangement. Minimum business input is **Title + local Date**; date may be inherited from selected Day. System maintains identity, Trip scope, creator, revision and sync metadata. Creating a Trip Item directly does **not** require creating a Pool entry.

| Input | Placement | Rules |
|---|---|---|
| Title only, no date | Unscheduled candidate/resource, not yet dated Trip Item | May be personal Pool; exact global Capture staging OPEN |
| Title + Date | Day **TNS (Time Not Set)**, at top | Addition-order default; optional reorder later |
| Title + Date + Start | Day Timeline | End optional, no invented duration |
| Title + Date + Start + End | Day Timeline | End time smaller immediately below start in Browse |

**CONFIRMED L1 optional fields:** Start, End, a **single user-facing optional place/address entry**, Notes, Participants (system default), 0..N attachments, 0..N explicitly linked Ledger expenses, 0..N Booking/Ticket associations. User need not supply address, verified place, coordinates or location separately. Can paste an address. System may recognize place from Title and Trip area, autocomplete, enrich address/coordinates when reliably matched; preserve authored text. Offline and provider failure never prevent saving. Unverified place text may be handed to external map *search*, not represented as verified navigation or qualified TTR endpoint. Apple MapKit place search is a candidate, not an approved provider/licensing solution.

**CONFIRMED participant scopes:** Organizer-created/imported Item with no explicit participants → dynamic `WHOLE_GROUP` (all current Trip members, including later joiners), not N duplicated associations. Ordinary member-created Item without selection → `SELF`. Explicit selection → `SELECTED_MEMBERS`, immediately visible to selected members without approval/acceptance. Creator and participants are separate facts. Overlapping events stay visible; no automatic deletion or reschedule. Future personal swipe-hide without changing shared facts is PROPOSED, not implemented. Exact edit/delete permissions OPEN; no event-level approval workflow.

**CONFIRMED display:** Missing optional values collapse cleanly (no empty label, row or action). Notes remain simple free text. Every Trip Item can link attachments and expenses. No End → no End line. Only a qualified date anchors TNS; a global undated voice request must not silently become today's Item.

## 3. Pool / Flexible boundary

**CONFIRMED target semantics (also see `OTR_Flexible_Block_Pool_Contract_v0.1`):** Activity/Place Resource is reusable discovery material; Trip Item is a distinct dated plan. Personal Pool contains explicitly saved/favorited resources; contextual recommendations/search may be ephemeral, not automatically favorites. Organizer-imported candidates can be shared resources; a member's favorites are not automatically shared. Pool is not a mandatory staging step for manual Trip Item creation.

Flexible Block is a single-day time-window context, with Group and Personal Choice Sets referencing resources. Favorite, Choice membership, publication, scheduled Event and visit evidence are independent. Dragging Group/published Choice to My Choice **copies the selection association** and no private booking/expense/participant data. Extracting a Choice into Timeline creates an independent Fixed Trip Item; it does not split Block or mutate other members' Choices. Exact extraction, unlink, undo and Pool filtering are OPEN. TNS (date, no time) is distinct from Trip Pool (undated) and Flexible Block (time window).

## 4. L2 — Separate Booking / Ticket / Document identities

**CONFIRMED:** Booking represents a reservation for a service; Ticket/Entitlement represents the right to use something; Document preserves original evidence; Wallet displays Ticket/Pass, not a second ticket database; Trip Item is a plan. Each may exist independently. Relations can be 0..N, not forced 1:1. One Booking may generate multiple Tickets, or a group entitlement; multiple files can evidence one Ticket. A Hut is not inherently a Booking merely because it is a Hut; explicit booked intent or qualified booking evidence is required. A generic Hut Pass without assigned use can live in Wallet without a dated Item; a hotel booking with qualified stay dates normally generates/links a Trip Item automatically.

### L2 common logical fields

| Field | Booking meaning | Ticket meaning | Requirement |
|---|---|---|---|
| Title | Service/reservation name | Entitlement name | Name for independent human-readable record; raw document can exist before classification |
| Supplier / Issuer | Service provider | Issuer | Optional |
| Reference | Booking ID/confirmation | Ticket/pass number | Optional |
| Status | Reservation status | Validity/usage status | Optional/Unknown; no implicit Confirmed |
| Time facts | Check-in/out, pickup/return, departure/arrival | Validity windows, allowed use dates | 0..N role-qualified |
| Place facts | Property, terminals, pickup/return locations | Valid venues, region, network/scope | 0..N role-qualified |
| Booked by / Holder | Booker when known | Holder or group capacity | Optional |
| Documents / Expenses | Explicit links | Explicit links | 0..N |
| Trip Items | Qualified association | Qualified association | 0..N |
| Notes / Evidence | Human note plus original source | Human note plus original source | Separate concepts |

**CONFIRMED:** Booking/Ticket maintain their *own* time/place facts independent of Trip Item. Booking check-in eligibility need not equal user's planned hotel arrival. Ticket validity need not equal a scheduled use. Use **role-qualified temporal/spatial facts**, not only one universal start/end/address. Hotel check-in/out, rental pickup/return, ferry/flight departure/arrival, ticket valid-from/until or several venues are examples. For nationwide participating venues, preserve coverage text rather than inventing one address or thousands of place rows. Small controlled common role vocabulary + type-specific roles is the design direction; exact role schema, enums, precision and storage are OPEN. Preserve original rule text and source-linked unparsed fragments, not just user Notes.

**CONFIRMED forms:** Type-natural fields, common essentials visible, More Details collapsed. Hotel/Hut check-in/out dates prominent (times optional); rental pickup/return dates **and times** prominent; flights/ferries endpoint dates/times as known; ticket use/validity depends on type. Do not expose technical role names or coordinates. Incomplete records may be saved without fabricated confirmation.

## 5. Universal Smart Entry / Import

**CONFIRMED:** All manual entry forms have prominent **Scan / Import** (photo, PDF, file, pasted text as supported). Manual and scan share the same business form/contract. Online uses OCR/document extraction plus remote LLM interpretation as appropriate; bounded retries/provider fallback with privacy, cost and idempotency. Offline saves original file immediately, optionally performs local OCR/model if feasible, queues for network recovery. Apple on-device model feasibility OPEN.

**CONFIRMED default workflow:** User may leave immediately; durable background processing extracts, validates, deduplicates and **automatically admits/creates/updates qualified Booking, Ticket and Trip Item without mandatory user confirmation**. Only consequential conflict/ambiguity needs nonblocking Review. Optional **Wait for result** shows filled form for edits; user edits must not be overwritten by concurrent background commit; leaving resumes background behavior. One import task produces one coherent business outcome, no duplicate admission. Original evidence, candidate interpretation, accepted facts remain distinct; no bypass of owning-domain admission, authorization, versions or temporal qualification. Unmapped structured fields remain source-linked for later reinterpretation, not silently thrown into Notes.

## 6. Attachments, linking, Wallet and Focus

**CONFIRMED:** Primary user action from a Trip Item is **Add attachment**, with Upload new or Choose existing as a fallback. Do not require manual understanding of Booking/Ticket/Document relations. A Document uploaded from Item A remains attached to A as user intent. If its extracted Ticket clearly belongs elsewhere, save Ticket to Wallet but **do not link Ticket to A**; create one nonblocking Review notification, without interrupting the upload. Qualified unique global Capture match may auto-link existing Item; ambiguity retains standalone record. Review only when meaningful; do not create repeated notifications on retries.

**CONFIRMED Focus:** Small Ticket/Pass icon when accessible; attachment summary `📎 ×N` counts independent files (one PDF yielding five entitlements counts as one attachment). No technical 'Booking linked' label. Missing actions/links hidden. Full management can be in Immersive. Trip Home unified Bookings & Tickets widget/list is a PROPOSED entry; **do not** show `Needs linking` technical jargon. Wallet reads the same entitlement facts.

**CONFIRMED holder rule:** Booking booker, Ticket holder/capacity and Trip Item participants are different. Group ticket can record `5 persons` without assigning five member names. If ticket prints names, try matching Member name/AKA; uncertain match stays unlinked and does not require user cleanup. No participation approval state.

## 7. Deduplication, state, revisions and rescheduling

**CONFIRMED:** Exact duplicate file → no duplicate Booking/Ticket. Different files with reliable same order/entitlement → one identity, multiple evidence records. Explicit amendment/cancellation updates current Booking while preserving history; uncertain order/identity/conflict → no destructive merge/overwrite, nonblocking Review. Booking reference is a strong clue but not globally unique by itself. Ticket state is independent; past date does not prove 'used'. Example statuses (Unknown/Confirmed/Cancelled; Valid/Used/Expired) are illustrative, **final enums OPEN**.

**CONFIRMED automatic change propagation:** If Booking reschedules, an associated **system-generated and never user-edited** Trip Item may auto-update when the same Booking and qualified amendment are established. A user-created or manually changed Item retains user scheduling; show nonblocking Review rather than silently override. If identity uncertain, no automatic update. Preserve field provenance/user-edit flags, revisions and idempotency without burdening user.

## 8. Required field classification across P1–P10

**CONFIRMED direction:** For each field distinguish (1) required to save, (2) required to place in dated Day/Timeline, (3) required for a specific action, (4) enrichable from local/online evidence. A field can be optional for saving but necessary for route computation or formal Flight admission. Missing facts are not invented to make the UI pretty. All types inherit L1 abilities and can use L2 links; type-specific roles/forms are designed on top. Import must target the same accepted business model as manual entry.

## 9. Open items / implementation boundaries

- **OPEN:** Exact logical/physical mapping to existing Canonical Event/Trip Root, Reservation registry, SQLite/Supabase, Day Projection, admission commands and offline sync. Audit current contracts before proposing migrations; no new SQL authorized by this document.
- **OPEN:** P1–P10 final taxonomy and type-specific fields/roles, actual form UX, complex Booking→multi-Event generation, qualified matching thresholds, reconciliation/undo, authoritative timezone/instant rules, per-member edit permissions.
- **OPEN:** Map/place search provider selection, data licensing, cache/retention and fallback; local OCR/Apple model capability; notification presentation and background execution guarantees.
- **OPEN:** Pool/Choice extraction transaction, cross-device conflict policy, saved recommendation filtering, final Trip Home Bookings & Tickets widget.
- **EXISTING / UNVERIFIED:** P1/P2 Gallery acceptance and partial production Day Feed, CP13A/B Flight Import foundation, F0/F1 Faroe regression work; these do not prove the L1/L2 target contracts are fully persisted or import-ready.

## 10. Cross-workstream handoff and sequence

1. **Owner:** Accept this as L1/L2 business baseline, with OPEN items explicitly unresolved.
2. **Core + Import + Experience:** Compare against `docs/trip/`, existing architecture contracts and Faroe F0/F1 field-fidelity findings. Produce shared field/relationship delta with owning domain; do not duplicate authority.
3. **Owner:** Review common logical model and P1–P10 type-specific additions together, before implementation. Allow incremental physical migrations only when needed.
4. **Experience:** Design P3–P10 Browse/Focus/Immersive and type-natural forms against accepted data contracts, including missing-field behavior.
5. **Import:** Recognize accepted fields, retain unknown source evidence, qualify automatic admission and only escalate consequential conflicts.
6. **QA:** Use private Faroe raw corpus separately from reviewed oracle and synthetic fixtures. No private images/QRs/tokens in tracked CI. Historical plans are not proof of visits.

**Overall product rule:** User enters the least possible, OTR structures and links what is reliably known, hides absent optional display, automatically handles safe cases, and only interrupts for consequential conflicts.
