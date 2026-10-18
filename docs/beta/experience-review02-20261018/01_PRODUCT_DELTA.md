# OTR-EXPERIENCE-REVIEW-02 — Trip Home / Day Shell Corrections
Date: 2026-10-18
Status: Owner review handoff; coordinator to audit and schedule. Excludes P1–P6 nine-state renderer and manual Trip Item Add/Edit.

## 1. Non-negotiable preservation
- Preserve single shared Composer, existing Reader, canonical Trip Item identity, offline-first local read/write, TIME-01 floating-time semantics, NOW/TTR/NTC contracts, permissions, and existing Day Lab integrations.
- Do not recreate the Day Feed renderer, alter Admission gates, or make schema/migration changes merely for these visual corrections.
- My Trips remains the application root; prevent old Today root regressions.

## 2. Trip Home — functional and data correctness
TH-01 P0: Audit Edit Trip Save: tapping Save reportedly disables button without closing sheet or user-visible result. Trace validation, local persistence, sync queue, error state, dirty state, navigation. Local save success should close and update Hero; sync pending is distinct and nonblocking. Do not claim saved until confirmed.
TH-02 P0: Today/Day Plans: local pending accepted Trip Items must render without cloud sync. Audit stay-night/check-in/check-out qualification: a stay checked out Oct 17 must not appear as active stay on Oct 18. Keep explicit checkout event on checkout date where applicable. Verify against fixture and actual local data.
TH-03 P0: Widget switching should immediately show last valid per-trip/per-widget projection while local refresh occurs, avoiding empty-to-populated flash. Invalidate on account/trip/permission/data version changes; no stale cross-account content. Do not require remote network.
TH-04 P1: Empty Active Today must remain actionable (Open Day, Add/Import as qualified) and distinguish empty day vs timezone unresolved vs reader unavailable. Do not foreground technical 'Timezone not confirmed' or 'Planning date' diagnostics. No fabricated NOW.
TH-05 P1: Upcoming Preparation retains category counts and recently added, adds compact context-qualified actions: Open Day, Add/Import, Invite/Manage Members, Complete Trip Setup. Show only unmet actions; avoid repeating already-complete setup.
TH-06 P1: Trip Home Members entry must show meaningful participant/invitation/connection status when available; don't claim 'unavailable' when local member names exist. Keep long-term entry below widgets; Photos link similarly honest, no disabled fake placeholder.
TH-07 P1: Trip-context menu must expose appropriate Trip-only destinations (Members, Documents, settings etc.) in addition to global account, All Trips, Language, Settings, Logout. Audit navigation contract; no duplicate business model.
TH-08 P1: Currency in Edit Trip must use existing Ledger Trip Currency authority and locked-after-settlement rules. Show actual currency and usable link/control, or truthful unavailable reason, not permanent fake 'Currency unavailable'. No second currency state machine.
TH-09 P1: Cover chooser: keep location-aware recommended default; allow suitable existing AI/library alternatives and user's own photo. Do not limit to four generic City/Coast/Mountain/Old town images. Do not require fresh AI generation on every edit. Respect source/permissions and offline fallback.
TH-10 P2: Spending widget: Group/My amounts remain, remove repeated 'included expenses' and '1 Expense' noise, align recent expense title/amount and category, consistent secondary navigation for Open Spending and Analysis. Avoid mismatched filled vs text-only actions without hierarchy.
TH-11 P2: Hero text order align with My Trips: name → date range → destination; keep full-bleed square hero and floating controls. When Hero fully scrolls off, show one-line Trip Name in translucent top bar; hide it while Hero title is visible. No 'Trip Home' label.
TH-12 P2: Header iconography and tint unify with Trip Home/native Glass conventions; Edit uses approved square-pen icon; apply consistent semantic tint, contrast and tap target across Menu/Edit/Search.
TH-13 P1: Hide internal developer diagnostics by default using existing Settings Debug toggle. Preserve concise user-relevant pending sync/failed sync and required confirmation indicators; diagnostics only in Debug mode.

