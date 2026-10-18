# EXPERIENCE-REVIEW-02 integrated local candidate — PARTIAL

## Fixed lineage

Base f87e119 (actual Owner Day/Create preview); main e81eeb9 inspected but lacks latest preview integration. Root Import/AD5/8083 are untouched. Original package SHA624f05b8684135d0c843b9427133ac46d2795b71cab03bc3cdcacf0fe879c2be verified.

| Package | Builder pin | Isolated integration | Independent review |
|---|---|---|---|
| A Day Shell/Calendar | 0af7ddc | 26b1cae | DAY_INDEPENDENT_REVIEW.md |
| B Home/Checkout/Preparation | fd14aab | 0731b65 | HOME_INDEPENDENT_REVIEW.md |
| Today mounted refresh | 7388740 | d69e8b08 | HOME_INDEPENDENT_REVIEW.md follow-up |
| Existing Settings Debug | 61d0d80 + explicit AnyTodayRead union fix | 1161204 + final integration | EDITOR_INDEPENDENT_REVIEW.md correction; final tsc below |
| C Editor/Calendar/Setup | f572466 | 6f094d4 | EDITOR_INDEPENDENT_REVIEW.md |
| Shared Menu/Header | serial Coordinator patch | final integration commit | MENU_INDEPENDENT_REVIEW.md; EDITOR_INDEPENDENT_REVIEW.md TH11 |

## Actual local changes

- Day loading no longer falls through to legacy Today; measured introduction boundary controls blank initial/single-line date header. Initial range row opens Calendar; locale date compression and readable system material retained.
- Tab/Home restores semantic Day identity using existing Account-scoped SecureStore hints; Focus/Immersive keeps Item anchors. Core Day1 includes Trip header while lawful earlier dates remain discoverable. Same-window layout refresh remeasures without resetting FlatList; pending jump dates publish after confirmation. No extra retries.
- Checkout event qualifies only exact owning date; active stay remains checkout-exclusive. Unknown timezone uses explicit selected plan date, never phone timezone or invented NOW.
- Same-scope Preparation/Today refresh retains valid content; null/error or changed scope invalidates. No global cross-remount cache without lawful permission/data-version invalidation.
- Local metadata commit closes Editor and updates same-ID Hero; older focus reads fenced. Fixed top SheetHeader owns one Save; draft/error/idempotent operation preserved. Post-commit remote/read success is not the local save boundary.
- Range picker continuously virtualizes months, expands both ends, preserves optional/one-sided dates and Done/Cancel/Clear, clamps valid years. Manual destination text and existing Ledger currency authority/locks remain.
- Preparation only prompts missing metadata and permits setup in populated state. Hero metadata order corrected; offscreen native title uses current same-Trip/generation quick actions or lawful discovery name. Shared menu reuses only real scoped Edit/Day/Members callbacks. Members uses existing setup Person facts and TripMembersSheet, with no invented invitation or membership authority.
- Spending removes redundant counts without changing financial values. Today technical details hidden by default and visible via existing Debug preference.

## Validation

- Combined16 focused suites /195 tests PASS. Independent C rerun33 tests PASS. After final type/menu refinements, focused Today+Menu22 tests PASS and final Menu11 tests PASS.
- Final TypeScript exit0 after explicit accepted/local Today union annotation; original61d0d80 did not itself satisfy that final-byte check, recorded transparently in independent review.
- Final Members integration: focused27 tests PASS, TypeScript exit0, scoped ESLint exit0, UI guard PASS. Members5-file independent review PENDING because platform refused follow-up agent thread; Root will reuse a current Reviewer before Native qualification.
- UI guard PASS; final GlobalMenu ESLint exit0 after pure eligibility flag/conditional array construction (no rule suppression). All builders scoped lint passed; final Coordinator changed-file checks recorded separately.
- One broader existing unknown-zone test expected UTC while baseline passes empty zone; untouched baseline reproduced the same failure. It was not changed to force PASS.

## Status / remaining gates

Code and real production callbacks are IMPLEMENTED/WIRED for the bounded fixes above; RENDERED/NATIVE VERIFIED are NOT VERIFIED. No Simulator installed/booted, no actual user data edited and no Hosted/Metro change. No UX Accepted.

Remaining P0 gate: independent integrated Native verification of actual geometry, pending hotel/readback, save/close/cold restore and scrolling. Owner AD5 remains reserved. See NATIVE_GATE.md and NATIVE_RESOURCE_PLAN.md.

Known partials: cross-remount permission/version cache; trusted Calendar place-transition source; loading-more feedback and measured long-trip behavior; real Members invitation/connection status and legal Documents menu navigation; Cover Gallery/Tag Matching/photo persistence; multi-place identity/disambiguation; full Debug placement outside Today. Existing historic TODOs stay open. These gaps are not hidden by tested component existence.

No new Schema/Migration, Provider, Admission/Reader/Composer business contract, TIME-01/NOW/TTR/NTC rule or P1–P6 Renderer redesign. DayFeed host restore props changed only presentation, not its business Composer contract. Local rollback is reverting these isolated commits; no data rollback required.
