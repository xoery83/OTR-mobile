# OTR Mobile 2.0 — P4 Rental Product Design Delta

**Date:** 2026-10-13  
**Domain:** Experience / Day Feed — P4 Rental  
**Status:** OWNER APPROVED product design; not engineering authorization  
**Handoff:** OTR Beta Main Product Chat → unified Codex Coordinator

## 1. Executive Summary

P4 shows **Pickup and Return** as separate date-specific entries for each rental vehicle. No daily Vehicle Base. Multiple vehicles under one Booking remain independently identifiable. Future supports planning, Today supports pickup/return operations, and Past supports review without claiming the vehicle was actually collected or returned. One Rental detail is shared by both date entries. Reuse existing G2, Booking, Capture, Documents, Photos and Ledger capabilities; no new P4-specific subsystem.

## 2. Approved Product Decisions

| ID | Decision | Status |
|---|---|---|
| P4-TB-01 | Today Browse: Pickup and Return only; no daily Vehicle Base | OWNER APPROVED |
| P4-TB-02 | Each vehicle has independent presentation, even under one Booking | OWNER APPROVED |
| P4-TB-03 | Preserve booking holder/primary renter and distinguish vehicles booked under that person, subject to permissions | OWNER APPROVED |
| P4-TF-01 | Pickup Focus shows booking holder and confirmation number when known | OWNER APPROVED |
| P4-TF-02 | Return Focus shows actual plate when known; never infer from booked class | OWNER APPROVED |
| P4-TI-01 | No dedicated pickup/return handover-photo process; ordinary linked photos only | OWNER APPROVED |
| P4-TI-02 | Total + Total Per Day and My Share + My Per Day; original currency shown with Total only | OWNER APPROVED |
| EXP-EDIT-01 | P3–P6 grouped manual Edit plus Update from Document; Capture proposes changes for confirmation; Add Attachment is independent of AI parsing | OWNER APPROVED |
| P4-FB-01 | Future Pickup Browse includes one-line Return date/time/place summary | OWNER APPROVED |
| P4-FB-02 | Stable Vehicle 1/2 labels before actual vehicle identity is available | OWNER APPROVED |
| P4-FF-01 | Future Pickup Focus fully shows both Pickup and Return information groups | OWNER APPROVED |
| P4-FF-02 | Each endpoint has its own View on Map entry | OWNER APPROVED |
| P4-FF-03 | Show Call when an authorized usable phone number exists | OWNER APPROVED |
| P4-FI-01 | Initial booking Capture may seed a Ledger expense; later charges may be corrected/added; quote does not imply payment | OWNER APPROVED |
| P4-FI-02 | Lightweight link to other vehicles associated with same Booking | OWNER APPROVED |
| P4-FI-03 | Today/Future Immersive quick entry to Edit linked Ledger expense | OWNER APPROVED |
| P4-PB-01 | Past retains both Pickup and Return entries for the same Rental | OWNER APPROVED |
| P4-PB-02 | Past Browse shows linked photo count only, if present | OWNER APPROVED |
| P4-PF-01 | Past Focus prefers actual model and plate when known; otherwise booked class and stable label | OWNER APPROVED |
| P4-PF-02 | Past Focus shows photo count, expense count and Booking shortcut, not monetary amounts | OWNER APPROVED |
| P4-PI-01 | Past Immersive shows up to three photos at top, View all for more; hide empty gallery | OWNER APPROVED, final decision |
| P4-PI-02 | Past Immersive allows Edit Expense and Add Photo / Attachment / Expense | OWNER APPROVED, final decision |

All decisions above were explicitly confirmed in this chat on 2026-10-13. Previously approved P3 conventions are inherited where stated; proposed implementation details are not promoted to Owner decisions.

## 3. Nine-State UX / User Journey Contracts

