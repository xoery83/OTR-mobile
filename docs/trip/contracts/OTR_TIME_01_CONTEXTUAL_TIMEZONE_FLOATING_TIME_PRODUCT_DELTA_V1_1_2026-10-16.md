# OTR-TIME-01 — Contextual Timezone & Floating Time Resolution
**OTR Mobile 2.0 | Product Delta | 2026-10-16**

**Status:** Owner-approved product direction and D1–D4 decisions (2026-10-16); implementation interface mapping and repository audit remain OPEN. **Not engineering authorization for migrations.**

## 1. Purpose and protected contracts
**APPROVED:** Time can be useful before fully resolved. Missing timezone must not prevent otherwise lawful authorized local Trip Items from being saved, displayed or edited, nor suppress the entire Day Feed or Today's Journey. Preserve original date and clock. Never infer attendance, precise NOW, or an exact reminder from uncertain time.

Protect canonical Item/Booking/Segment identity, import Candidate/Review/Admission authority, Day Feed/Focus/NOW, offline-first read and sync, actor permissions and CXE-off usability. This Delta does not create a new time engine, schema enum, table, or remote-AI dependency. Coordinator must first inventory actual repository capabilities.

## 2. Time semantics (APPROVED)
| State | Example | Display | Precise instant? |
|---|---|---|---|
| Zoned local | AKL departure 09:00, Pacific/Auckland | Local date/clock + zone | Yes, if DST ambiguity resolved |
| Explicitly zoned | User selects Sydney 09:00 | Original date/clock + selected zone | Yes, if unambiguous |
| Floating local | Dec 14 09:00, no zone | Original date/clock, no invented offset | No |
| Date-only | Dec 14 free day | Date only | No |

Distinguish **Original Time** (source/user facts) from **Resolved Context** (zone, source, authority, ambiguity, recomputability). Suggested provenance vocabulary only, NOT new persistent enum: USER_CONFIRMED, LOCATION_VERIFIED, BOOKING_DERIVED, CONTEXT_INFERRED, FLOATING_UNKNOWN.

## 3. Location and timezone authority (APPROVED direction; proposed detail)
Location identity, timezone resolution and time semantics are independent. An airport IATA endpoint can resolve a timezone without a Map SDK Place ID; a user can explicitly select a zone without a location. Phone timezone is not a surrogate for event location; Trip default zone is advisory, never a forced universal Item zone.

**PROPOSED precedence:** user/source explicit time-zone facts (conflicts require review, not silent overwrite); verified event location/airport; verified Booking/Segment endpoints; unique trusted Day context; floating. User-confirmed timezone must not be silently changed. Recompute only unconfirmed inference as context changes. Show event-date UTC offset rather than fixed seasonal offset.

## 4. Manual Item Editor (APPROVED direction; proposed UX detail)
Provide compact Timezone row below local date/time, e.g. `Auckland · Pacific/Auckland (UTC+13 on Oct 16)`, with contextual suggestion, searchable zone selector and `Not sure yet`. Preserve local clock on selection changes; save floating without requiring a zone. A user-selected zone is explicit and remains until edited. No duplicate post-save timezone Review.

DST gap (nonexistent local clock) or fold (repeated clock): do not silently manufacture a unique instant. Ask narrow clarification only when necessary for exact timing; otherwise retain unresolved local time. Coordinator must inspect existing Editor ownership and field contracts before implementation.

## 5. Import and Review (APPROVED)
| Evidence | Behavior |
|---|---|
| Reliable airports/location | Resolve relevant endpoint local zones without unnecessary Review |
| Unique trustworthy context | Derived zone, retain provenance; no routine Review |
| Multiple plausible zones with material impact | Existing Import Review: choose zone/context or `Keep timezone unspecified` |
| No reliable context | Keep floating; only Review if owning Admission contract truly requires it |
| Contradictory explicit evidence | Preserve both, use existing correction/review process |

