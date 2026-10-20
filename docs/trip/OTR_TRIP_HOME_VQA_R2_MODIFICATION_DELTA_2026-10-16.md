# OTR Mobile 2.0 — Trip Home VQA Round 2: Modification & Diagnostic Delta

**2026-10-16 · Coordinator handoff · Status: Owner-requested corrections, implementation unverified**

## Authority
Retain the approved Trip Home Framework, Preparation, Today's Journey, Journey Snapshot, Expense & Settlement, My Trips, Contextual Action Island and offline-first contracts. This delta corrects implementation and amends **widget height** and **single-widget tab visibility**. Do not treat screenshot symptoms as proven root causes.

## P0 — Correct first, gate all merges

| ID | Observation | Required outcome / owner |
|---|---|---|
| TH-R2-01 | App launches into legacy standalone App-level Today again | **My Trips is authenticated app root**; retain Trip-scoped Day Feed. Coordinator navigation owner must add cold/warm/offline/relaunch regression checks and merge gate; legitimate deep links remain exceptions. |
| TH-R2-02 | Day disappears from Bottom Shell for empty Auckland/Nelson but appears for Japan | **Home / Day / Ledger are always visible** for an authorized selected Trip, regardless of date, accepted item count, sync or offline status; Updates fourth when available. Shell owner to fix eligibility. |
| TH-R2-03 | `Open Today`, `Open Day`, Saved itinerary and other content go under bottom glass shell/home indicator | UI Shell owner to fix safe-area/scroll insets, compositing, hit testing and scroll-to-bottom; all CTAs fully visible and tappable. |
| TH-R2-04 | Trip Home does not support iOS left-edge swipe back to My Trips | Native stack/gesture owner: swipe back restores My Trips and scroll position; widget horizontal pager still swipes from content area; edge gesture takes precedence. Deep-link entry without stack uses safe fallback. |

## P1 — Data and feature ownership

| ID | Observation | Required outcome / owner |
|---|---|---|
| TH-R2-05 | Manually added Sky City Hotel shows `Saved · waiting to sync` but does not appear in Day/Today's Journey | **Local-first hard requirement:** an authorized, successfully locally committed manual Trip Item must be readable by Day and qualifying Home widgets **without cloud sync**. Trace local item state/identity → accepted/local canonical projection → Day read → Today selector → invalidation. Preserve pending-sync indicator. Do not confuse draft/unadmitted import Candidate with committed Item; no fake admission. Core/Day owner. |
| TH-R2-06 | Today widget shows `Today's accepted Day or Trip time context is not available` and a blank 500pt surface | Today owner: valid empty day = purposeful Free Day state and `Open Today`; missing trustworthy time/read = short honest user message and supported Day navigation, not a fabricated empty day or technical diagnostics. |
| TH-R2-07 | Hero Edit disabled, Hero name/date noninteractive; generic pencil icon | Trip Core editor + UI: working authorized basic editor for title, dates/undated, destination summary, cover. Hero metadata taps open same editor. **Reuse exact Ledger Edit icon/component** after code audit; no new schema invented by UI agent. |
| TH-R2-08 | Multiple unrelated Trip locations get identical cover; cover picker appears at page bottom | Separate cover-catalog task: audit current assets and rights, tags, default/fallback, user override; propose curated offline tagged city/region/nature/coast/urban/rural catalog and deterministic local matching. Estimate number/cost before bulk image generation. Manual cover wins; no forced LLM/network on every open. Cover edit only in Trip editor. |

## P2 — Presentation revision

