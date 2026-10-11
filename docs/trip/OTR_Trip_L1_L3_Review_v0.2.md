# OTR Mobile 2.0 — L1–L3 Unified Trip Contract and Deep Design Review v0.2

**Date:** 2026-10-11  
**Status:** Consolidated Owner product decisions; **NOT** physical schema approval, migration authorization, or proof of runtime readiness.  
**Scope:** P1–P6, Booking/Ticket/Document/Wallet/Ledger, Capture, lifecycle, Day projections, Beta boundaries.

## 1. Executive decisions

Six primary Experience families are sufficient for Beta: **P1 Generic Activity, P2 Flight, P3 Accommodation, P4 Rental Vehicle, P5 Scheduled Transport, P6 Ticketed Activity**. Dining remains P1 with optional Booking. **Other is not a user-facing type, renderer, or compulsory Trip Item Group.** A complex imported order may relate to multiple Items; a multi-activity document without genuine reservation may retain shared import provenance only. Do not invent a Booking.

**Logical model is not three layers of physical inheritance:** L1 dated Trip Item, typed service facts, and independent L2 Booking/Ticket/Document are linked domains. Wallet is access/presentation, Ledger owns money, Day Feed is projection. This is a design target, not a claim that current canonical persistence already supports it.

**Highest risks:** sparse manual Flight vs strict admission; single authoritative time/place fact; N→M import and deduplication; Cancel/Delete/Replace with shared Booking; ticket permission and per-device download; native real admitted mixed Day Feed. Require repository audit before SQL changes.

## 2. Core invariants and object boundaries

| Object                | Identity and ownership                                                 | Key invariant                                                              |
| --------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Trip Item (L1)        | Dated plan, title + local date minimum; system identity/revision/scope | Date-only → TNS; qualified start → Timeline; no invented end/duration      |
| Typed service details | Flight/Stay/Rental/Transport/Activity semantics, logically associated  | May exist incomplete; no huge universal nullable Event table requirement   |
| Booking               | Reservation/contract; independent from plan                            | One Booking ↔ many Items; ref optional, not globally unique                |
| Ticket / Entitlement  | Rights, quantity, holder, validity, usable credential                  | Independent of Item/Booking; one ticket may cover several segments         |
| Document              | Original source and attachments                                        | Original remains immutable; mention of an attachment ≠ imported attachment |
| Wallet                | Unified ticket/pass access surface                                     | Not a second ticket database, not automatic Apple Wallet conversion        |
| Ledger                | Expense/payment/split authority                                        | Booking price/due is not proof of Ledger payment                           |
| Day Projection        | Today/TNS/Timeline presentation                                        | Multiple rows from one Item do not create multiple Events                  |
| Pool / Flexible       | Unscheduled resource and flexible choice contexts                      | Not required for manual dated Item creation                                |

L1 optional fields: time/end, one user-facing optional place/address, notes, participants, documents, Ledger links, Booking/Ticket links. Place name matching prioritizes Trip/day geographic context, preserves authored text; provider failure never prevents save. Unverified text may open map search, not qualified routing. Organizer-created/imported unspecified participation → dynamic WHOLE_GROUP; member-created unspecified → SELF; explicit members → SELECTED_MEMBERS without approval. Separate participation from viewing permissions.

**Field authority:** plan placement/participant scope on Item; scheduled service facts on typed occurrence or qualified Booking service facts with _one authoritative writer selected by Core_; Booking order/status/amount; Ticket validity/seat/QR/access method; Document originals; Ledger payment. Derive display rather than maintaining multiple writable date/place copies. Distinguish planned arrival from hotel permitted check-in. Preserve source, timezone, precision, user edits, revision and amendments.

## 3. P1 — Generic Activity

P1 is the fallback for POI, dining, shopping, ordinary hikes, appointments and unmatched scheduled activities. Title + date creates a dated Item; no time → TNS, optional address and end. Restaurant phone reservation is a legitimate Booking even without email/ref; merely planning dinner is not evidence of Booking. Rich activity categories may inform icon/search, but do not imply dozens of business tables or category-selection burden.