Review should accept direct choices, not force another upload. Floating is not itself an import failure. Do not bypass Candidate admission to populate Widgets.

## 6. Day Context Segments (APPROVED concept; PROPOSED derivation)
A Day can contain multiple trustworthy zone/location contexts separated by transport endpoints, stays and verified activities. Derive segments from authorized local canonical facts; unknown gaps remain unknown. Departure and arrival each retain their local date/time/zone. Segments are suggestions, not proof of physical presence. No mandatory new persisted Segment table.

If later evidence splits a previously unique context, existing floating Items keep original clock, identity and stable plan position; show a quiet `Confirm timezone / position` indicator. Selecting a context or remaining floating is permitted. Never repeatedly interrupt Day Feed.

## 7. Day assignment and mixed sorting (Owner-approved principles; exact repository mapping pending)
- Floating/date-only Item remains anchored to its explicit planning calendar date; never silently redate from phone timezone.
- Zoned events use their own event-local date, subject to existing Day Feed contracts.
- Flight departure and arrival keep distinct local dates; do not create duplicate canonical Segment identities just to appear on both days.
- Compare trusted zoned instants where meaningful; never lexically compare 09:00 in Auckland and 09:00 in New York as one instant.
- Preserve existing explicit Day Feed/user ordering first. Floating items retain deterministic prior plan order; new context must not randomly jump them. Date-only stays untimed, not fabricated midnight.
- Crossing the International Date Line can repeat or skip local calendar dates; retain source endpoint date and segment identity, not a fake global 24-hour day.

**D1 OWNER APPROVED:** One canonical transport Trip Item/Segment contains both departure and arrival endpoint-local date, clock and timezone. Show arrival alongside departure in the same transport detail, explicitly identified as arrival-local time. Do **not** create a synthetic arrival-day continuation, second canonical Item, or automatic duplicate Day Feed entry merely because the arrival local date differs. Preserve existing Day Feed placement and cross-day transport contract; audit any current renderer that assumes one zone for both endpoints. If an existing contract expressly represents an independent arrival-day navigation anchor, reconcile it separately rather than silently deleting it.

**D2 OWNER APPROVED:** Preserve the existing explicit user/planning order first. Floating Items retain their stable position as trusted context evolves; insert newly created floating Items using existing persisted ordering primitives and deterministic tie-breaks. If no stable order primitive exists, Coordinator must report the exact gap before inventing a new key or comparator.

## 8. Today / NOW / Focus (APPROVED safeguards; proposed fallback)
Day Feed and Immersive can show floating original clocks. Today's Journey must not be entirely empty because Trip timezone is missing; show lawful day entries and `Open Today` when a valid planning-day context exists. A no-item day, timezone-unknown day, reader unavailable, and permission-denied are different states. Tonight Stay may use trustworthy local date coverage without claiming a precise check-in instant.

NOW/current-or-next/countdown requires a trustworthy instant and appropriate current context; do not assert `in progress` or `starts in 10 minutes` from floating time. `Open Today` opens Day Header, not NOW or saved bookmark. Bottom Day resumes prior browsing date/position/Focus. Immersive back preserves Home widget selection and Day bookmark.

**D3 OWNER APPROVED:** Prefer a trustworthy current travel/Day context for the Today calendar date. If there is no uniquely trustworthy current context in a multi-zone Active Trip, do not silently equate the phone zone to the Trip location; offer a clear, stable planning-day selection or honest Day entry instead of inventing NOW or suppressing Home. Exact selection persistence and fallback to existing Day browsing must be mapped to the owning navigation contract.

## 9. Notifications (APPROVED direction; proposed thresholds)
Exact reminders need uniquely resolvable instants and existing permission/eligibility. Do not schedule floating time using phone/Trip default as an invented offset. On confirmed zone change, reconcile old schedules idempotently via existing notification ownership.

