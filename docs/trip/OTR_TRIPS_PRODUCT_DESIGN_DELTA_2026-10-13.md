# OTR Mobile 2.0 — Trips / My Trips Product Design Delta

**Date:** 2026-10-13  
**Domain:** Trips (My Trips list and selection entry)  
**Status:** OWNER APPROVED — product design; **not** implementation authorization  
**Audience:** OTR Beta Main Product Chat → Unified Codex Beta Delivery Coordinator

## 1. Executive Summary

My Trips is the unified Trip selection/root entry. It helps users identify an active trip, open the appropriate Trip Home, jump directly to today's Day Feed when qualified, find upcoming and past journeys, and create a Trip. It is not itself Trip Home, a Ledger dashboard, a tourism discovery feed, or a separate Today renderer.

The approved presentation is a vertical grouped list: **Active** trips each have a full-width landscape image card, while **Upcoming**, **Dates to be decided**, and **Past** use compact **image-bearing** rows. Every Trip card body opens that Trip Home; an eligible Active card also offers a separate **Open Today** action. A user without Trips sees a polished, offline-capable empty state and an explicit creation CTA.

This delta records Owner decisions TRIPS-01 through TRIPS-14. It does not authorize code changes, migrations, remote services, or replacement of the existing router. Search is a future **global** search capability, not a Trips-only search implementation.

## 2. Approved Product Decisions

| ID | Owner-approved decision | Notes / boundaries |
|---|---|---|
| TRIPS-01 | Vertically grouped Active / Upcoming / Past list | Extended by TRIPS-07 with an undated group. No full-screen horizontal Trip carousel. |
| TRIPS-02 | Active large photographic cards; Upcoming/Past compact image-bearing rows | Applies to multiple Active trips; not a text-only list. |
| TRIPS-03 | Cover precedence: user-selected cover → built-in curated AI-generated travel-image library → designed graphical fallback | No online stock/photo service required in Beta. Offline, stable, nonblank, visually polished. Curated ~30–50 Beta assets initially, optionally growing toward ~100, are a recommendation rather than a mandated count. User-set covers never silently overwritten. |
| TRIPS-04 | My Trips is the unified Trip selection entry; Ledger accessed in selected Trip context | Preserve working Ledger routes/deep links and access rules. Do not duplicate Ledger Trip selector or rewrite Ledger domain. Verify any existing standalone Ledger capabilities before removal. |
| TRIPS-05 | Tapping any Trip card body opens that Trip Home | Same rule for Active, Upcoming, undated, Past. |
| TRIPS-06 | Every eligible Active Trip card has its own lightweight Open Today action | Goes to the **same** Day Feed for that Trip and current date; show only with valid current-day context. |
| TRIPS-07 | Multiple Active trips all visible; undated trips have their own **Dates to be decided** group | Never infer a missing date or force an undated Trip into Upcoming/Past. |
| TRIPS-08 | No-Trips state uses a polished image, short explanation and prominent **Create your first trip** CTA | Right Action Island `+` remains available; filtered/empty-result states must not pretend no Trips exist. |
| TRIPS-09 | Multiple Active trips use separate vertically stacked full-image cards, each with Open Today | No horizontal carousel, no privileged “primary Active” business state. Upcoming/Past/undated stay compact image-bearing rows. |
| TRIPS-10 | Global Search entry is an icon at top right; no permanent search field | Search is **cross-app**, not Trips-only. Search scope, results and interaction are OPEN for a separate design discussion. Do not implement a Trips-only search as this decision. |
| TRIPS-11 | Past section shows 3 most recent Trips initially, with **See all** for full Past list | Past rows retain compact photo-bearing form. |
| TRIPS-12 | Create Trip uses the **right-hand Action Island** `+` in the accepted Bottom Shell | Enter lightweight Create Trip; Trip name required, dates/destination optional. Bottom Shell owner handles contextual action; do not add competing page-specific floating `+`. |
| TRIPS-13 | Past rows show a lightweight memory summary: available city/destination, member count, photo count and expense-record count, max two auxiliary lines | Respect access rights. Omit missing/unavailable stats; no total spending, settlement status, fabricated visits, or required Photos/Ledger statistics workstream. |
| TRIPS-14 | On **successful** Trip creation, navigate directly to its new Trip Home | On failure, do not navigate or claim success. Offline creation is only as capable as accepted Core/Sync contracts; not newly promised here. |

All rows are **OWNER APPROVED** as product decisions. No implementation authorization is inferred.

## 3. User Journey / UX Changes

### 3.1 My Trips screen

