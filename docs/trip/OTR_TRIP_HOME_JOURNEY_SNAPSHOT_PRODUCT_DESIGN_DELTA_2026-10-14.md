# OTR Mobile 2.0 — Trip Home Journey Snapshot Product Design Delta

**Date:** 2026-10-14  
**Domain:** Trip Home / Past Trip Review  
**Status:** OWNER APPROVED product design; engineering integration and visual acceptance pending  
**Handoff:** OTR Beta Main Product Chat → unified Codex Beta Delivery Coordinator

## 1. Purpose and scope

Journey Snapshot is a large, commemorative, screenshot-friendly **Past Trip** contextual widget. It summarizes the structure of a journey without claiming the user actually visited, attended, completed, or travelled any planned item. It is independent of Photos, embedded maps, remote AI summaries, and Documents. It uses existing authorized Trip and canonical Trip Item facts and opens existing Past Item Immersive and Day Feed destinations.

It lives inside the already-approved Trip Home three-layer framework: (1) compact Trip Identity hero, (2) large Contextual Workspace with horizontally paged widgets and visible selectable tags, and (3) stable core module entrances (Documents, Members, Photos, Settings). This widget is **one page of the outer Workspace carousel**; its internal travel-tag cloud is not another navigation carousel.

## 2. Approved owner decisions

| ID | Approved decision |
|---|---|
| HOME-REVIEW-01 | Journey Snapshot composition: top Days / Places / Activities summary, central visually scattered travel-item tags, bottom full-itinerary entry. Replace a conventional three-row Highlights list. |
| HOME-REVIEW-02 | Snapshot is a commemorative overview of the *planned itinerary*, not an assertion of actual attendance/visitation. A future embedded map is optional and not a Beta dependency. |
| HOME-REVIEW-03 | Select **up to 20 short tags** deterministically from currently authorized canonical Trip Items, spanning dates and item types. Do not infer actual visitation. |
| HOME-REVIEW-04 | Tap a tag to open the corresponding **Past Item Immersive**. On return preserve Snapshot/Trip Home state and the Bottom Shell Day reading bookmark. |
| HOME-REVIEW-05 | Sparse trips display only their real items. With no formal itinerary items, use trustworthy Trip facts and a neutral empty state; never invent decorative activities or locations. |
| HOME-REVIEW-VISUAL | The generated illustration is **composition reference only**, not approval of its multicolored palette, typography, ornament, or overall styling. Use the shared OTR UI Foundation/Trip Home visual language. |

### Existing shared Trip Home contracts retained

- Past Trip Home keeps the shared Trip Identity, outer Widget Tags/Carousel, stable core modules, and two-island Bottom Shell.
- Navigation Island: Home / Day / Ledger, with Updates as the fourth when available; Capture is the separate Action Island.
- `Review Full Itinerary` explicitly opens the Past Trip's first available Day **at its Day Header**; it does not auto-focus an Item or overwrite the saved Day-tab reading bookmark.
- Current-user authorization, Trip scope, offline-local read rules and existing Item identity/renderer are authoritative. No duplicate navigation controller or new canonical state.

## 3. Widget composition

### 3.1 Header and summary

- Short, understated Past / Journey Snapshot heading.
- Three compact statistics: **Days**, **Places**, **Activities**, shown only when their values can be derived truthfully from permitted data.
- `Days`: calendar-day span only when start and end dates are sufficiently known; do not fabricate an interval.
- `Places`: distinct reliable places, not number of Items and not actual visited places. Exact deduplication depends on existing place identity/quality; if not reliable, omit or use a nonnumeric place summary rather than assert a false count.
- `Activities`: count authorized formal activity-class Trip Items, not all flights, stays or rentals; exclude unadmitted import candidates and unselected Pool suggestions. Exact type mapping must be confirmed against canonical Item taxonomy before coding.
- Stats describe the **entire permitted Trip dataset**, not just the subset of 20 rendered tags. Do not invent missing or zero-valued records.

### 3.2 Travel Tag Cloud

- Visual arrangement: clustered around the center with a loose outward spread; varied short lengths, controlled overlap/offset and restrained typographic hierarchy.
- Up to 20 distinct, stable, short labels, each paired with the shared type icon. Candidate types include flight routes, stays, rentals, scheduled transport segments, ticketed/generic activities and eligible explicitly saved Flexible plans.
- Identity-sensitive deduplication: one Stay does not produce a tag for each night; one Rental does not produce duplicate Pickup/Return tags. Scheduled Transport can represent separate canonical Segments. Never create tags from unconfirmed Candidates, private inaccessible Items, unselected Pool candidates or inferred attendance.
- Select a balanced subset across **dates and types** using deterministic rules. The same unchanged Trip should produce the same labels and positions across opens. No runtime random reshuffle or continuously floating animation.
- Shorten labels without changing their meaning. If text is long or localization changes, wrap/truncate safely and preserve accessible full labels.
- If 1–3 Items exist, show 1–3 attractive, readable tags rather than synthetic filler. If none exist, display a neutral text-led trip summary/empty state with an itinerary entry.

