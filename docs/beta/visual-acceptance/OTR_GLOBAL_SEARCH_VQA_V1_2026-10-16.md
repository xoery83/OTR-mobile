# Global Search VQA V1 — delivery

2026-10-16. Single Builder, independent read-only Review. Presentation/source
READY; available Trips/Itinerary Native paths PASS. Missing provider capabilities
remain dependencies, not full five-category Search Runtime PASS.

## Source and boundaries

- Confirmed main/origin main at preflight: `a41c78fad3d5312649e388f3612894ab7d68c3ed`.
- Branch: `codex/global-search-vqa-v1`.
- Worktree: `/private/tmp/otr-global-search-vqa-20261016`.
- Authority: Owner Global Search Modification Delta V1, then Blueprint V1, both
  dated2026-10-16 in Downloads. Art is visual reference only.
- Coordinator confirmed Search file ownership and the thin Search child route.
  No shared Search Provider interface, business Repository, Schema, Capture,
  Ledger internal search, Auth, permission, Tabs or Shell changes.
- Original `app/(tabs)/trip/index.tsx` is byte-identical to baseline.

## Corrections

| Delta  | Delivered / verification                                                                                                                                                                            |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GS-V01 | Full-screen native header, anchored canonical native TextInput, magnifier, native clear and Return dismissal.                                                                                       |
| GS-V02 | Entry scope fixed: My Trips/global vs a single Home/Day Trip; no scope picker or Trip-selection writes.                                                                                             |
| GS-V03 | Horizontal All/Trips/Itinerary chips, deduplicated counts from one ALL provider query/revision. Ledger/Documents omitted pending owning capabilities.                                               |
| GS-V04 | Debug Refresh, instructional coverage paragraph and See-all type grouping removed.                                                                                                                  |
| GS-V05 | Compact neutral rows: type icon, title and context/date. ALL mixes the provider's relevance ranks; no per-type three-row cap.                                                                       |
| GS-V06 | Real Item Immersive stays over mounted Search; Close restores query/category/scope/scroll. Trip Home uses a thin root child route and native Back, preserving Search too.                           |
| GS-V07 | No matches, offline local results and offline no-local-matches are separate localized states. No matches Native PASS; offline conditional presentation tested, not device-wide offline Native PASS. |
| GS-V08 | Foundation typography/colors/inputs/chips/rows; native Light and one Dark smoke checked; no full matrix.                                                                                            |

Recent searches are account-partitioned device-only preferences through the new
`searchRecentRepository`, reusing SecureStore. Store only query+Trip scope, newest
first, max8; record on Return/open result, not keystrokes. Scope-bound history
cannot widen a Trip entry. Remove and Clear work through the same serial,
account-fenced store. Preference failure is surfaced without blocking Search.
Queries over120 UTF-16 units remain searchable but are not retained as history;
the1800-byte native preference budget drops oldest long queries first. No result
snapshots, Session copying, cloud sync or business-table writes.

Provider pagination is consumed in bounded batches (up to40 pages per load), with
inventory/fingerprint checks across pages and final proof validation. If more
remain, counts carry `+` and existing Load more continues the same query. Edits
immediately invalidate pending query/open work; old periodic-check failures cannot
clear a newer page or detail. Category changes filter the same snapshot.

## Navigation and Native evidence

Device: **OTR MT Correction 01 QA**, iOS27.0,
`AD5CCF33-5907-4BE4-8F6C-B6FB20F32C5A`. Bundle `com.xoery.otrmobile`.
Existing signed Debug Native host reused; no binary rebuild/install was necessary
for these TypeScript-only changes. Actual JS consumed this branch on isolated
Metro8083. This is not an embedded Release build claim.

Normal current QA identity: R3-A6 actor
`3a44420f-ec2b-4d7e-9770-410a5ed5e77e`. Existing account-local Reference Trips
were read through the real Search Repository/proofs; no results were injected.
Native acceptance does not certify Hosted completeness of that QA dataset.

- My Trips -> Search; cold restart retained a saved `tokyo` recent, tap reran it.
- Global `tokyo`: All13, Trips2, Itinerary11. Single-row chips, mixed real results.
- Select Itinerary11, native touch-pan to nonzero offset (top row partially clipped),
  open `东京 → 京都｜新干线` (P2), Close -> identical original Search.
  [Before](global-search-v1/search-before-item.png),
  [Immersive](global-search-v1/item-immersive.png),
  [After](global-search-v1/search-after-close.png).
  [Comparison](global-search-v1/return-comparison.json):1206x2622 screenshots,
  content y300…2542, zero different pixels. Status clock and home indicator excluded.
