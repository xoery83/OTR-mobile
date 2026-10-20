# EXPERIENCE-REVIEW-02 — Track A Day Shell candidate

Baseline `f87e119`; isolated branch `codex/experience-review02-day-20261018`.
Owner source: `docs/beta/experience-review02-20261018/01_PRODUCT_DELTA.md` and `02_UX_BLUEPRINT.md` in Coordinator intake tree.

This candidate changes presentation/navigation hints only. No Reader, Composer, P1–P6, TIME-01, NOW/TTR/NTC, data schema, Hosted or Simulator changes.

## Clause preflight / implementation matrix

| ID | Actual path and root cause | Minimum change / current status | Checks and remaining Native gate |
|---|---|---|---|
| DS-01 P0 | TripScreen Day reader unresolved fell through to legacy Today/Home ScrollView including old Today action. | Day-active unresolved reader returns stable loading/unavailable shell; no wrong-route content. IMPLEMENTED/WIRED. | Test asserts no Workspace/legacy ScrollView. Cold/warm/offline Native loading still unverified. |
| DS-02 P0 | Native header always showed Trip title; threshold32px unrelated to actual introduction height. Introduction dates were plain text. | Header center blank until actual introduction bottom crosses measured native header; date row opens Calendar through existing callback. IMPLEMENTED/WIRED. | Loading/title boundary/accessible44pt date control tests. Native render/blur still unverified. |
| DS-03 P0 | DayFeedShellTitle permitted2lines; formatter repeated month/year for each endpoint; ultrathin material insufficient contrast per Owner observation. | Single line + ellipsis, locale-aware Intl range compression (Hermes fallback preserves truthful full dates), systemMaterial. IMPLEMENTED/WIRED. | Same-month + New Year format tests; actual Chinese/DynamicType/contrast need Native. |
| DS-04 P0 | Persisted hints already exist in Account-scoped dayNavigationBookmarkRepository (SecureStore), but WholeTrip tab resume reused within-Item pixel offset. | WholeTrip RESUME without Focus restores semantic saved Day header with within0; Focus/Immersive Item return remains unchanged. IMPLEMENTED/WIRED. | Navigation/Focus and saved-Day test. No persistence schema change; cold restart/tab return Native required. |
| DS-05 P1 | Calendar always called jumpToDayHeader, including first date; intro was skipped. | Confirmed Core Day1 with Trip header (even when lawful out-of-bounds dates precede it) requests top of intro; other days retain bounded direct-origin/native-measurement jump. IMPLEMENTED/WIRED. | Day1 and existing90-day/far/empty/date disappearance tests. Japan2027-02-12 Native regression required. |
| DS-06 P0 | WindowedDayList layoutRevision always reset origin/epoch/offset before measuring; refresh/Focus resize could visibly replace list. Pending jump viewability also published transient dates. | Mounted same-scope anchor remeasured in-place; distant/unmounted target retains original far-jump mechanism. Pending dates withheld until REACHED then published. IMPLEMENTED/WIRED for these defects; PARTIAL for overall scroll performance. | Existing bounded8-row batches/window5, epoch/stale measure/rapid requests, prepend compensation and refresh identity tests. No increased retry count. Loading-more feedback and 60–120day Native measurement still pending. |
| DS-07 P1 | Existing Calendar renders continuous months, range, selected/disabled dates and real category markers. DaySummary declares placeTransitionLabel but summarizeDay never supplies one. | Preserved existing Calendar; no place inferred in UI and no Reader contract changed. PARTIAL. | Existing coverage/cross-year/marker tests; trusted location label needs owning projection evidence and Native check. |
| DS-08 P1 | Baseline f87e119 uses real finger delta, excluding MVCP/programmatic offset; Capture and shell padding owned by root. | Preserved existing mechanism, no new idle timer/gesture heuristic. PARTIAL pending Native. | Existing touch/drag/cancel/delayed notification/reversal tests and safe padding tests. True forward/reverse/rest/Capture verification remains Native. |
| DS-09 P1 | My Trips root/right-swipe are outside Track A files. | Unchanged; no root/navigation routes modified. Existing tests preserved; Native NOT VERIFIED here. | Coordinator integration Root/My Trips/Trip Home regression required. |

## Ownership

Track A only: `src/features/day-feed/{TripScreen,DayFeed,DayFeedShell,WindowedDayList}.tsx` and matching tests. TripScreen modifications are restricted to Day shell branches/header configuration. No LocalTripWorkspace/Editor/GlobalMenu/root navigation edits. No changes to canonical data authority.

## Validation and recovery

- Targeted Shell/Calendar/windowing/navigation/TripScreen suite: 117 tests PASS.
- TypeScript, targeted ESLint, UI guard and diff whitespace checks PASS (see Coordinator independent review for final pin).
- `node_modules` is an existing dependency symlink, not part of candidate. Vitest uses `--configLoader runner` to avoid writing into shared dependency cache.
- WIRED means code callbacks and existing readers connected; RENDERED and NATIVE VERIFIED remain **NOT VERIFIED**. No AD5/A1A, account, installation, Metro or Hosted operation was performed.
- Revert this candidate commit for local presentation rollback. No database rollback or data repair required.

Remaining risk: systemMaterial contrast, layout changes and semantic alignment depend on real Native geometry; component tests are not Native evidence. Intl.formatRange can be absent on Hermes; fallback keeps both complete dates and single-line truncation, requiring platform/locale acceptance.
