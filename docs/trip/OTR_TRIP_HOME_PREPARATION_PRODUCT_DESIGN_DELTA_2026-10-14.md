# OTR Trip Home — Preparation Widget Product Design Delta

**Date:** 2026-10-14  
**Domain:** Trip Home / Experience  
**Status:** OWNER APPROVED — product design only; implementation not independently authorized  
**Scope:** Upcoming Trip Home Contextual Workspace, Preparation Widget

## 1. Executive Summary

The Preparation Widget is a large, purposeful mini-workspace in the Trip Home contextual carousel, not a simple navigation tile or preparation score. It supports both starting a new trip and continuing a partially or substantially populated itinerary. The design uses existing capabilities, truthful Trip data and role-scoped actions, and must not block other Trip Home widgets.

## 2. Approved Product Decisions

| ID | Owner-approved decision | Evidence/context |
|---|---|---|
| HOME-PREP-01 | Import travel plans and manual Day Feed planning are parallel primary ways to start. | Owner's preference for two prominent equal-sized actions in Empty state; subsequent accepted design. |
| HOME-PREP-02 | Once content exists, show actual itinerary content, refined to recent saved entries rather than example items. | Owner rejected placeholder example rows and requested recently created/imported items. |
| HOME-PREP-03 | Dynamically show counts by reliable available business type, including flight, stay, transport, rental and activities as applicable; do not hard-code three categories. | Explicit Owner confirmation. |
| HOME-PREP-04 | Show at most three most recently created or successfully imported formal Trip items, ordered by admission/creation time descending, with direct detail access. | Explicit Owner confirmation. |
| HOME-PREP-05 | All authorized Trip members can see the widget. Filter content by permissions and show actions only when actually allowed and supported. | Explicit Owner confirmation, 2026-10-14. |
| HOME-PREP-06 | Keep Preparation in the Upcoming carousel, varying its rank with context. Do not infer that planning is complete from item counts or empty days. | Explicit Owner confirmation, 2026-10-14. |

The HOME-PREP-01/02 identifiers preserve the discussion's decision framing. The later Owner refinements to the content and recent-item semantics supersede any earlier synthetic-example or itinerary-date-sorted interpretation.

## 3. User Journey / UX Changes

### Empty Upcoming Trip

- Use the large contextual workspace presentation, not two small links.
- Two equally prominent areas: **Import travel plans** and **Build your itinerary**.
- Import description may mention PDF, images, files, text, Email Connect and AI Plugins. A named channel is not evidence that its end-to-end capability is active; expose only working actions and accurately distinguish unavailable integrations.
- Manual planning opens the supported Day Feed/add path; never promise unsupported creation rights.
- No fake example itinerary rows or fabricated counts.

### Upcoming Trip with saved content

- Show truthful counts grouped by available business types, without fixed categories or fabricated zeros.
- Show up to three most recently created/successfully admitted items by recorded creation/admission time; each links to its corresponding authorized detail, or a supported Day destination if direct detail is unavailable.
- Preserve compact **Import more** and **Open Day** paths where permitted.
- A richer itinerary reduces onboarding copy, but does not create a new persisted `Established` or `Completed` state.
- If no reliable timestamp exists, do not label arbitrary entries `Recently added`; use neutral itinerary presentation or omit the list.

## 4. Scope Impact

**Beta V1:** deterministic, locally sourced and permission-scoped Preparation Widget, rendered inside the approved large contextual carousel. The surrounding carousel has a large consistent visual footprint (Owner's reference approximately 420–550 pt on a typical phone, adaptive rather than hard-clipped), named selectable tags and horizontal paging.

**Not required for this widget:** new canonical readiness flags, percentage-complete scoring, remote AI judgment of plan completeness, new provider integrations, or new persistence/schema merely to support counts.

**Deferred/conditional:** unsupported Email Connect or AI Plugin execution; any capability must be truthfully gated. Full import batch/review details belong to the separate Recent Imports & Documents Widget.

## 5. Cross-Module Impact

- **Trip/Core/Day Feed:** authority for formal Trip items, item identities, date/context and authorized detail navigation; widget is a consumer, not a new owner.
- **Capture/Import:** entry to supported ingestion; pending candidates, files awaiting interpretation and failed imports are not counted as admitted itinerary items.
- **Documents:** import sources are distinct from formal itinerary item counts.
- **Members/Permissions:** actor-scoped visibility and operation rights; non-organizers may still view permitted progress.
- **Experience/Bottom Shell:** existing Home/Day/Ledger and Capture navigation remains independent. This widget must not duplicate a new Day Feed or create a second navigation system.
- **CXE:** future ranking enhancements may reuse the widget, but Beta works deterministically with CXE off.

## 6. Acceptance Criteria

1. Empty authorized Upcoming Trip shows two prominent, functional and equal-weight entry areas, with no synthetic itinerary entries.
2. Existing saved Trip displays only valid accessible counts by actual available business types; mixed flight/stay/rental/transport/activity cases do not double count a shared booking as multiple expenses or files.
3. Up to three recent admitted items are correctly ordered by recorded creation/admission time, not travel date, and navigate to authorized targets.
4. Candidate-only, failed, unprocessed and unadmitted import material does not inflate counts.
5. Read-only participant sees authorized content without write controls; authorized editor sees only supported actions.
6. Offline local authorized content remains readable; unsupported actions are omitted or accurately unavailable.
7. Upcoming Preparation remains accessible as a named carousel page even when another urgent widget takes first position; no inferred planning-complete state hides it.
8. Long names, localization, dynamic type and large accessibility text do not clip or make actions inaccessible; height is adaptive and the workspace does not jump during page changes.
9. No invented timestamps, destinations, itinerary entries or permissions.

## 7. Superseded Decisions

- Replace illustrative example itinerary rows with actual recent formal items.
- Replace fixed three-type statistics with dynamic reliable business-type counts.
- Replace small Empty action tiles with two large, clear action areas.
- No other approved Trip Home navigation, carousel or business contract is superseded.

## 8. Open Product Questions

None blocking this Widget's product design. Exact eligible source fields, timestamp availability and enabled integration channels require implementation-time capability checks; these are engineering verification, not new Owner product decisions. Carousel global ranking rules and other widgets remain separate design work.

## 9. Coordinator Handoff Notes

1. Hand to OTR Beta main product chat for cross-domain consistency and scope reconciliation before Codex scheduling.
2. Implement as a narrowly scoped consumer of currently admitted, permission-filtered Trip data; do not invent aggregate authorities or trigger Core/schema work without independent authorization.
3. Verify current Git capabilities and supported routes for Capture, Day and item detail; distinguish completed functionality from planned Email/AI Plugin integration.
4. Preserve the approved large tagged contextual carousel, the fixed surrounding Trip Home navigation and the lower stable Documents/Members/Photos/Settings access area.
5. Do not hold up independent Trip Home or other widget work while this widget is integrated.