## 4. P2 — Flight

**Minimal input:** flight number + departure date; immediately save incomplete Flight Item online/offline. Online attempt basic provider lookup (airline, origin/destination, planned times, zones); offline queue for later. Optional manual details or scan. Failure does not block. Formal existing Flight admission may be stricter: Core must provide a safe partial-save/qualification path rather than relaxing admission by assumption.

Same actual operating flight/date → shared service facts and provider lookup, including verified codeshares; never merge solely by similar route/time. Each physical leg is distinct Segment. One Booking may cover outbound and return days or multiple contiguous connections. Each Segment stays visible/clickable; visual grouping does not hide it. Neutral connection interval from qualified timestamps. Reschedule may preserve plan Item identity but replaces service association with history; cancellation retains records, delay is operational observation, not replacement. Booking PNR, ticket/boarding pass, seats and Ledger are distinct domains. **Beta basic schedule lookup; no live flight delay/gate/terminal monitoring** (post-launch provider line).

## 5. P3 — Accommodation

One two-tap **date-range calendar** for check-in/out, derived nights; clock times optional. One Stay per continuous place/date arrangement, with multiple rooms and Bookings if appropriate. One DOC order can cover three distinct Hut stays; supplementary booking links existing Stay instead of duplicating it.

**Day projection:** check-in major row; middle day with activities: lightweight `From accommodation` top and `Return to accommodation` end, without invented times; empty middle day: one `Tonight · ...`; check-out major row. Personal morning/night base derived only when unambiguous. Same-night overlaps allowed; no guessed return destination. Shared stays basic name/address/date/participants viewable by group; SELF stays private by default. Organizer does not automatically see private passwords.

**Stay Instructions:** append source-linked Arrival / During Stay / Departure entries from PDFs, photos, messages or manual additions. Display relevant section at check-in/check-out, shortcut throughout stay, de-emphasize after. One-tap copy for recognized Wi-Fi/access codes; user correction must not be silently overwritten. Name-based Place Search is the most valuable manual enrichment; match with Trip context, allow name-only/optional pasted address and no false coordinates.

## 6. P4 — Rental Vehicle

Each distinct rental/vehicle service record has its own pickup/return date/time/place, typically one Booking per vehicle but do not enforce 1:1. No compulsory Rental Arrangement parent, driver assignment, or vehicle-to-member mapping. **Pickup and return rows only**, no repeated middle-day event. Merge same-time/same-place same-operation rows visually while preserving separate underlying rentals and attachments; different return dates stay separate.

Reserved vehicle category (`or similar`) is not actual delivered vehicle. On pickup, photo-derived verified plate becomes high-priority vehicle identity in relevant Day Feed/Trip Home, alongside original booking category. Vehicle condition/plate/return photos attach to stable Rental Item and are accessible from both projections. Reuse append-style Rental Instructions, including fuel/return/opening-hours; no forced passport/licence upload. Cancel old Booking and create distinct replacement Booking when justified, retain history and stable plan only if evidence supports replacement.

**Real fixture:** Thrifty Nelson two reservations both pickup Dec 14 11:00 Nelson Airport; Swift-or-similar return Dec 20 11:00, NZD606.08 due; Outlander-or-similar return Dec 22 11:00, NZD847.38 due. Neither confirmation proves already paid.

## 7. P5 — Scheduled Transport

Train, bus, ferry, water taxi, shuttle, booked transfer. Every actual Segment is independent and clickable in Day Feed; continuous journey may share visual shell but cannot hide segments. Noncontiguous outward/return remain separately positioned. Ticket ↔ Segment many-to-many. Keep operator, service number, origin/destination, planned times and qualified meeting/check-in place/time, boarding cutoff, pier/platform separate. Preserve Transport Instructions append-style with source and relevance to Today.

**No automatic transfer-risk judgment:** even two-minute transfers may be legitimate. Display neutral planned interval; validate only actual data contradiction/timezone issues. No station TTR route or automatic Review solely from short transfer.