## 3. Edit Trip / Date Picker / Sheet
ET-01 P1: Unified editable sheet navigation: leading Cancel/Close, centered Edit Trip, trailing Save. Avoid bottom duplicate Save. Successful local save closes and updates visible data; failed save keeps draft with actionable error; no indefinite disabled button.
ET-02 P1: Date range is optional, start/end selected in one continuous vertically scrollable calendar, seamless across months/years; no Prev/Next month-only links. Done/Cancel in picker. Preserve deliberate Trip bounds even when Items exist outside them; offer optional warning in Edit rather than automatic expansion. If Trip bounds were never supplied, existing inferred bounds may be proposed/filled under approved rules without rewriting explicit bounds.
ET-03 P1: Destination remains optional and multi-location capable; retain user-entered identity/text and confirmed selections. No silent overwrites from inferred itinerary. Trip date-only values are not converted to UTC timestamps based on device zone.
ET-04 P2: Remove debug copy ('Cloud sync waits for Trip update service' etc.) from production UI. Members edited in Members, not Trip Edit. Cover options: existing recommendation or user photo.

## 4. Day Shell / Calendar — behavior and performance
DS-01 P0: Eliminate legacy Today page/green button flash before Day Feed mounts. Use stable Day Shell loading placeholder rather than showing wrong route.
DS-02 P0: Full-bleed scroll, floating native-glass header. Initial top: Trip textual header visible; top bar no duplicated title. Date row within Trip header opens Calendar. Once Trip header leaves viewport, top bar shows visible Day or visible date range, single line; dynamic change without overlap/jitter. No photo header.
DS-03 P0: Date title formatting: same-month/year 'Feb 2–3, 2027', cross-month 'Feb 28 – Mar 2, 2027', cross-year explicit years; never wrap; abbreviate gracefully to fit. Header content under overlay must blur/dim enough to prevent text-on-text legibility failure. Menu/Search reuse Trip Home glass style.
DS-04 P0: Stable semantic scroll restoration per Trip+Day identity (optional Item for return from Immersive); returning from Trip Home/tab switch restores previously browsed Day with Day Header aligned below safe navigation. Initial new Trip defaults to Day 1/Trip Header. Avoid raw pixel-offset-only restoration and secondary jump.
DS-05 P1: Calendar choosing Day 1 navigates to top of full Trip header; other days align corresponding Day Header. Anchor works for unloaded days, long trips, empty days and out-of-bounds eligible events, without multiple visible jumps.
DS-06 P0: Dynamic loading: bounded/virtualized Day list, stable keys, height estimation/measurement and maintain-visible-anchor when prepending/appending. Prefetch nearby dates, show subtle 'Loading more days…' feedback at bounds. No blank freeze then sudden large jump; prevent top-bar date jitter during fetch. Test months-long trip and repeated rapid scrolling.
DS-07 P1: Calendar bottom sheet displays whole Trip months in scrollable calendar with shaded in-trip dates, grey outside range, selected day, trusted major location-change labels (Tokyo/Sapporo/Kyoto/Osaka) on relevant days and 2–3 concise category dots. Do not repeat dots mechanically when data absent; location unknown stays blank. Single tap anchors; no wheel picker.
DS-08 P1: Bottom shell visible at rest, hides left navigation during upward scrolling leaving Capture +; reveals left nav on reverse scroll/stopping as approved. Avoid overlay obscuring content; preserve safe-area padding. Do not disrupt Focus/Flexible gesture arbitration.
DS-09 P1: Global My Trips navigation and right-swipe back behavior from Trip Home preserved; app root must not regress to Today after integration.

## 5. QA and evidence
For each issue: current code path/contract, actual root cause, fix, tests, simulator+device screenshots/video, and remaining limitations. Include offline local-pending item, checked-out stay, empty Active Trip, populated Upcoming Trip, long 60+ day Trip, cross-year calendar, locale/dynamic type, dark/light, release build, and restoration across tabs.

## 6. Explicit exclusions
No P1–P6 Browse/Focus/Immersive rebaseline in this package. No manual Trip Item Add/Edit/Capture form design. No generalized timezone rewrite, booking schema or Ledger schema migration. Coordinator should open separate iterative renderer-fix Agent workstream after this package.
