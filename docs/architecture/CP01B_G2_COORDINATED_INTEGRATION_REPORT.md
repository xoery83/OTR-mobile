# CP01B / G2 coordinated registry integration

Status: isolated integrated candidate prepared for final Owner Review. Canonical main has not advanced. Native held drag-copy/resize calibration and two existing full-suite failures remain open; this is not a claim of a completely green release gate.

## Baseline and ownership

Verified canonical main `/Users/xoery/Project/otr-mobile`: `54ecb4bad6b91827d3abb42f355fc1e0d1fc7016`. Origin/main and read-only remote verification: `b4ddd27d2352350b6d16617543d0f17a715dc077`. Existing dirty main documentation and Python cache were preserved. CP01B source candidate `/private/tmp/otr-flexible-day-feed-lab-cp01b-20261012` was based on the same accepted main; its 17 approved files and reviewed patch artifacts were hash-verified before import.

Integration branch: `codex/cp01b-g2-coordinated`, worktree `/private/tmp/otr-cp01b-g2-coordinated-20261013`.

| Owner                    | Commit                                     | Change                                                                          |
| ------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------- |
| CP01B                    | `c2fc443071c0473d49b96adb2c64bd425714821e` | Exact approved 17-file fixture/renderer contribution import                     |
| G2                       | `8ef0a3fb50b033865c793d6ca79c042cd169d978` | Exact reviewed registration and registration-test patches                       |
| G2                       | `693b9b5bce69109e78f95bfdcc31d49fee3d432e` | Native renderer import mock in existing shared Feed test harness                |
| CP01B feature correction | `d190d89a38c29037f08a8816c7cccb21ce98e156` | Pool divider captures its touch before parent scrolling; interaction regression |
| CP01B feature correction | `f5b4597c630ea97507c3a71b3d76b5c3c5a265b5` | Stable keys for F14 synthetic recovery controls; native warning removed         |

G2 retains shared registry ownership. The only shared source edits are `fixtureRegistration.ts`, its test and the Feed renderer test mock. Composer, global Focus, NOW, Core, TTR, Provider, Admission, Sync, migrations and native configuration are unchanged. No main merge, push, deployment or production activation occurred.

G2 formatting-only follow-up: `055fa7666a2ea4c083a5727d15e41f2e952968c7` normalizes the reviewed registry assertion; its semantics are unchanged and registration tests pass again.

## Exact integration API and manifest

The imported contribution exports `flexibleLabContribution(fixture: FixtureId, context?: Context, destinations?: Destinations): FixtureContribution` and `flexibleLabContributions()`. `Destinations` is the optional pick of `FlexibleRendererProps`: `onResourceDetailsIntent`, `onMapIntent`, `onNavigateIntent`. It consumes the accepted `FlexibleBlockRendererProps` snapshot/replacement/focus contract and existing `FlexibleSnapshotScope`; no new shared port is introduced.

`fixtureRegistration.ts` appends `...flexibleLabContributions()` after the existing 22 entries. All 36 Trip IDs are unique; the first 22 retain exact order, Nelson Hiking / January 15 remains default, and all 14 existing TTR expectations remain asserted. F01–F14 use synthetic date 2026-10-12. F10 is Today, F11 Past, others Future.

[Exact changed-source hashes, commit attribution and screenshot hashes](evidence/cp01b-g2-coordinated/integrated-manifest.json). The feature import is byte-identical to the approved candidate at its import commit; subsequent feature changes are limited to `Gallery.tsx` and `renderer.test.ts`. Delivery documentation and evidence are recorded separately.

## Validation

- Focused composition, interactions, registration, TTR, Core read projection and UI controls: **17 files / 261 tests passed**, `--maxWorkers=1`.
- Typecheck: passed. Full lint and UI guard: passed (473 legacy occurrences; 90 representative files).
- Formatting of changed text files and `git diff --check`: passed.
- Full baseline: **3,893 passed / 2 failed / 23 skipped**. Final integrated full suite: **3,965 passed / 2 failed / 23 skipped**, with identical normalized baseline diagnostics. Counts and normalized failure comparison are recorded in [validation.json](evidence/cp01b-g2-coordinated/validation.json).
- Known baseline failures: `navigationLayout.test.ts` reads undefined `tabBarActiveTintColor`; `architectureBoundary.test.ts` flags the unchanged `LocalOperationsDiagnostics.test.ts` sync mock. They were reproduced on clean accepted main. No unrelated fixes or timeout changes were made.
- An initial concurrent validation run produced extra five-second timeouts under load. Sequential focused/full runs replace that result. An initial shared Feed harness failed on React Native Flow imports; the narrow renderer mock fixed that test boundary while actual feature renderer tests remain active.