**Real fixtures:** SNCF TER two-leg single ticket, TGV reserved coach/seat, Rotoroa water taxi Dec 16 outbound and Dec 19 return, Mykines group ferry ticket and separate hiking fee, Kalsoy ferry booking with zero-priced return. Never split order totals evenly without evidence.

## 8. P6 — Ticketed Activity and Wallet

P6 progressively enhances P1 when admission/session/booking facts exist; attaching ticket does not create duplicate Event. Ticket/Pass may exist without date/Trip Item. Today Focus prioritizes **actual executable ticket access**, not a generic `Show Tickets` that may be false. Entry point, seat/section, QR or provider access as known; Future remains title/date/place oriented.

**Ticket access classes:** original static PDF/image/QR; confirmation-only; Apple Wallet pass; external dynamic provider App/site; unknown. **Open original ticket by default**, optionally zoom its existing QR region; never redraw OTR QR or claim issuer acceptance. External dynamic Ticketmaster-like ticket may require official app/login; no guaranteed deep link or offline use. One group QR remains one original; multiple independent ticket faces can swipe. Do not infer separate QR from guest count or assign every ticket to a member.

**Per-device readiness:** after original is verifiably cached and accessible say `Ticket on your phone`; near use if missing say `Download ticket to your phone`; after download primary action becomes `Open Ticket`; dynamic external access says `Open in provider`. Avoid user-facing `Saved offline` as status. Wallet shows missing local essentials and bulk download. Opportunistic prefetch when app active/syncing; iOS background execution not guaranteed. Permissions/revocation, versions and local eviction require audit. `On your phone` does not certify ticket acceptance.

## 9. Common lifecycle UX

**Cancel** = record canceled arrangement in OTR, **not** actual supplier cancellation. **Delete** = remove mistaken/duplicate OTR record from normal view, recoverably. **Replace** = new Booking identity and linked old history. Speak in visible business terms, not Trip Item/Booking jargon.

For one exclusive Booking/one car, single confirmation marks arrangement and Booking canceled in OTR. For shared Booking (two cars or three huts), offer `this arrangement` vs `entire reservation`; partial cancellation must not mark whole Booking canceled. Deleting a sole mistaken Item can also hide its exclusive Booking; shared Booking and other Items remain. Documents retained if referenced, Ledger never cascaded. Reliable replacement evidence required; user-edited schedules not silently overridden. Exact commands, permissions, undo and offline conflicts remain Core audit gates.

## 10. Capture / Import / Provider rules

All forms prominently support Scan/Import. Online OCR + structured model extraction with bounded retry/fallback and privacy/cost/idempotency; offline preserve originals and queue, local OCR if feasible. User may leave while import proceeds; high-confidence admissible facts auto-create/link without mandatory confirmation, conflicts receive nonblocking Review. Distinguish evidence, interpretation, admitted fact, projection and actual attendance.

One file → many Items/Bookings/Tickets; many files → one Booking; a new supplemental Booking may link existing Items. Do not fabricate Booking from a draft itinerary. Booking holder, Ticket holder/capacity and Trip participants differ; AKA match best effort, no manual completeness workflow. Preserve unmapped raw structured facts and source. Uploading unrelated ticket from Item A keeps original Document attached to A, but does not incorrectly link Ticket to A.

**Independent Provider workstream:** basic Flight lookup, Place Search/autocomplete, OCR/remote LLM, TTR, later weather and live flight. Free trial API ≠ automatically permitted noncommercial use; confirm licensing, data persistence, cost, privacy and caching before Beta activation.

## 11. Beta vs Phase 2

**Beta target:** P1–P6 semantics, common Booking/Ticket/Document links, date-only TNS, cross-day projections, import N→M and dedupe, safe cancel/delete/replace, manual Place Search, Flight basic lookup, ticket originals and local readiness, Instructions and missing-field-safe presentation. These are target requirements, **not implementation-complete claims**.

**Phase 2:** specialized airport parking, luggage storage, marathon multi-step experience, vehicle ferry handling, generalized Operational Steps, real-time flight tracking/gate alerts, advanced travel provider features. These use P1/Booking/Ticket fallback in Beta. No Other renderer or compulsory grouping layer.

