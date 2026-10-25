# PRODUCT DELTA — P3–P6 Forms, Scan, Edit, Immersive
**Owner approval scope:** decisions explicitly agreed in this conversation through 2026-10-18. This supplements, not replaces, the bundled nine-state baselines.

## Common entry and navigation
- Day Feed Focus has a tiny centered '+' on upper and lower Focus border (Future/Today only), inserting before/after the focused item.
- '+' opens quick Add Itinerary bottom sheet, NOT Capture. First row: Plan / Flexible; second row: Flight / Stay / Rental / Transport / Activity (five icons).
- Selecting P1–P6 expands same sheet to full-screen form; Save or Cancel returns to exact Day Feed context and scroll anchor, with newly saved items refreshed. Capture > Quick Add Itinerary uses the same form flow.
- Flexible inserts a contextual block directly into Day Feed (not the P1–P6 form); follow existing Flexible move/Focus contracts.
- Dates default to the Trip's start-date month when entry has no date context; contextual Day Feed prefill follows selected day; no fabricated time. All locations use shared Places search where possible with optional unverified free text.
- Scan is document-assisted inline Form review, not a separate Capture Review. Scan updates draft, marks changed fields, and requires Save. Existing authority, admission, idempotency and permissions remain mandatory.
- P1–P6 Immersive share Participants (direct selectable chips), Expenses with separate Add and Link, and Photos & Attachments. Ledger is the expense authority; linked evidence alone never proves attendance/visit.

## P3 — Stay
- Create: Accommodation Name; optional location with SDK suggestions/free text; Scan booking near top; required check-in and check-out dates for scheduled stays, optional clock times; Participants default All; Notes. No room/unit manual requirement; instructions/contact appear when scan-derived and in Edit.
- No-context date selector opens at Trip Start Date, not today's month.
- Scan may yield multiple Stays in one form; each remains independent. Check existing Trip for duplicates and offer explicit update/separate/skip.
- Edit: all display-relevant maintainable fields directly editable including Contact, Check-in/Check-out Instructions, dates/times, location; Update from Document replaces draft values and highlights changes; Cancel discards; Save commits.
- Immersive Future/Today/Past follows original nine-state delta. Today prioritizes actionable check-in/out details; Past top photo strip only if authorized linked photos exist. No provider-sourced hotel hero photos for Beta.
- Scheduled Stay check-in/check-out dates are mandatory. Existing NTC exceptions must be reconciled with Core before implementation; do not silently relax validation.

## P4 — Rental
- Manual Create: one Rental Name (do not require separate company and class fields), scan near top, required Pickup and Return dates/times/locations, Notes. No Participants section in manual Create.
- Scan one booking may yield multiple vehicles, each an independent Rental Identity; same booking ref and identical pickup/return times do NOT prove duplicate. Match against existing Trip rentals; update/separate/skip explicitly.
- Edit: full pickup/return details, instructions, contact, booked class, actual make/model and plate (optional), notes; Update from Document changes draft only with markers and identity guard.
- Actual vehicle model/plate, if entered, take visual priority in Browse/Focus/Immersive without renaming Rental Name. Never prompt user to fill them after pickup.
- Immersive: Today Pickup/Return actionable details at top; other vehicles in same booking linked from Booking & Documents. Expenses prioritize **Link existing** over Add; separate operations. Charges/corrections occur in Ledger, not Rental. No vehicle image provider or synthetic hero photo.
- Financial totals, My Share, per-day amounts and original currency only when grounded in Ledger and valid denominators; no invented charges.

## P5 — Scheduled Transport
- Types include Train, Bus/Coach, Ferry, Water Taxi, Shuttle, Private Transfer, Taxi/Rideshare when booked, Cable Car/Gondola, and Other/Custom. Avoid conflating TTR suggestions with scheduled/booked P5.
- Manual Create: Transport Type, single Transport Name (operator/service number may be included), departure date and departure location, optional departure time (NTC), optional arrival location/date/time, Participants default All, Notes. No online scheduled-transport lookup provider in Beta.
- Departure/arrival location fields support Places SDK and free text; timezones local to each end.
- Scan may produce multiple independent Segments, each checked against current Trip; no separate Review. Shared Ticket/Booking associations must not multiply identities or expenses.
- Scan dynamic provider-specific fields preserve source label, source language/value and evidence; canonical mapped semantics are separate from editable display labels. Do not hardcode all keys (platform, pier, berth, carriage etc.).
- Edit allows all relevant fields and dynamic key/value edits, with provenance/mapping safeguards. Update from Document changes draft, not original Ticket or provider booking.
- Immersive centered on one Segment; related segments are links (unlike P2 Journey). Today emphasizes boarding instructions and real Ticket. Ticket offline access states are available offline / online required / not downloaded / unavailable; Show Ticket only opens accessible original. See TICKET-IDENTITY-01.

## P6 — Activity
- Create minimum Activity Name + Start Date. Start Time optional => NTC; venue/location optional with SDK/free text; end date/time optional; Entry/Meeting time and location optional and shown on demand or after scan; Participants default All; Description optional.
- Entry/Meeting time is distinct from Activity Start and may fall on a different date.
- Multi-Activity Scan stays in the same form, allows selection and per-Activity duplicate resolution; Ticket can cover multiple Activities and/or people but identity is not duplicated. Each Activity has independent identity and potentially different Participants.
- Edit opens all maintainable display fields: name, venue, start/end, entry/meeting date/time/place, instructions, contact, dynamic seat/section/gate labels/values, notes. Update from Document updates draft with change markers; Ticket/Voucher/Booking/Unknown has its own evidence section separate from dynamic details.
- Immersive Today: activity/venue and entry/meeting instructions first, then prominent real Show Ticket. Future: preparation and original Ticket/Booking access. Past: history/photos only when linked and authorized, no inferred attendance. Booking confirmation never creates Ticket by itself.
- Ticket access, classification and cross-Activity coverage must use TICKET-IDENTITY-01.

## Cross-module preservation
- Existing P3–P6 nine-state design and NOW/TNS/TTR/G2 contracts remain authoritative unless explicitly superseded here.
- Capture source/evidence, permission checks, offline-first data and conflict reconciliation must be honored; do not build new standalone ticketing or payment engines.
- Photos module and Ledger item-link integrations may be unimplemented; show authorized existing data or graceful empty states. Do not claim Beta already implements deferred link machinery.