- Global Trips2 -> actual existing TripScreen Home -> native Back -> original
  `tokyo`, Trips2, global entry. No intermediary generic result page.
- Trip Home of `b61b0000-0061-4000-8000-000000000001` -> Search: fixed Trip,
  `tokyo` All5/Itinerary5, no Trips/scope switch; Item Close preserved that state.
- Recent removal and Clear verified; no-result query displayed localized no matches.
- One Dark check retained query and category, readable native/Foundation surfaces;
  restored Light. Long Chinese/English result titles and semantic button labels
  observed. Full VoiceOver/Dynamic Type matrix not executed.

The normal tab `/trip` target folds the root Search route and Back can land on
Today. The failed Toolbar-only candidate was withdrawn. `app/search-trip.tsx`
is a Search-owned root-stack adapter directly reusing TripScreen and the approved
transparent-header NavigationContentFrame contract. Native Back retains Search;
a direct cold link without history has a native Back action to My Trips. It does
not change the ordinary Trip route, business authorization or global Trip context.

A shared Metro transform cache initially resolved app routes from the previous
Experience worktree while feature aliases resolved this branch. Only8083 was
restarted with a temporary unique cacheVersion; the served bundle was inspected to
confirm current `app/` source. No public cache was cleared. Temporary Metro config
was restored exactly and is excluded from delivery. Existing8081/8082 untouched.
The8083 process retains its loaded isolated cache configuration until stopped.
Normal Debug launch for this branch used the one-shot RN argument
`-RCT_jsLocation localhost:8083`; a plain restart can return to the retained8082
preview. No persistent Native setting or Session was migrated.

AD5 was explicitly handed back to Coordinator after VQA for TCL01's read-only
Nelson/Test/NZD25 cold-reopen check. No Expense, Trip, Core or financial data was
written by this work packet. Occasional Debug RN `onAnimatedValueUpdate` without
listeners warning was observed; no data/route error attributed to it.

## Tests and Review

- 32 tests /8 files PASS, run with `--no-file-parallelism`: Search screen/entry,
  root-child return/fallback, presentation ranking/counts, recent storage, existing
  Repository/consumer and domain contracts. Covers stale async queries/opening,
  stale periodic-check failures, fixed scope, account-generation fences, history
  persistence/budget/corruption/removal, and scroll callback restoration.

- Typecheck, scoped ESLint, `ui:guard`, diff whitespace checks PASS.
- One preceding concurrent run hit the existing DB-heavy Repository test's5000ms
  timeout while this Mac was busy; serial rerun passed without changing timeout or
  weakening assertions. Search consumer test now requests fixture version68 to
  match already-integrated TCL01; shared Capture fixture/Migrations unchanged.
- Independent reviewer `/root/vqa_presentation_review`: final source PASS. Found
  one P2 duplicate header inset in the thin route; fixed by reusing
  `navigationContentFrameOptions`, added explicit transparent-header assertion,
  and checked actual Home geometry and Back again. Reviewer did not claim Native.

## Exact dependencies / unclaimed acceptance

1. Existing provider only emits TRIPS and ITINERARY. No global Ledger Expense or
   Document index/result contract is present; no fake categories, counts or viewer
   destinations were introduced. Ledger module-specific search remains unchanged.
2. Existing Item matching allowlist supports admitted Item facts, including flight
   literals. It deliberately excludes linked Booking summaries/private references.
   Booking-reference-to-admitted-Item indexing requires an owning approved safe
   field contract; F04 is not claimed. No Booking category/Immersive was added.
3. Current resolver requires a recorded date/named zone or an already valid
   same-Trip generation-scoped view zone. Undated or unqualified targets fail
   closed with localized unavailable state; this packet does not infer a zone or
   invent an Immersive interface.
4. Offline labels and account-switch isolation have tests; device-wide offline,
   account-switch Native and full accessibility/appearance matrix are not PASS.
5. Base main still has the prior Today cold-root behavior; this package does not
   redesign global navigation. Search's own return paths no longer detour there.

Commit is delivered separately with this report. No merge or push by Experience.