### 3.3 Interactions

- Each interactive tag retains a stable canonical Item reference and navigates directly to its existing Past Immersive, subject to permission and availability at tap time.
- Returning restores the outer Journey Snapshot page and Trip Home position, without rewriting the Day-tab bookmark.
- When a tag's source was deleted, revoked or is temporarily unavailable, do not navigate to a wrong record; use the existing truthful unavailable state.
- Bottom CTA: **Review Full Itinerary** → first available Past Day Header, with explicit navigation intent distinct from the Day-tab resume intent.
- Do not add per-tag custom editors, independent Focus/NOW, or a second Day Feed.

## 4. Visual consistency and accessibility

- Match Preparation and Today's Journey widget containers: same theme tokens, surface, border, corner radius, spacing system, typography, icons and action affordances.
- Tag chips use neutral or subdued semantic/brand tokens; **no rainbow per-category palette** and no handwritten/decorative typography from the illustrative mockup.
- Keep visual richness through layout density, size and subtle positioning, not random saturated colors.
- Tag overlap may be decorative only: labels and interactive hit targets must not obstruct each other. Maintain practical touch targets, VoiceOver labels/order, Dynamic Type, localization and high contrast.
- Support Light/Dark, reduced motion, long Chinese/English labels and smaller screens. Widget height follows shared large Contextual Workspace rules; do not clip or fake content to fill space.
- No map or Photos dependency in this Beta widget.

## 5. Data and integration boundary

| Source | Needed | Boundary |
|---|---|---|
| Trip root | authorized name/dates and optional destinations | no inferred dates/visits |
| Trip Items / Day projection | canonical IDs, types, names, dates, available place identity | only accepted and currently authorized data |
| Past Immersive | existing renderer and legal deep navigation | no new Item detail implementation |
| Day Feed | first valid historical Day Header navigation | preserve prior Day-tab bookmark |
| Photos / Maps / AI | **not required** | future optional enhancement only |

Before engineering claims full delivery, the Coordinator should check that real Trip Item and place data can be queried through the existing accepted-local repository and that target Past Immersive/Day Header routes exist. Missing integration is an implementation dependency, **not** permission to introduce fixture data or bypass permissions.

## 6. Acceptance scenarios

1. Rich 10–14-day mixed-mode trip: up to 20 deterministic tags across dates and types; three truthful summary stats.
2. One multi-night Stay and one Rental: each canonical object represented once, not repeated for daily/role appearances.
3. Multiple transport Segments: distinct valid Segment identities remain navigable.
4. One to three Items: only real tags, attractive sparse layout, no synthetic padding.
5. Zero Items: no invented places or activity counts; neutral Trip facts and working itinerary entry.
6. Limited/revoked permissions: inaccessible items absent from tags/stats; stale tag cannot open wrong detail.
7. Tag → Past Immersive → back: exact Snapshot and Trip Home position restored; Day-tab bookmark unchanged.
8. Review Full Itinerary: first available Past Day **Header**; no automatic Focus or NOW jump.
9. Offline: only authorized local facts; no remote AI/map/photo prerequisite.
10. Stable reopening: tag selection and layout do not randomly change with identical input.
11. Light/Dark, Dynamic Type, long English/Chinese, VoiceOver and touch targets all usable without chip collisions or clipped actions.
12. Future map/photos absent: Widget remains useful and complete in its approved Beta scope.

## 7. Handoff and implementation status

**Product design CLOSED / Owner approved. Engineering and visual QA OPEN.** Submit this Delta first to the OTR Beta Main Product Chat for comparison with its Decision Register and Interface Register. Only that chat issues the Codex Coordinator execution update. The Coordinator owns production reader/routing validation, scoped implementation, tests, visual QA and native evidence. Do not relabel unverified data paths or visual states as delivered.

**Open technical mapping (not new product decisions):** exact authoritative `Places` deduplication and `Activities` type taxonomy, stable tag selection algorithm, and safe navigation state restoration using existing routing APIs. If existing facts cannot support a numeric metric, omit it truthfully pending source capability rather than invent a new place identity model solely for this widget.
