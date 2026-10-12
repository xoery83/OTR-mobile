# CP01B / G2 controlled local-main integration

2026-10-13. Owner accepted synthetic/Simulator integration of `22c036944c8b7dc1ea483cb8ae9ca8766706b430`. Applicable integration gates passed. The isolated candidate is ready for guarded `git merge --ff-only`, preserving the accepted history. Canonical main remains `54ecb4bad6b91827d3abb42f355fc1e0d1fc7016`. No runtime correction, merge conflict, push, deployment, Hosted operation or production activation.

## Ancestry and scope

Preflight canonical main: `54ecb4bad6b91827d3abb42f355fc1e0d1fc7016`; local origin/main and read-only remote main: `b4ddd27d2352350b6d16617543d0f17a715dc077`. Accepted G2-FLEX-02 `12eadff4db4fe2f297f7d2a7a4d73a0790ab2745` is in main ancestry. Accepted CP01B candidate is a descendant of current main.

A fresh clean worktree `/private/tmp/otr-cp01b-g2-main-integration-20261013`, branch `codex/cp01b-g2-main-integration-20261013`, was created at current main and fast-forwarded to the exact accepted candidate. Its runtime tree matches `22c0369` exactly. Separate G2 documentation/evidence commits follow the accepted HEAD; the integration branch HEAD is the prepared target. No accepted commit was rewritten.

| Attribution                  | Exact accepted commits                     |
| ---------------------------- | ------------------------------------------ |
| CP01B import                 | `c2fc443071c0473d49b96adb2c64bd425714821e` |
| CP01B divider correction     | `d190d89a38c29037f08a8816c7cccb21ce98e156` |
| CP01B F14 key correction     | `f5b4597c630ea97507c3a71b3d76b5c3c5a265b5` |
| G2 registry                  | `8ef0a3fb50b033865c793d6ca79c042cd169d978` |
| G2 shared test harness       | `693b9b5bce69109e78f95bfdcc31d49fee3d432e` |
| G2 formatting-only follow-up | `055fa7666a2ea4c083a5727d15e41f2e952968c7` |
| Accepted evidence            | `22c036944c8b7dc1ea483cb8ae9ca8766706b430` |

Preflight inspected 55 existing Flexible/TTR/Core/Flight/G2-related worktrees. Dirty overlaps consist of CP01B's original contribution and shared handoff documents in separate worktrees. Their changes were not imported or overwritten. Main's existing dirty report, three untracked reports and Python cache were hashed, with index/status preserved before the fast-forward. The accepted source worktree remains clean and its branch stays at `22c0369`.

[Complete accepted 48-file manifest, delivery files and hashes](evidence/cp01b-g2-main/manifest.json) · [Concurrency/index/file-hash preflight](evidence/cp01b-g2-main/preflight.json). The previous manifest's file hashes match the reviewed HEAD; its `sourceHead` names the preceding source commit while its handoff hash includes the final evidence commit. This delivery manifest explicitly anchors all accepted hashes to `22c0369`.

## Registry, contracts and authority

Exactly 36 unique synthetic Trip identities: original 22 entries unchanged and in original order, followed by F01–F14. Nelson Hiking / January 15 remains default. All 14 existing TTR expectations pass. One shared registry remains G2-owned; Flexible owns fixture/renderer files.

Preserved ports: `g2-flexible/1` and `g2-flexible-snapshot/1`. CP01B's `flexibleLabContribution(fixture, context?, destinations?): FixtureContribution` / `flexibleLabContributions()` consume the existing renderer and scoped complete-snapshot replacement contract. Browse Choice intents use the single shared Day Feed Focus; Immersive expansion retains its local boundary and restores Browse Focus. Composer controls nested Item placement and safe outer fallback. No new shared port or registration mechanism.

One production Feed/Composer/global Focus, P1/P2/P3, NOW/TNS, Core v1/v2 Day Read and Release Lab isolation remain unchanged. No Composer, Focus, NOW, Core, TTR, Provider, Admission, Sync, migration, native configuration or dependency changes were made for this controlled integration.

## Fresh regression gates

