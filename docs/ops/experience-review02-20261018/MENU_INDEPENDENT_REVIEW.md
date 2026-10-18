# Shared Trip Menu — independent review

Reviewer: Track A Builder (not author of this menu change). Integration HEAD at inspection: `d69e8b08` plus the two uncommitted menu files below. Review limited to this change and direct route/quick-action lease contracts.

- `src/components/GlobalMenu.tsx` SHA-256 `a676e90594119a4a5072ea89a59261f5fa91cf7ad949ebfbb63ad4644500a512`.
- `src/components/GlobalMenu.tripReturn.test.ts` SHA-256 `67e3f77d5f8c1c36cac5fa288c32cf54e2c626e1cfa64e8b2b3c5c2d8b0077cb`.

**PASS for scoped code review: no P1/P2 findings.**

The new section exposes only the owning, existing Edit Trip/Open Day callbacks in module TRIP with an explicit selected-Trip route, exact Trip identity and Account generation. My Trips/Create cannot borrow historical Quick Actions. Invocation checks the current return lease and live Account generation again. Existing lease invalidation covers route, Trip, callback owner, generation and unmount; the new callbacks reuse it rather than bypassing the Workspace/permission boundary. No business mutation, false Members/Documents feature, additional navigation model or Reader authority is introduced.

The added test covers live Edit/Open Day, differing Quick Action Trip, retained stale callback and My Trips exclusion. Existing suite already exercises Account change, dirty-handler replacement, unmount and hot cross-Trip return leases; Coordinator reports 11 menu/model tests PASS. This reviewer did not rerun unchanged tests merely to duplicate that evidence.

TH-07 remains PARTIAL: existing Edit/Day actions are wired; unsupported Trip-only Members/Documents/Settings destinations are not fabricated. This review is neither RENDERED nor NATIVE VERIFIED and does not confer UX acceptance. Native menu operation and integration regression remain required.