| ID | Correction |
|---|---|
| TH-R2-09 | **Replace fixed equal widget height** with content-adaptive height. Short Finance is short; no blank padding. Keep horizontal swipe and predictable scroll anchor. |
| TH-R2-10 | **0 or 1 qualified widget: hide tab selector**. 2+: subtle small named tabs, synchronized with swipe. |
| TH-R2-11 | Recompose `More` as compact, genuine module links (Documents, Members, Photos, Trip Settings) when functional. No giant `Unavailable` blocks or fake routes. No standalone `Trip cover` row; Photos ≠ cover picker. |
| TH-R2-12 | Fix Hero overlay controls over text during scroll, status-bar contrast, menu overlap, glass ghosting, light/dark and dynamic type. Hero remains full-bleed square with Menu left, **Edit + Search right**, no title bar. |
| TH-R2-13 | Finance redundant header/action and giant blank space; Today and Preparation padding. Use purposeful content and Ledger/My Trips typography. |
| TH-R2-14 | Raw `Saved itinerary` debug-like Home dump should not substitute for owning Day/Import status; retain truthful pending local state in appropriate surface. |

## Source-of-truth and local-first diagnostic checklist

Record sanitized evidence for local hotel: item ID, Trip/account, save outcome, date and timezone, local status, canonical/local read projection, Day inclusion, Today qualification, invalidation signal and authorization. **A committed local manual Item should not wait for cloud acceptance**; a staged file, draft or unadmitted import Candidate must not masquerade as a formal Item. If current models conflate them, raise bounded Core interface gap, not UI-only hack.

## Widget order retained

- Upcoming: Preparation first; Expense & Settlement when qualified.
- Active: Today's Journey first; Finance when qualified. Import Review one-time promotion remains conditional on owning integration.
- Past: Journey Snapshot first; Finance when qualified.
- Undated: honest planning fallback; full Preparation reuse not automatically approved.

## Cover matching expansion — independent nonblocking workstream

1. Inventory embedded covers, source rights, metadata, caching and override behavior.
2. Propose curated offline asset set with tags for country/city/region, urban/rural/coastal/mountain/nature/activity, and neutral fallback; ensure photos are not misleadingly specific.
3. Parse manually entered destination using deterministic local matching first; AI classification only if justified by measured improvement, privacy/cost and offline fallback.
4. Persist stable cover selection; never randomly reshuffle; user-chosen cover always overrides suggestion.
5. Coordinator owns asset-count/cost proposal and staged rollout; do not automatically generate dozens of images without scope approval.

## Coordinator task split and merge gates

- **Track A Navigation/Shell:** P0 root, Day tab, back gesture, bottom inset. Native merged-branch regression mandatory.
- **Track B Core/Day:** manual local hotel → Day → Today; read-after-write and offline state; no speculative DB migrations.
- **Track C UI Presentation:** adaptive Widget Host, tabs, free-day visual, More links, Hero controls, layout/compositing. No rewriting Day/Ledger/Capture Core.
- **Track D Trip Editor:** basic Trip metadata read/write, permissions, consistent My Trips/Hero refresh.
- **Track E Cover Assets:** separate discovery and bounded expansion, not blocking P0/P1.

Coordinator must identify conflicting file ownership and report **IMPLEMENTED / WIRED / RENDERED / NATIVE VERIFIED** separately. Do not merge a UI-only patch that reverts My Trips root or Day tab.

## Required Native VQA fixtures

1. Cold/warm/offline app launch → My Trips; valid deep links unaffected.
2. Empty Auckland Trip → persistent Day, meaningful Today empty state, swipe back to same My Trips position.
3. Offline locally saved hotel tonight → Day and Today's Journey after successful local commit, pending-sync truth preserved.
4. Nelson one expense → Today + Finance two pages, swipe and tabs, Finance compact height, all CTAs above Shell.
5. Japan rich Upcoming → Preparation dynamic real counts, up to three recent admitted Items, Open Day visible.
6. Past qualified Snapshot + Finance → order, return from Immersive, no invented visit.
7. Single widget → no tab; menu/Editor/More correct; small screen, Dynamic Type, dark mode and scroll-bottom checked.

**Do not re-send already registered four Product Deltas unless Coordinator lacks their verified files.** This package amends implementation/presentation only.