- Clean current-main full suite: **3,893 passed / 2 failed / 23 skipped**.
- Integrated full suite: **3,965 passed / 2 failed / 23 skipped**. Failure identities and complete diagnostics match after normalizing only worktree paths.
- Focused: **17 files / 261 tests passed**. Covers registry/order/default/TTR, all Flexible contributions and renderer/model/snapshot interactions, P1/P2/P3 rendering, composition/nesting, NOW/TNS, Focus/scroll return, Core day projection and UI controls. Full suite also covers Release Lab isolation.
- Typecheck, full lint/UI guard, changed-text formatting and Git diff checks: passed.
- Baseline failures remain `navigationLayout.test.ts` (`tabBarActiveTintColor` undefined) and `architectureBoundary.test.ts` (unchanged diagnostics-test sync mock). No new persistent failure; no unrelated fix or timeout alteration.

[Exact normalized comparison](evidence/cp01b-g2-main/validation.json). Focused/static logs are beside it. Test runs used one worker sequentially to avoid the previous concurrent-run timeouts.

## Native evidence and Flexible handoff

Task-owned iPhone 18 Pro / iOS 27 Simulator `1D01B9F0-6591-4C15-A4CD-43E86E86AA13`; existing Debug binary `com.xoery.otrmobile` restarted and served new JavaScript from the fresh integration worktree on local Metro 8097. This is not a fresh native build. No protected Simulator or physical-device data was overwritten. Initial Light appearance was restored after Dark checks.

| Case     | Controlled integration native check                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| F01      | Empty Block opens Immersive and returns                                                                                                    |
| F02      | Group-only Choice Focus                                                                                                                    |
| F03      | Group filter and Choice Focus                                                                                                              |
| F04      | Unique nested canonical Item; Focus retained after Immersive return                                                                        |
| F05      | Published Choices carousel in Immersive                                                                                                    |
| F06      | Native upward divider expands, downward divider collapses                                                                                  |
| F07      | Saved resource preview; accepted Search evidence retained from source checkpoint                                                           |
| F08      | COPY via Add-to-My control, My 3, Undo restores My 2                                                                                       |
| F09      | Selectable empty case; gap creation excluded                                                                                               |
| F10      | Today Choice Focus coexists with NOW                                                                                                       |
| F11      | Past plan without evidence                                                                                                                 |
| F12      | Selectable accessible Immersive; accepted large-type coverage retained                                                                     |
| F13      | Soft overlap, adjacent Block/TNS outer placement; nonzero Feed scroll restores after adjacent Immersive closes                             |
| F14      | Read-only Block, no resize edges, no React key warning                                                                                     |
| Original | All 22 accessible in catalog; Nelson default on Lab entry; Faroe P1/P2 and flight Focus; P3 Stay Focus; TTR NOW collision and intent Sheet |

[22 fresh native screenshots and catalog AX evidence](evidence/cp01b-g2-main/manifest.json) supplement the accepted F01–F14 matrix in [the coordinated source report](CP01B_G2_COORDINATED_INTEGRATION_REPORT.md). Fresh checks cover Light and Dark. No new native key error appeared; generic development-tool warnings do not constitute provider or production evidence.

Flexible may resume its own held-gesture calibration and business experience work against the unchanged accepted shared contracts, keeping future registration deltas under G2 review. G2 returns to maintenance mode. The candidate history, owner attribution and original evidence remain available.

Held drag-copy, held edge-resize, F09 gap creation, F14 promotion and Group-only Past remain deferred and unactivated. Physical-device calibration, real data, business persistence, Pool backend, actual network-disconnection validation and production gesture activation are separate gates. No acceptance for these is implied by control-based COPY/Undo or Simulator checks.

## Main advance approval block

Automatic approval review rejected the attempted guarded local-main fast-forward before execution: it classified canonical main as a protected/default branch and required trusted explicit final Owner approval after validation. The attached request authorizes controlled main integration, but the automatic reviewer did not accept that as the required final approval. No ref/index/worktree update occurred. Do not bypass the rejection. All unaffected integration, regression, native and evidence work is complete; the prepared candidate is ready for explicit approval of the local-only fast-forward. No runtime change or repeat native gate is required for these documentation-only status updates.

STOP — VALIDATED CP01B / G2 CANDIDATE READY; LOCAL MAIN ADVANCE BLOCKED ON FINAL OWNER APPROVAL.