**D4 OWNER APPROVED (risk-proportionate):** Exact high-stakes transport/departure reminders require trustworthy uniquely resolved endpoint-local time; floating or multiply plausible zones must not trigger guessed absolute-time alerts. Low-risk notices may use a uniquely and sufficiently trustworthy context inference when permitted by the existing notification contract, with honest provenance and bounded rescheduling. Coordinator must identify existing notification categories and thresholds before implementing; this decision does not authorize a new notification engine.

## 10. Offline-first and legacy data
Authorized locally saved manual Items should appear in local Day/Home as soon as the owning local read authority recognizes them, even `Waiting to sync`; cloud completion is not a display gate. Do not present an unadmitted Import Candidate as a canonical Item. Missing timezone on legacy records maps to unknown/floating for presentation unless trusted source facts resolve it; never silently backfill with phone zone or rewrite original clock. Preserve actor/account/Trip access, lineage and sync conflict rules. Coordinator must audit field-level merge semantics before coding.

## 11. TIME-01A — Nelson immediate unblock (P0/P1, independent of full TIME-01)
1. Trace Nelson Trip zone provenance, actor permissions, local manual hotel save, accepted/canonical status, Day read, Home selector, and refresh trigger.
2. Distinguish no items / floating / local pending sync / reader unavailable / unauthorized; remove raw technical error text from customer UI.
3. Missing Trip timezone cannot suppress an otherwise lawful Day Feed or Today's Journey. Render original local date/clock and quiet uncertainty state.
4. Keep `Open Today`/Day accessible with valid planning-day context. Only instant-dependent NOW and exact reminders may be disabled.
5. If local manual save is lawful but missing from reader, repair projection/refresh rather than waiting for cloud sync. Do not bypass import admission.
6. Native acceptance: empty Nelson day; local saved hotel pending sync; admitted hotel; floating 09:00 event; offline relaunch; DST boundary. No false time conversion.

No new timezone schema is prerequisite for the minimum fix. If existing source model fundamentally cannot represent floating, report exact interface gap to Coordinator and Owner before migration.

## 12. Coordinator implementation sequence
| Track | Owner / deliverable | Gate |
|---|---|---|
| **TIME-01A** | Trip/Experience + Core reader: Nelson display fallback and local refresh | Native proof on actual saved data |
| **TIME-01B** | Coordinator read-only audit: Booking/Segment/Item/Day/Editor/Notifications fields, source authority, existing sort and DST | Contract mapping; no migrations |
| **TIME-01C** | Editor and Import owners: zone selector, contextual suggestions, Review options | Approved interfaces, existing admission protected |
| **TIME-01D** | Day Feed + P1–P6 + TTR owners: derived contexts, floating mixed order, endpoint-local transport, date-line cases | D1–D3 approved; owning-contract audit and regressions |
| **TIME-01E** | Today/NOW/Focus + Notifications + downstream consumers: time-confidence gating | D3–D4 approved; no false alerts |
| **TIME-01F** | QA: cross-module offline/online, localization, permission, DST, IDL | Integration Native PASS |

UI Agent owns presentation only; owning Core/Import/Day/Notification Agents own data semantics. Do not merge UI branch by replacing Core logic. Report IMPLEMENTED / WIRED / RENDERED / NATIVE VERIFIED separately.


## 12A. Mandatory cross-module impact audit and staged retrofit register (OWNER REQUIREMENT)

**This is a horizontal amendment, not a standalone Today widget fix.** Coordinator must reconcile the approved TIME-01 semantics with every already implemented and approved time-consuming rule, selector, projection, renderer, navigation action and notification trigger. A green Nelson widget alone is not completion. For each row below, report `existing contract → current code paths → TIME-01 delta → required change/no change → owning Agent → tests → Native evidence`, and separate implementation from rendering. Never reinterpret the labels P1–P6 or TTR without reading their owning contracts.

