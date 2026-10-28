# P2/P3 Native fidelity candidate — 26 October 2026

Status: Native presentation candidate; serial main integration pending. No Cloud acceptance. Existing Forms, Day Shell/P1 and cumulative UI corrections remain required dependencies, not replaced by this candidate.

Fixed source SHA: `5e3116a1` on `codex/native-forms-p3-delivery`, following `eec3d919`. No merge performed.

Required small follow-up: `edb3d0ad` fixes the R6-discovered large-text identifier column. Both source commits belong to this candidate.

## Frozen source

| Package | Source commit | ZIP SHA-256 |
| --- | --- | --- |
| P2 Flight V1 | `9c10ea33bd18c79e70a30b379314e106686beca8` | `7e7b703fd29099bab9afcaf7fec73d0ba0387c1745392fa6d4011162b7c760d9` |
| P3 Stay V1 | `77057801d1792d80b890e20f008172b2e170efa9` | `5aa80e4c8c639a0c3c9a9596dbab14bbf0eecbad4b89ce9cf4f14cb7d45d5ded` |

P2's 163 manifest members match the pristine ZIP; expanded-directory verification reported extra members, not altered pinned members. P3's 201-file verifier passes. Frozen JSON remains unchanged. The adjacent Stay is an explicitly identified second identity from P3 `reference/p3-app.js:11`, recorded separately. Fixtures stay behind DEV routes and never enter normal Reader or mutation authority.

## Delivered scope

- Approved P2 leg grids, explicitly ordered fixture Journeys, connections only from exact endpoints, scoped document links and booking selection. Past Focus removes seats/documents/maps/insertion while Immersive retains permitted detail. No P2 long-press action exists.
- P3 check-in, daily Base and check-out Browse/Focus/Immersive, including day-use and explicit hotel changes. Planned clocks remain distinct from hotel policies; readable instruction bodies/documents only, known booking references, optional cards omitted when empty. Native Back/Edit reuse existing navigation and Stay form.
- Real actor-filtered local/accepted P3 read adapters, Account/generation/revision validation, real details and Repository-controlled Edit. Normal P2 leg display uses the fidelity grid. No fixture fallback in real Trip views.
- Owner move rule: only planned check-in/check-out clocks, only original day. Daily Base and P2 never move. Reuses the P1 engine and actual Stay Repository; saves only the selected clock, preserving both dates and the other clock. Day-use cannot invert the interval. The physical line and edge scrolling stay within the original day.
- Qualified named-zone/instant P3 movement remains closed: the current manual writer cannot preserve its DST qualification or resolve gaps/folds. Floating civil local Stay clocks can use the existing legal save path. Edit remains available through its actual Repository capability.

## Validation and Vision evidence

Forms QA only: iPhone 18 Pro, iOS 27.0, 402×874pt, safe areas 62/34pt. Own Metro8096 and own Debug build/output; existing synthetic session, Trips and covers retained. AD5, its data and Metro8097 untouched.

- Focused 12 suites: 110/110 PASS. Independent final move/read review: 38/38 PASS; previous P3 read-scope review: 62/62 PASS. Earlier findings concerning leg-document scope, conflicting document versions, later-leg Focus, named-zone moves and day-use ordering were repaired.
- TypeScript, UI guard (473 legacy occurrences; 146 representative files without baseline forgiveness), scoped ESLint and diff checks PASS before the fixed source SHA.
- Real P3 Browse → Focus → Native details → actual Edit → Cancel → Back observed; Focus remains selected and dates/clocks unchanged. No business Save was performed in this visual check.
- All 18 standard nine-state R4 screenshots were visually inspected in contact sheets and show the expected family, depth and clock context. These are fixture presentation evidence, not real Journey/Cloud acceptance.
- Extra batch R4 and cold-launch R5 captures are **rejected**: stale Native details or incomplete startup. Replacement R6 images were confirmed individually using Device Hub AX and screenshots, with Native Back between details: P2/P3 Chinese Dark Focus/Immersive, P2 explicit three-leg large-type Immersive, P3 large-type Focus, day-use two roles and distinct hotel-change identities. Original Light/large text size and English locale restored. Large text expands cards naturally; this is observed layout, not a full accessibility/scroll acceptance.
- R6 found the fixed-width P2 identifier column splitting flight numbers at accessibility-large. Follow-up scales only the stacked column with font scale; Native `ZZ101` now remains intact, with seven focused grid tests/TS/UIguard/scopedlint/diff checks PASS.
- Continuous touch pickup/drag/release/Confirm/cold-recovery is not accepted: available CUA drag/scroll did not visibly deliver the required touch sequence. Unit/Repository checks do not substitute for this Native operation.
- Existing `render.test.ts` has 31 failures reproduced with the same case names on unmodified HEAD (old FlatList/mock/P1 expectations). No full-suite-green claim; focused navigation and the accepted P3 adapter pass.

Evidence root: `/Users/xoery/.codex/visualizations/2026/10/25/01a17101-8b2d-7240-ab67-f4c34a5d90d9/native-day-fidelity/p2-p3-20261026/`. Standard images use `p2/p3-{future,today,past}-{B,F,I}-r4.png`; contact sheets are `p2-native-nine-contact-r4.jpg` and `p3-native-nine-contact-r4.jpg`. Real Native screenshots: `p3-real-edit-r1.png`, `p3-real-details-r2.png`.

Additional verified images are listed in `capture-extra-r6.json`; rejected R4/R5 manifests are explicitly marked REJECTED. Universal released GUI after closing its controlled P1 DEV window; no simultaneous Device Hub operation occurred. Stationary coordinate hold in R6 did not deliver the Native long-press sequence, so gesture acceptance remains pending.

## Difference / owning-interface table

| Area | Native result / remaining difference | Owner / required integration |
| --- | --- | --- |
| Chrome, materials, safe areas | Existing Native Back/Edit, canonical controls and real system metrics; HTML status bar/device frame are reference-only | Native display lane; preserve current shell behavior |
| Real P2 Journey | Single-leg grid connected; full explicit fixture Journey proven. Reader supplies no lawful membership/order for real grouped Journey | Unique Journey Reader writer; explicit IDs/order, never PNR inference |
| P3 detailed address | Strict display uses accepted/authored address, not a place label | Unique Manual writer: P3-only existing `place.authored_address` write/read mapping; no schema change |
| Instruction bodies/doc open | Only actual readable content/open capabilities displayed; metadata does not confer access | Owning instruction/document reader; no fabricated body or download authority |
| Booking guests | Visible existing references/titles shown; participant IDs are not booking guests | Owning booking guest read port if needed |
| Qualified P3 drag | Closed until a legal mutation/resolver preserves named zone/instant/DST | Temporal/manual unique writer; do not drop qualification |
| Cloud | Gate remains closed; no Server Accepted, independent readback or restored-client claim | Existing DEV authorization/window required |

Universal was informed of the two minimal Reader/address gaps and GUI ownership was serialized. No ordinary Native coding approval is requested. Do not merge the branch wholesale: retain the cumulative dependency checklist and reconcile only fixed owning-file differences against current main. Exclude `.forms-qa/`, account/Trip IDs, credentials, simulator data, build outputs and the local `node_modules` link.