| State | Browse | Focus | Immersive |
|---|---|---|---|
| **Future** | Independent Pickup/Return rows per vehicle. Pickup shows booked class, time/place, holder, stable vehicle label and concise Return summary. No intermediate daily rows. | Both endpoint date/time/place groups; independent View on Map actions, holder/reference, original Booking shortcut and Call if available. | Unified Rental detail: endpoints, holder, authorized drivers, booked vs actual vehicle, original files, linked expenses, associated vehicles. Edit / Update from Document and add actions. |
| **Today** | Actionable Pickup/Return at their own times/locations; no daily Vehicle Base. | Pickup: time/place, holder/reference, Directions, Booking/Contact. Return: return deadline/location, actual plate if known, original instructions and Directions/Contact. | Same Rental detail, current operation emphasized. Original contract/instructions, photos, Total/My Share summaries, quick expense edit, attachment/photo/expense addition. |
| **Past** | Both historic Pickup and Return rows, actual vehicle identity if known, linked photo count only. No navigation, phone or amount. | Actual model/plate preferred, rental dates/endpoints, holder, linked photo and expense counts, Booking shortcut. | Unified history: top three photos with View all; vehicle/driver/booking details; Total + Per Day and My Share + My Per Day; edit existing expenses and add photo/attachment/expense. |

**Navigation:** Pickup and Return are two dated presentations of one vehicle Rental. They open the same Rental Immersive. Other vehicles under a common Booking open their own detail. Existing G2 Focus/NOW/scroll geometry remains authoritative.

## 4. Business Rules & Authority Boundaries

- Booking holder, authorized driver, Trip member and actual vehicle are **different identities**; no automatic equivalence. Same-holder vehicles may be identified and browsed only under existing permissions; no automatic exposure of private license, contract or payment data.
- One Booking may cover multiple vehicles. Same supplier, time and confirmation do not justify merging them. Stable Vehicle 1/2 labels do not change with sort order; prefer known plate, actual model or user label where available.
- Booked class such as “SUV or similar” is not proof of actual model or plate. Preserve distinct facts.
- Pickup and Return locations may differ. Missing location/time/phone/reference/plate are omitted, never fabricated. External map can search by supplier/place keywords where exact address is absent; a search result is not authoritative Core location data.
- Future uses **View on Map**, Today prioritizes **Directions**. No embedded map in Beta; unified Map View is a later cross-domain design.
- Booking status only shows Confirmed if explicitly evidenced; do not invent Pending/Not booked or periodically verify supplier status.
- Past does not automatically assert Picked up, Returned or Completed based on date, booking, photo or expense.
- Original instructions and confirmation are linked directly; no Beta AI summary or required handover checklist.
- Ledger owns expense values, FX, shares, permissions and correction semantics. A booking-derived amount is not automatically paid; a later final amount may replace an editable entry or be a separate additional charge. Deposits/preauthorizations are not automatically final expense.
- **Expense layout:** Total (Trip currency) alongside Total Per Day; original currency amount(s) shown only in Total group. My Share (Trip currency) alongside My Share Per Day, without original currency. Use reliable billing/rental-day denominator; if unknown, omit averages. Multi-original-currency totals are not collapsed into a fake single currency. Only linked, authorized expense records are summarized; never present partial linked amounts as proven all-in cost.
- Immersive top-right holds Edit / cancel or remove according to existing rules. Bottom section offers Add Photo / Attachment / Expense. Edit screen has grouped fields and Update from Document; Capture must propose reviewed changes before mutation. Simple attachment upload must not automatically incur LLM parsing.
- Photos and expense counts/summaries only appear if authorized content exists; no fake zeros or blank gallery.

## 5. Cross-Module Dependencies & Interfaces

| Module | Approved product expectation | Verification boundary |
|---|---|---|
| Core / W0 | Owns Trip Item, Booking N:M relationships, identity, dates, place, participation, permissions, mutation and sync. | Check actual writable P4 fields and vehicle relationships in Git; not audited here. |
| Capture | Booking import and subsequent Update from Document; match current Rental and propose field changes; may initiate initial Ledger expense creation through accepted flow. | No new P4 parser or auto-paid semantics authorized by this design. |
| Documents | Original Booking, contracts, Pickup/Return instructions; in-app when locally available, external fallback. | No new P4 viewer. |
| Ledger | Total, My Share, FX, expenses, corrections, quick edit/add. | Actual Rental-expense linking may remain pending; do not invent results. |
| Photos | Associated photos; Past top-three preview and View all. | Actual Photos implementation may remain deferred; graceful empty state. |
| Members | Access-scoped booking holder, driver and documents. | Booking holder does not itself confer access to private documents. |
| Experience/G2 | One Composer, Browse/Focus/Immersive, NOW, scroll, stable identity. | No second renderer shell or Focus controller. |
| Maps | Separate endpoint View on Map; Today Directions. | Unified embedded map deferred. |
| TTR | Personal transition assistance independent of Rental booking. | Do not infer TTR relation from visual row adjacency. |
| Notifications | Reuse existing authorized notification behavior. | No new P4 reminder/checklist obligation. |