- Header: **My Trips**, with top-right **Search** icon reserved for future global search.
- Group order: **Active → Upcoming → Dates to be decided → Past**. Empty groups may be omitted; exact collapse mechanics are visual/implementation detail, not a new domain state.
- Active: vertically stacked, landscape photographic hero cards (approximately 16:8–16:9 as a visual suggestion), Trip title, trustworthy dates/member summary and distinct **Open Today** action. Main card tap enters Trip Home.
- Upcoming: compact row with visible thumbnail, title, date range and optionally a reliable countdown/member count.
- Dates to be decided: compact row with visible thumbnail, title, explicit missing-date language; never assign fake dates.
- Past: three most recent compact photo rows with dates and up to two lines of authorized memory summary; **See all** opens full history.
- Covers are stable across launches and available offline. Newly created Trips never have a blank or broken image region. Manual cover choice takes precedence; an AI-curated embedded asset is the default fallback.
- Search icon does **not** justify a Trips-only search feature. Global search design remains separate.

### 3.2 Creation and selection

1. From My Trips, user taps right Action Island `+`, or first-trip CTA in an empty state.
2. Lightweight Create Trip asks for **Trip name**; date and destination are optional and can be supplied later.
3. After a confirmed successful create, navigate to that Trip Home, where members/import/planning are subsequently handled under Trip Home's own design.
4. Every card body selects and opens the matching Trip Home; an Active `Open Today` is a separate action entering that Trip's existing Day Feed.
5. Ledger is reached from selected Trip context; pre-existing valid Ledger deep links continue to work.

### 3.3 Empty and degraded states

- Zero accessible Trips: curated travel image, brief explanation and prominent first-trip CTA.
- Existing Trips but a future global search/filter yields no matches: `No matching trips`, not first-trip onboarding.
- Unknown dates: separate undated group.
- Offline: display previously admitted/authorized local Trips and embedded covers; do not erase the list on transient network failure.
- Missing or revoked permission: never expose names, covers, members, photo/expense counts from inaccessible Trips.
- Missing Photos/Ledger integrations: omit unavailable counts gracefully; never show fabricated zero or force those modules to block Trips Beta.

## 4. Scope Impact

**Beta required product behavior:** unified My Trips selection, grouped image-bearing cards, multiple Active, undated group, Past preview/See all, consistent Trip Home entry, eligible Open Today, high-quality offline cover fallback, create action and success navigation, honest empty/error/access states.

**Beta optional / capability-gated:** destination keyword-driven automatic cover selection within the built-in library, member/expense/photo counts, reliable countdowns; only where supported by existing authorized reads.

**Deferred / separately designed:** global search functionality beyond icon/entry reservation, online destination photo service, per-Trip live AI image generation, automated photo-cover selection, travel discovery content feed, AI-written Past Trip memories, advanced filters, Calendar/Timeline destinations not yet implemented.

## 5. Cross-Module Impact and Authority

| Area | Product interface / authority boundary |
|---|---|
| Bottom Shell / Experience | Existing accepted **Navigation Island (left, ≤3 contextual destinations)** and **Action Island (right, ≤1 primary action)**. My Trips uses the right `+` for Create Trip. Preserve existing Expo Router authority; no second router or duplicate floating create control. Exact native glass hosting and lifecycle tab mapping are not asserted as previously approved implementation details. |
| Trip Core / Members | Core and accepted account-scoped reads own Trip identity, dates, membership/access and creation. UI does not infer Active/Past from missing dates, manufacture Trips or override permissions. |
| Trip Home | Every Trip body tap enters one selected Trip Home. Home's detailed lifecycle-specific content is a separate upcoming product design. |
| Day Feed / NOW | Active `Open Today` opens the **same** Trip/date Day Feed. No parallel Today renderer, no reset of unrelated trip state. |
| Ledger | My Trips is the shared selection root; Ledger remains a selected-Trip capability. Preserve existing routes, offline rights, money and settlement semantics. Do not force a Ledger repository rewrite. |
| Photos | Cover may be explicitly user-selected. Photo counts are optional, access-filtered, and absent until an approved Photos read supports them. No new Photos schema/workstream is required for this list. |
| Capture / Import | Post-create Trip Home may expose existing import workflows; My Trips itself does not parse/import documents. |
| Global Search | Top-right icon reserved. Cross-app semantics remain OPEN; do not create a local-only Trips search contract. |
| CXE | Baseline Trips works fully with CXE OFF; no AI-dependent navigation or per-user remote inference. |

## 6. Acceptance Criteria