| Surface / contract family | Mandatory questions and TIME-01 retrofit checks | Boundary |
|---|---|---|
| **P1–P6 Day Feed item renderers** | For **each P1, P2, P3, P4, P5, P6**, inventory source local date/clock/zone, time labels, grouping, same-day vs cross-day behavior, order keys, time-sensitive badges, detail handoff, empty/floating fallback and offline local reads. Ensure every eligible Item remains visible without Trip timezone. | Preserve canonical item taxonomy and renderer identity; no generic rewrite. |
| **TTR / transport time rules** | Locate the exact TTR owning contract and implementation; audit endpoint-local departure/arrival clocks, travel duration, DST, date line, connection ordering, Day Feed anchoring, timezone provenance and ambiguous or floating endpoints. Explicitly test one transport Item with different departure/arrival zones and dates. | No synthetic arrival continuation or duplicate canonical Item; do not assume what TTR stands for or silently supersede its prior approved semantics. |
| **Flight / other scheduled transport** | Audit airport/IATA zone resolution, multi-segment bookings, rail/ferry/bus local schedules, transfer/connection windows, arrival-local display, DST folds/gaps, time conflict Review and canonical segment linkage. | Booking is not a new Trip Item; keep existing admission and Segment identities. |
| **Day Feed calendar and grouping** | Item-to-Day membership, explicit day association, date-only, floating mixed ordering, timezone transitions, repeated/skipped dates, Day Header date, empty Day and Day-level context derivation. | Keep Day Feed's accepted ordering and navigation contract. |
| **NOW engine / temporal highlighting** | Instant eligibility, local-day boundary, current/next determination, relative labels, live refresh, location change, floating suppression and permission-aware fallback. | Never claim in-progress/elapsed/countdown from unresolved clock. |
| **Focus / Immersive / deep links** | Check Focus selection and time anchors, preserved reading position, entry from Today/Trip Home/Search/Updates, back navigation, cross-day Item focus, zone label consistency and no unexpected reposition on new context. | Do not overwrite Day tab bookmarks or change canonical targets. |
| **Today's Journey / Trip Home** | Empty vs unknown-zone vs unavailable reader vs unauthorized states; local pending manual Item visibility, Tonight Stay date coverage, Open Today at Day Header, context-sensitive primary/later entries and widget refresh. | Local-first; do not display unadmitted import Candidate as accepted. |
| **Preparation / Journey Snapshot / Finance** | Audit any date-derived counters, recently-added order, days span, scheduled-vs-created timestamps, expense economic dates and cross-timezone date presentation. Mark unaffected paths explicitly. | Do not conflate economic_date with Item occurrence timezone. |
| **Trip root / creation / edit / cover** | Optional Trip dates and default zone, destination-to-zone suggestions, no phone-zone substitution, multi-zone Trip, undated handling, user override provenance. | Trip zone advisory; no forced mass Item rewrite. |
| **Manual Trip Item editors** | Timezone row and Not sure yet, per-event date offset, DST ambiguity, local save, validation, editing legacy floating records and reopening without clock shift. | Preserve local original time and owning local-first persistence. |
| **Import / Capture / Review / Admission** | Evidence-specific zones, multi-source conflicts, context inference, multiple-plausible-zone Review, no-context floating admission, idempotent correction, batch/result consistency. | Never bypass Candidate/Review/Admission gates. |
| **Booking / Stay / rental / activity** | Hotel nights and check-in local dates, rental pickup/return endpoint zones, tickets and activity event-local time, cross-day spans, unknown location and time-only records. | Keep existing booking-item relations and permissions. |
| **Flexible / Block / Pool / personal branches** | Fixed vs flexible clock semantics, dates without times, different participant zones, group/personal visibility, transition to fixed Item and non-inferred attendance. | Preserve existing Flexible owner decisions and stable IDs. |
| **Notifications / Updates / review prompts** | Exact vs non-exact time eligibility, rescheduling on resolution change, dedupe/idempotency, timezone-ambiguity attention marker, quiet UI vs Push and batch aggregation. | Do not create push spam or a second Review engine. |
| **Search / Calendar / Timeline / maps / export** | Index original clock and date without forced UTC, result date labels, calendar placement, cross-zone timeline order, external calendar timezone serialization and place-zone association where these features actually exist. | Capability-gate unfinished modules; no speculative implementation. |
| **SQLite / Supabase / sync / legacy migration** | Audit existing columns, ISO/UTC assumptions, serialization, merge/conflict behavior, legacy missing zones, actor-scoped caches, offline restart, DST tzdb handling. | Read-only audit before any schema proposal; no mass rewrite. |