## Native validation

Task-owned iPhone 18 Pro / iOS 27 Simulator `1D01B9F0-6591-4C15-A4CD-43E86E86AA13`, existing Debug binary `com.xoery.otrmobile`, JavaScript served from this worktree on local Metro 8097. No fresh native rebuild is claimed. Dark and Light were exercised; accessibility-medium type was exercised in F12 and restored to large. Actual viewport is 402 pt; narrower layouts are automated coverage. Fixture mode only; Core DEV was unavailable without authentication.

| Case     | Observed native result                                                                                                             | Evidence                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| F01      | Empty independent Block → Immersive, empty Choice columns                                                                          | `f01-empty-immersive-dark.png`                                                                                                         |
| F02      | Group-only Choice Focus and Block Immersive return                                                                                 | `f02-group-choice-focus-dark.png`                                                                                                      |
| F03      | My/Group counts and replacement of one global Choice Focus                                                                         | `f03-two-column-focus-dark.png`                                                                                                        |
| F04      | Nested canonical Item Focus preserved after Immersive close                                                                        | `f04-nested-item-focus-restored-dark.png`                                                                                              |
| F05      | Published carousel and native vertical scrolling                                                                                   | `f05-carousel-scroll-dark.png`                                                                                                         |
| F06      | Upward divider expands Pool; downward collapses after feature fix                                                                  | `f06-pool-gesture-expanded-dark.png`                                                                                                   |
| F07      | Saved tab and name-only Search result                                                                                              | `f07-search-result-dark.png`                                                                                                           |
| F08      | Add-to-My gives My 3; undo restores My 2; remove/undo clears stale Focus                                                           | `f08-copy-my3-dark.png`, `f08-remove-undo-focus-cleared-dark.png`                                                                      |
| F09      | Empty Day selected; gap creation remains excluded                                                                                  | `f09-empty-gap-excluded-dark.png`                                                                                                      |
| F10      | NOW coexists with focused Choice; straight-line distance only, navigation target preview                                           | `f10-now-straight-line-focus-dark.png`                                                                                                 |
| F11      | Past plan / memories, unknown attendance and absent evidence, no Planner                                                           | `f11-past-no-evidence-dark.png`                                                                                                        |
| F12      | Light appearance and accessibility type, Focus / Immersive / Pool remain usable                                                    | `f12-accessibility-type-light.png`                                                                                                     |
| F13      | Soft start 12:45 retains explicit 12:30 Item; adjacent Block and TNS remain outer; adjacent Immersive restores nonzero Feed offset | `f13-adjacent-tns-outer-light.png`, `f13-scroll-before-final.png`, `f13-adjacent-immersive-final.png`, `f13-scroll-restored-final.png` |
| F14      | Read-only Block has no resize edges; own Choice remove/undo works; keyed controls show no warning after reload                     | `f14-read-only-final.png`                                                                                                              |
| Existing | Reload still defaults to Nelson; original TTR NOW collision opens its intent Sheet                                                 | `nelson-default-final.png`, `ttr-now-existing-sheet-final.png`                                                                         |

Images live under `evidence/cp01b-g2-coordinated/`. F01–F13 were exercised on the divider-fixed source; final source adds only stable F14 control keys. F13/F14/default/TTR were rechecked after the final reload.

## Remaining limits and CP01B handoff

Held drag-copy and held edge-resize positive native gestures were not established through Device Hub automation. Ordinary unarmed resource dragging scrolls without copying; divider gestures pass. Add/remove/undo and snap controls pass, with detailed manipulation behavior covered by automated tests. Physical-device held-gesture calibration remains required; do not infer it from control equivalents. F09 gap creation and F14 promotion are declared exclusions and were not activated. F14 Group-only Past is not part of this authorized contribution. Network disconnection and physical-device performance were not tested. Missing resource facts use synthetic previews; no real destination provider was called.

CP01B can resume from the feature commits above, carrying the two native corrections. Keep further fixture contributions in feature-owned paths; submit registration/test deltas to G2. Preserve the original 22 entries, order and default. Do not change shared Composer/Focus/NOW/Core authority. Final Owner Review must resolve the baseline gate exceptions and remaining native calibration before canonical-main advancement.