1. Two or more simultaneous Active Trips render as separate vertical large-image cards, each with its own correct Open Today; Upcoming remains below them.
2. Upcoming, undated and Past all retain **visible thumbnails** in compact rows; no text-only regression.
3. Card body always opens matching Trip Home; Open Today does not accidentally open Home and is absent if current-day context is not valid.
4. Past preview contains at most the three most recent accessible Past Trips; See all shows accessible full history.
5. Past summary has no more than two auxiliary lines, with counts only from accessible existing data; no fabricated expense/photo stats or financial totals.
6. A newly created, offline, undated Trip shows a stable, high-quality embedded cover without loading failures; a user-selected cover is not silently replaced.
7. No-Trips onboarding has an explicit Create your first trip CTA; search-empty (when global search later exists) is not confused with account-empty.
8. Right-hand Action Island `+` enters lightweight Create Trip. Required name only; dates/destination optional. Successful create opens new Trip Home; failure does not navigate.
9. No authenticated account/Trip access leaks across account changes, revocations or offline transitions; preserve accepted auth and Core read gates.
10. Existing Ledger/deep links and working navigation remain reachable; no second Day Feed, Trip selector or navigation stack is introduced.
11. Top-right Search icon does not accidentally ship a Trips-only search implementation or a fake functional search UI.
12. Light/Dark, long names, large type, VoiceOver labels, image contrast, touch target sizes and safe-area/Bottom Shell overlap receive native visual QA.

## 7. Superseded / Rejected Designs

- **REJECTED:** Active horizontal Trip carousel; privileged first/primary Active card; multiple Active shown as compact-only rows.
- **REJECTED:** Upcoming/Past text-only lists; giant image cards for all historical Trips.
- **REJECTED:** Always-visible Trips-only search box and complex Trips filters in Beta.
- **REJECTED:** Separate Ledger Trip selection as a new parallel product flow; however, preserve any existing standalone/deep-link behavior until product/technical reconciliation.
- **REJECTED for Beta:** online stock photo dependency, live cover generation per Trip, blank image placeholders, automatic unapproved image replacement.
- **REJECTED:** Past Trip card showing total expense, settlement, inferred visited/attended facts or AI narrative as authoritative facts.

## 8. Open Product Questions

1. **Global Search**: full cross-app scope, results and navigation, privacy, and UX are separately OPEN. Search icon placement is approved; functionality is not.
2. **Trip Home**: internal IA, lifecycle presentation, Ledger/Photos/Import shortcuts and navigation details will be designed next. My Trips entry contract is approved; Home's internal content is not approved by this delta.
3. **Bottom Shell exact destination order / native hosting**: prior historical architecture report separates approved two-island direction from unapproved renderer/lifecycle specifics; reconcile with central product decisions, not by assumption.

No other Owner decision is needed to freeze the My Trips list design. Engineering feasibility or current data availability is for Coordinator assessment, not a new product decision.

## 9. Coordinator Handoff Notes

1. Main Product Chat should reconcile TRIPS-01…14 against the central Decision Register and existing Bottom Shell/Trip IA documents before sending a bounded Coordinator update.
2. Verify current Git and production routes; use the existing Expo Router, authenticated Trip read, existing Ledger deep links, and approved Day Feed rather than rebuilding them.
3. Implement My Trips list/shell integration independently where possible; do not block it on final Trip Home details, global Search, Photos or Ledger statistics. Preserve a valid Trip Home destination contract without inventing Home features.
4. Confirm that newly created Trips can be durably admitted by the current Core/Sync implementation; do not claim offline create if not supported.
5. Cover generation is a **design-time asset production** task, not runtime model inference. Check rights and quality of generated assets and optimize bundle sizes without compromising offline fallback.
6. Report product-contract discrepancies to Main Product Chat; do not silently promote historical Bottom Shell implementation proposals or unsupported data fields into approved requirements.
7. This file is an Owner-approved **product delta**, not a commit/merge/deploy authorization.

## 10. Historical Provenance and Verification Gaps

- Decisions TRIPS-01…14 were explicitly confirmed in the Trips product discussion on 2026-10-13.
- Prior Trip IA recovery establishes My Trips as selection/root, Trip Home as selected-Trip workspace, Today as contextual entry to the same Day Feed, and contextual two-island navigation.
- The historical Bottom Shell architecture report was referenced in the discussion but the exact current Git state, native renderer and final lifecycle mapping were **not** independently audited for this delta.
- Photo count and expense count availability, actual Trip creation capability and production Home route readiness are **UNVERIFIED** and must not be represented as already delivered.