## 12. Current implementation evidence and gaps

**Historical evidence only:** L1/L2 v0.1 consolidated contract; P2 flight preflight; F0/F1 Faroe corpus and negative tests; production integration commit reports. In the inspected P2 audit, Canonical Flight service attribution and qualified endpoints existed, but Day read DTO lacked complete flight services, terminals, itinerary association, booking enrichment and participant details; historical audit reported these as mapping/missing/deferred. F1-R1 fixed empty Flight Focus fields and 186 tests passed in its scoped review. Neither report certifies current canonical HEAD or a real imported P3–P6 end-to-end path.

| Gate                    | Required Codex evidence                                                                          | Owner decision needed               |
| ----------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------- |
| G0 current inventory    | Exact HEAD, files, migration ledger, accepted read/write contracts, hashes, branch cleanliness   | None; read-only                     |
| G1 authority            | Field-by-field owner: Item/service/Booking/Ticket/Document/Ledger, time zones and provenance     | Resolve any double-writer           |
| G2 relation & lifecycle | Booking↔Items, Ticket↔Segments, soft delete/cancel/replace, offline permissions                  | Approve minimal additive commands   |
| G3 projection           | P3 multi-day, P4 multi-return, P5 all segments, P6 local ticket access; no fake Events           | Approve display contracts           |
| G4 Import admission     | Sparse save, N→M, supplement existing Item, idempotency, source preservation                     | Authorize scoped implementation     |
| G5 device QA            | Real admitted Day Feed/Focus/Immersive, offline, 375pt, Dynamic Type, VoiceOver, original ticket | Beta acceptance only after evidence |

**Known design tension:** Earlier L1/L2 contract allows Booking to own role-qualified stay/pickup time facts; later L3 design places typed facts on Stay/Rental service. These must not become two writable copies. Decide canonical service occurrence and projection authority during G1; do not settle via an arbitrary JSON blob or new migration without evidence.

## 13. Proposed minimal execution sequence (no premature migrations)

1. Archive this v0.2 with provenance and Owner review status in `docs/trip/`.
2. Codex read-only G0/G1 audit against **current** canonical main and `docs/trip/`; generate mapping matrix `fact → current table/DTO → owner → missing → minimal change`.
3. Owner reviews only material contradictions, especially sparse Flight admission, multi-Booking relations, shared ticket permissions, cancel scope and multi-day authority.
4. Core chooses minimal additive physical implementation and offline-safe commands; Import targets same accepted facts; Experience consumes one projection adapter. Parallel work permitted after authority gate, no broad rewrite.
5. Validate synthetic negative cases, then owner-authorized private real cases (Faroe, Nelson, SNCF, DOC, ticket examples) without copying personal QR/identifiers into tracked CI. Verify native admitted-data paths before Beta acceptance.

## 14. Traceability and evidence limitations

**Owner decisions:** Current OTR design conversation on 2026-10-11, from L1/P2 through P6 and Phase 2 deferral.  
**Uploaded baseline:** `OTR_Trip_L1_L2_Consolidated_Contract_v0.1.md`, `TRIP_EXPERIENCE_P2_V1_CONTRACT_AUDIT_AND_PREFLIGHT.md`, `CONTRACT_CONFLICT_MATRIX.csv`, `F0_*`, `F1_*`, `OTR_Flexible_Block_Pool_Contract_v0.1.md`.  
**Private exemplars reviewed in chat:** Thrifty Nelson two confirmations; Air NZ NZ5069 round trip; DOC three huts supplemental order; Rotoroa water taxi email; AquaTaxi, SNCF, Kalsoy/Mykines, cinema and concert tickets. Original source and human interpretation are not interchangeable. Sensitive booking IDs, personal details and QR payloads intentionally excluded from this reusable design document.

**Final recommendation:** **Product scope READY for owner baseline review; database/runtime NOT READY for blanket approval.** Freeze P1–P6 semantic intent, run G0/G1 first, then authorize only demonstrated minimal Core/Import/Experience changes. No migration, provider activation, or production data import authorized by this document.
