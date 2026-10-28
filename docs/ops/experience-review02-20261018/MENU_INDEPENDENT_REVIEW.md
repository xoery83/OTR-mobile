# Shared Trip Menu — independent review

Reviewer: Track A Builder (not author of this menu change). Integration HEAD at inspection: `d69e8b08` plus the two uncommitted menu files below. Review limited to this change and direct route/quick-action lease contracts.

- `src/components/GlobalMenu.tsx` SHA-256 `a676e90594119a4a5072ea89a59261f5fa91cf7ad949ebfbb63ad4644500a512`.
- `src/components/GlobalMenu.tripReturn.test.ts` SHA-256 `67e3f77d5f8c1c36cac5fa288c32cf54e2c626e1cfa64e8b2b3c5c2d8b0077cb`.

**PASS for scoped code review: no P1/P2 findings.**

The new section exposes only the owning, existing Edit Trip/Open Day callbacks in module TRIP with an explicit selected-Trip route, exact Trip identity and Account generation. My Trips/Create cannot borrow historical Quick Actions. Invocation checks the current return lease and live Account generation again. Existing lease invalidation covers route, Trip, callback owner, generation and unmount; the new callbacks reuse it rather than bypassing the Workspace/permission boundary. No business mutation, false Members/Documents feature, additional navigation model or Reader authority is introduced.

The added test covers live Edit/Open Day, differing Quick Action Trip, retained stale callback and My Trips exclusion. Existing suite already exercises Account change, dirty-handler replacement, unmount and hot cross-Trip return leases; Coordinator reports 11 menu/model tests PASS. This reviewer did not rerun unchanged tests merely to duplicate that evidence.

TH-07 remains PARTIAL: existing Edit/Day actions are wired; unsupported Trip-only Members/Documents/Settings destinations are not fabricated. This review is neither RENDERED nor NATIVE VERIFIED and does not confer UX acceptance. Native menu operation and integration regression remain required.

## Final event-handler lint correction

Independently reviewed the final inline callbacks: each onPress directly checks the same return lease and live Account generation before its existing optional Edit/Day action. The unused helper and non-null assertions are removed; no lint rule was disabled. PASS / no new P1/P2 findings.

Final GlobalMenu.tsx SHA-256 `490534fe1e1f53522c1e40f91a190a678e3fa4d6fb1b2efb518287c15ce84783` supersedes the initial source hash above. GlobalMenu.tripReturn.test.ts remains `67e3f77d5f8c1c36cac5fa288c32cf54e2c626e1cfa64e8b2b3c5c2d8b0077cb`. Coordinator owns the final11-test and scoped-lint execution receipt; reviewer did not duplicate execution. Native remains unverified.

## Final immutable-array lint correction (supersedes prior intermediate hash)

The inline-only intermediate still triggered React refs analysis because the mutable `tripItems.push(...)` call received event closures. Final code uses conditional array spreads, consistent with the existing sections construction. Read-only review confirms logical equivalence: same TRIP/route/Trip/generation eligibility, same Edit-before-Day order, same callback availability and click-time lease/live-generation guards. No function is invoked while constructing the array; no lint rule is suppressed. PASS / no P1/P2 findings.

**Final GlobalMenu.tsx SHA-256 `ced01004082fa9ec708afeb0ee8a43ef7a2533314b76b32729d20daeed8ea3f7`.** Test hash remains `67e3f77d5f8c1c36cac5fa288c32cf54e2c626e1cfa64e8b2b3c5c2d8b0077cb`. Earlier hashes identify intermediate reviewed bytes only. Coordinator records final-byte lint/tests; Native remains unverified. No code edits or duplicate checks by reviewer.

Final-byte addendum: `hasTripItems` now uses the same pure module/route/Trip/generation eligibility plus actual Edit/Day callback existence, replacing the analyzer-tainted `tripItems.length` section condition. Logical equivalence confirmed; no empty section or permission expansion. Final source SHA-256 **`d1345cbaf8bcceb82f05430e9e2c5ac57b9b417562010a5f2d85e3322f7164bd`** supersedes preceding intermediate hashes. Coordinator reports scoped ESLint exit0 on these exact bytes; no rules disabled. Review PASS, Native still unverified.