## 6. Acceptance Criteria

1. Five-day Rental appears on Pickup and Return dates only, never daily Vehicle Base.
2. Two cars under one Booking remain separate with stable identities and shared booking link.
3. Future Pickup Browse shows concise Return summary; Focus shows both endpoints and individual map actions.
4. Future Call appears only with a usable permitted number; Booking shortcut opens permitted original(s).
5. Today Pickup shows holder/reference; Today Return shows actual plate if known and original return instructions when present.
6. Pickup/Return both open the same Rental detail; associated second vehicle opens its own detail.
7. Edit and Update from Document are distinct; imported changes require confirmation; Add Attachment does not force AI parsing.
8. Quick expense edit is reachable from Today, Future and Past Immersive; multiple expenses are selectable.
9. Total/Per Day and My Share/My Per Day are paired, with original currency only under Total. Unknown denominators and absent records produce no invented values.
10. Past Browse photo count only; Past Focus photo/expense counts and Booking shortcut; Past Immersive top three photos with View all.
11. Past permits permitted retrospective photo/attachment/expense additions and expense edits.
12. No invented actual vehicle, completion, supplier booking state, payment or unauthorized member information.
13. Original materials remain available under existing local/offline document guarantees; external map limitations are honestly represented.
14. Shared P1–P3 Focus/NOW/scroll behavior remains intact; ordinary visual polish belongs to Visual QA.

## 7. Scope Impact

**Beta product requirement:** Approved nine-state presentation and entry semantics, Pickup/Return, vehicle identity, holder, original documents, map/Call, manual Edit/Capture entry, graceful empty states.

**Dependent capabilities:** Photos, linked Ledger expenses, quick edit and initial Capture→Ledger record creation are approved product expectations but may depend on existing module readiness. Main Product Chat should sequence implementation without constructing a new P4-specific backend. Beta 0/Beta 1 split remains for central scope scheduling, not a new Owner decision.

**Phase 2 / DEFERRED:** Embedded unified map and map/Immersive composition; vehicle handover checklists, dedicated Pickup/Return photo grouping, damage detection, mileage OCR, supplier-status monitoring and generalized rental preparation workflows.

## 8. Superseded / Rejected Designs

- **REJECTED:** Daily Vehicle Base.
- **REJECTED:** Merge multiple cars into one presentation because of shared Booking.
- **REJECTED for Beta:** Dedicated Pickup/Return photo capture or inspection workflow.
- **REJECTED:** Treat quote/deposit as automatically paid or final expense.
- **REJECTED:** Infer actual pickup/return completion from historical records.
- **DEFERRED:** Embedded map module and its final presentation pattern.
- **NOT APPROVED:** New generalized vehicle operations system or AI-generated instructions.

## 9. Open Product Questions

**None blocking P4 nine-state product design.** Field-level write support, actual Ledger/Photos link availability, and exact billing-day evidence are Coordinator verification items, not automatic new Owner decisions. Escalate only a genuine product semantic conflict.

## 10. Coordinator Handoff Notes

1. Deliver this Delta first to **OTR Beta Main Product Chat** for cross-domain scope and consistency review. Only Main Product Chat issues Coordinator instructions.
2. P4 need not wait for P5/P6 design completion.
3. Verify current Git W0/Core P4 schema and Booking relationships, Capture/Ledger/Photos linkage and shared G2 contracts; do not infer implementation from approved design.
4. Reuse existing Day Feed Lab and Renderer geometry; avoid new generic frameworks.
5. Distinguish implemented capability from approved but dependent behavior, and avoid blocking baseline Rental presentation on Photos/Ledger availability.
6. Delegate ordinary native spacing, layout and visual QA to the independent Visual QA process.
7. Do not re-open approved decisions without a concrete cross-domain conflict requiring Owner resolution.