**P1–P6 / TTR verification gate:** Coordinator must obtain the actual approved contracts and map each specific renderer/selector; this document intentionally does not invent renderer-specific business behavior. For each renderer, produce at least one timezone-known, one floating/date-only (where lawful), one cross-day or DST relevant test, plus a permission/offline case. Explicitly mark `NOT APPLICABLE` with evidence where appropriate.

**Change propagation:** source event/local save → canonical or lawful local projection → Day Feed grouping/order → P1–P6 renderer → Focus/NOW/TTR → Trip Home/Today → notifications/search/export. Changes to any upstream interpretation require downstream invalidation/refresh tests, without turning sync success into a rendering prerequisite.

**Coordinator release gates:** (1) inventory and contract-diff approved, (2) Nelson P0 native fallback, (3) per-owner retrofit commits, (4) cross-module integrated timezone regression suite, (5) real Native VQA for representative single-zone, multi-zone, floating, DST and date-line Trips. Report outstanding coverage honestly; no blanket TIME-01 PASS while any affected owning module remains unchecked.

## 13. Minimum acceptance matrix
1. Floating `Dec 14 09:00` saves, survives restart/offline, appears in Day Feed, remains editable without zone.
2. User selects Pacific/Auckland: original 09:00 preserved; event-date offset correct; later phone-zone change does not shift it.
3. AKL→LAX flight: departure and arrival zones/dates distinct, chronological relationship correct, no duplicated canonical identity.
4. Two plausible zones: Import Review offers both and Keep unspecified; no forced selection.
5. New cross-zone evidence makes prior floating Coffee ambiguous: same item/date/clock/position, subtle marker, no modal/blocking.
6. Same local 09:00 in two zones is not treated as same UTC instant.
7. DST fold/gap does not silently create a false unique instant.
8. Today's Journey and Day Feed remain useful with unknown Trip zone; NOW exact claims are suppressed when unsupported.
9. Manual hotel saved locally but waiting sync appears through lawful local projection; no Candidate masquerading.
10. Exact reminders never fire from guessed floating timezone; confirmed change reconciles schedules.
11. Permission-revoked Item does not leak through derived contexts or widgets.
12. Widget→Immersive→back and Open Today vs Bottom Day preserve approved navigation state.

## 14. Owner decision register (APPROVED 2026-10-16)
- **D1:** No synthetic cross-date arrival continuation; show departure and arrival local times within the one canonical transport Item, preserving existing Day Feed placement contracts.
- **D2:** Existing user order and stable floating position take precedence; use current deterministic order primitives.
- **D3:** Today uses trustworthy travel context; otherwise honest planning-day selection/entry, never fake device-zone certainty.
- **D4:** Risk-proportionate reminder eligibility; high-stakes exact alerts need trustworthy unique instants, low-risk uniquely inferred context only under existing notification controls.

Other implementation questions (field mapping, IANA data source, exact local reader, DST library, persistence strategy) are Coordinator technical audits, not permission to create speculative schema.

## 15. Handoff status
Owner-approved D1–D4 incorporated. Send to Coordinator for **cross-contract impact inventory, Nelson minimum unblock planning, and staged implementation planning**. Existing owning contracts remain authoritative where TIME-01 has not explicitly amended them. Do not authorize speculative migrations solely from this Delta.
