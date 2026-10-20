# CP01B registration proposal — G2 controlled integration pending

2026-10-13 (Pacific/Auckland). **REGISTRATION PROPOSAL/TESTS PASS; STOP FOR OWNER REVIEW.**
G2 reviewed the append-only placement, then clarified that shared registry application
belongs to G2's controlled integration. That later boundary supersedes the broader
placement approval. CP01B has applied **no shared registry or test changes**.

- Reconciled only CP01B to exact required main
  `54ecb4bad6b91827d3abb42f355fc1e0d1fc7016` without commit/merge. Preserved all
  candidate feature bytes and prepended the isolated handoff to newer main's
  handoff. Initial index freshness error was resolved with `git update-index --refresh`;
  the full pre-update handoff was backed up before restore/reconciliation.
- Shared registry and its test remain byte-identical to required main. Proposed
  registry patch adds only the feature-owned import and appends F01–F14 after all
  22 existing entries. No Composer, Focus/NOW, TTR, Core, native or database edits.
- Proposed shared test patch asserts **36 unique entries**, exact first-22 IDs/order,
  default Nelson/Jan15, all appended F01–F14 IDs, and all 14 accepted TTR composition
  expectations. Narrow renderer surface mocks prevent native Flow imports in pure
  catalog coverage; the 71 Flexible interaction tests retain actual adapter coverage.
- `git apply --check` passes for both proposed patches. Their files are external
  review artifacts, not applied candidate paths:
  `/private/tmp/cp01b-native-gate-evidence/registration-proposal.patch` and
  `registration-test-proposal.patch` in the same directory.
- Actual execution: **18 test files / 261 PASS / 0 FAIL / 0 SKIP**. This includes
  the accepted 71 Flexible and 189 affected regressions plus one proposed-catalog
  test containing the 36-entry/14-TTR assertions. Its runtime redirects only relative
  imports to existing owning modules and executes the proposed registry; source
  and runtime harness are retained beside raw `tests.json` / `tests.log`. The
  temporary harness test path was removed from the worktree after execution.
- Typecheck, scoped lint, UI guard, formatting and exact boundary checks PASS.
  No new native build or full-repository suite PASS is claimed.

Executed validation:

```sh
./node_modules/.bin/vitest run src/features/flexible-native-gallery src/features/day-feed src/features/day-feed-lab src/features/ttr src/domain/trip/dayReadModel.test.ts src/data/repositories/tripCoreV2DayFeedRepository.test.ts src/ui/foundation.test.ts src/ui/controls.test.ts --reporter=json --outputFile=/private/tmp/cp01b-native-gate-evidence/tests.json
npm run typecheck
./node_modules/.bin/eslint src/features/flexible-native-gallery fixtures/flexible-native/src/ui/catalogs.ts
npm run ui:guard
```

Actual shared Lab registration: **NOT APPLIED — awaiting G2 controlled integration**.
The native F01–F14 matrix in the earlier gate section remains **NOT RUN** for every
row. No Simulator touch/gesture/screenshot, Metro switch, install or device action
has occurred. No Simulator PASS is claimed. Gap creation and promotion remain
excluded; Group-only Past variation still requires separate approval.

Exact worktree candidate remains **17 paths**, now relative to required main54ecb4b.
Only isolated documentation changed from the accepted candidate. The external patch
bundle proposes two additional G2-owned shared paths; application is G2's task.
See external `manifest.json`, `proposal-manifest.json` and `candidate-vs-base.patch`.
Index empty; no commit/merge/push/activation and no other agent's worktree changed.

**Next: G2 controlled registration integration, then Owner-authorized shared Lab
Simulator execution.** The following sections preserve earlier checkpoint evidence;
any earlier approval/base status is superseded by this latest gate.

---

# CP01B shared Lab native gate — registration approval pending

2026-10-13 (Pacific/Auckland). **PREFLIGHT PASS; STOP BEFORE SHARED REGISTRATION.**
Owner explicitly requires G2 approval of a shared registration patch before it is
applied. The patch is prepared and sent to `D-DL1 — Day Feed Lab Shell`; no approval
or registration completion is assumed.

- Canonical main is exactly required `54ecb4bad6b91827d3abb42f355fc1e0d1fc7016`;
  required ancestry passed. Its unrelated dirty/untracked paths were preserved.
- Existing CP01B branch/worktree are correct; retained HEAD is accepted source
  `12eadff4db4fe2f297f7d2a7a4d73a0790ab2745`. Shared registration and interfaces
  are byte-identical to required main. This is not a claim that `54ecb4b` is an
  ancestor of CP01B's current HEAD; base reconciliation remains a resume step.
- All **17 approved candidate files and SHA-256 values** matched the latest
  adapter evidence before documentation updates. Index initially empty and remains
  empty. No protected G2/Core/TTR/Focus/NOW/database/native/routing changes.
- Read actual `FixtureContribution`, catalog and shared Lab integration guide.
  The guide permits contribution entries but the current Owner instruction adds
  a specific prior-G2-approval checkpoint for the shared file.
- Exact minimal proposal: import `flexibleLabContributions` from the feature-owned
  adapter and append `...flexibleLabContributions()` at the end of
  `collectFixtureContributions([...])`. All 22 existing entries, including TTR and
  the reactive demo, retain their positions and identities; F01–F14 add 14 entries.
- Proposal file: `/private/tmp/cp01b-native-gate-evidence/registration-proposal.patch`.
  `git apply --check` PASS; patch **NOT APPLIED**. Registration status: **PENDING**.
  Shared-file changes: **NONE**. No production activation, commit, merge or push.

## Native acceptance matrix at this gate

| Fixture | Simulator/touch acceptance | Evidence / remaining condition                                              |
| ------- | -------------------------- | --------------------------------------------------------------------------- |
| F01     | NOT RUN                    | Registration approval pending                                               |
| F02     | NOT RUN                    | Registration approval pending; Group-only Past variation not yet registered |
| F03     | NOT RUN                    | Two-column/thumbnail geometry remains unexecuted                            |
| F04     | NOT RUN                    | Nested unique rendering/fallback remains unexecuted                         |
| F05     | NOT RUN                    | Published carousel/swipe arbitration remains unexecuted                     |
| F06     | NOT RUN                    | Expanded Pool/sticky My target remains unexecuted                           |
| F07     | NOT RUN                    | Discovery and synthetic destination previews remain unexecuted              |
| F08     | NOT RUN                    | Actual COPY/remove/Undo drag gestures remain unexecuted                     |
| F09     | NOT RUN                    | Resize/cancel/snap remains unexecuted; gap creation excluded                |
| F10     | NOT RUN                    | Today/NOW/date/scroll preservation remains unexecuted                       |
| F11     | NOT RUN                    | Past history/privacy remains unexecuted                                     |
| F12     | NOT RUN                    | Light/Dark, EN/ZH, large text/accessibility remain unexecuted               |
| F13     | NOT RUN                    | Adjacent/TNS/privacy placement remains unexecuted                           |
| F14     | NOT RUN                    | Authorized own Choice edits remain unexecuted; promotion excluded           |

No Simulator install/launch, Metro change, touch, screenshot or device action was
performed before registration approval. **Simulator PASS: NOT CLAIMED. Physical
Device: NOT RUN.** No gesture failure or success is invented. The accepted 71
Flexible / 189 regression results below remain adapter evidence, not new native
results. No implementation changed, so these suites were not rerun for patch-only
preparation. Native snapshots/observations will be recorded after approved registry
application, required-main reconciliation and actual execution.

## Exact current deliverables and next gate

Updated complete 17-path manifest and untracked-inclusive diff are under
`/private/tmp/cp01b-native-gate-evidence/`. Only this report and the isolated current
handoff differ from the approved candidate; feature implementation bytes remain
identical. The proposed shared-file edit is an external review artifact, not an
applied or staged candidate path.

**Next: G2 approval of the exact two-line registration proposal.** On resume,
verify current catalog/collision status, preserve the required-main handoff when
reconciling the preparation base, apply only the approved registration, then run
available native validation. Group-only Past coverage may need a separately
approved factory variation; the default F02 is Future and default F11 has My
Choices. No Gap Creation, Promotion, provider/Photos/Ledger, Core/SQLite/Supabase
or TTR integration belongs to this gate.

---

# Flexible CP01B — Adapter and snapshot producer preparation

2026-10-13 (Pacific/Auckland). **ADAPTER PREPARATION PASS / STOP FOR OWNER REVIEW.**
Shared Lab registration and native acceptance are not performed in this adapter
preparation turn. Main integration was confirmed during final verification. No production Flexible acceptance, commit, merge or push.

## Exact provenance and isolation

- Canonical local main observed at `a878be35db92fb7e36edd5e89f26fe94f1bcb07a`.
  `git merge-base --is-ancestor 12eadff main` returned 1: G2-FLEX-02 is not
  integrated into that main at initial preflight. During final verification, main
  advanced to `54ecb4bad6b91827d3abb42f355fc1e0d1fc7016`; the accepted source is
  now an ancestor. Snapshot, Block renderer, DayFeed, Composer and contribution
  interface bytes match the preparation base. Its unrelated dirty/untracked
  files were untouched.
- Accepted source `codex/g2-flex-02` is exactly
  `12eadff4db4fe2f297f7d2a7a4d73a0790ab2745`, parent `a878be35`.
  Read its actual snapshot, Block renderer, DayFeed and contribution exports,
  implementation report, validation summary and updated integration guide.
- Existing `codex/flexible-day-feed-lab-cp01b` worktree is preserved at
  `/private/tmp/otr-flexible-day-feed-lab-cp01b-20261012`. Its only initial candidate
  was the untracked preflight report; tracked changes/index were empty. After
  verifying ancestry, `git reset --keep 12eadff4db4fe2f297f7d2a7a4d73a0790ab2745`
  advanced only this preparation branch. The prior report stayed byte-identical
  during the update and is saved in `prior-report.md` in external evidence.
- Preparation base/retained HEAD is the accepted source candidate, not a claim
  that main has integrated it. No G2-owned branch/worktree was modified.
- Imported exactly 12 feature-owned paths from approved CP01A
  `58530096c4a00a2d243178a40dce7c5978dbd4aa`. No earlier current-state handoff,
  architecture report or Owner contract was copied over newer shared files.
  Source contracts remain unchanged in their source worktree.

## Implemented mapping and producer

`labAdapter.tsx` exposes pure `flexibleLabContribution` and
`flexibleLabContributions` factories (F01–F14), using existing `day-feed-lab/1`
fields. Synthetic ordinary Items use the existing fixture projector; Block identity
is independent. Existing `day-feed-renderer/1` Item fallback remains authoritative:
no Block is falsely assigned a P3–P6 family and no Item renderer is replaced.
G2's `nestedItems` slot supplies ordinary Item/NOW presentation once.

`snapshot.ts` maps `flexible-fixture/1` facts into `g2-flexible/1`: stable Block
ID, Account/Trip/date, both authorized My and Group sets, explicit Item references,
soft start/end minutes and adjacent Block facts. No inferred time affiliation,
provider call or Canonical writer. G2 filters Choices and defaults to Group.
Browse keys use exported `choiceFocusKey` and `blockRowKey`; header intent opens
G2 Block Immersive directly. Scope switching does not clear ordinary Item Focus.

The producer reads accepted Snapshot/scope and applies authorized fixture mutations
through the existing reducer. It creates a complete frozen
`g2-flexible-snapshot/1` replacement at the next safe revision, preserving unrelated
Blocks, Group facts and Item affiliations. Rapid callbacks use its latest accepted
replacement before React delivers refreshed props. External higher revisions are
adopted after shared validation; scope/generation mismatch rejects before publication.
G2's callback remains the final acceptance authority, including departed-epoch and
unmounted callbacks. False publication never advances feature state or reports
success; the mounted renderer shows localized rejection copy.

COPY, Remove, Resize, Delete and Undo are exercised. Sole-Block deletion produces
higher-revision `blocks: []`, never null. Delete does not modify the Canonical query.
Favorite/custom-resource actions stay feature-owned; snapshots contain only actual
Choice relations. Published/Pool/Search Resources do not become fake Choices.
Generation changes require a new scoped contribution/producer; old instances reject
rather than reusing another scope's feature state.

`Gallery.tsx` retains the approved CP01A standalone path for its existing tests and
adds a controlled shared path. The shared path uses G2's filtered Choices, supplied
state/dispatch, nested slots and Immersive callbacks, without opening its own Block
Modal or producing its own Day Feed. Within G2 Immersive one local expanded Resource
key controls Pool, Published, My and history; it never calls G2 global Focus.
Resource Details, Map and Navigate intents remain detached readonly payloads with
optional destination callbacks; absent bindings retain clearly synthetic previews.
No real Photos, Ledger, Provider, route or visited evidence was activated.

## Registration and shared ownership

The contribution factory is ready but **not registered in shared
`fixtureRegistration.ts`**. Registration and final shared Lab native acceptance
were deferred while G2-FLEX-02 integration was pending. Integration is now
confirmed at `54ecb4b`; final registration/native execution remains unperformed. The existing catalog and concurrent
G2/TTR work remain untouched. Prior user-authorized registration coordination with
`D-DL1 — Day Feed Lab Shell` remains documented in the preserved earlier report.
A future minimal change is one feature factory import and one contribution spread;
recheck the actual integrated catalog/TTR additions before applying it.

No genuine shared-port incompatibility remains for the four authorized mutation
paths. The earlier static-publication and workspace Focus conflicts are resolved
by G2-FLEX-02 and the Owner-approved local Immersive Focus boundary.

## Automated evidence

**17 test files / 260 PASS / 0 FAIL / 0 SKIP.** Flexible has **71 tests**:
all 51 approved CP01A cases plus 20 new adapter/producer cases. Affected G2/Lab,
TTR, owning Core read and UI regressions have **189 PASS**. These are component/
fixture/mock-host assertions, not touch or native acceptance.

New assertions cover strict revision ordering; rapid COPY/Remove before rerender;
stale host rejection and recovery from its current accepted revision; Account,
Trip, date and generation fences; rejected same-scope callbacks; immutable full
replacement; adjacent Block/Group/affiliation preservation; empty deletion and
independent Canonical Items; My/Group fallback; global Focus suspension/restoration;
unchanged TTR identity/action/input; authorization; Undo/favorite independence;
all 14 factory contributions; controlled header/Choice intents; local Immersive
resource expansion; mounted COPY and rejected Remove; and Item Focus preservation
on scope switching. Existing G2 tests cover its departed-epoch/prop/callback/scroll
machinery; CP01B does not claim a second host implementation.

Commands (external logs/JSON under `/private/tmp/cp01b-adapter-evidence/`):

```sh
./node_modules/.bin/vitest run src/features/flexible-native-gallery src/features/day-feed src/features/day-feed-lab src/features/ttr src/domain/trip/dayReadModel.test.ts src/data/repositories/tripCoreV2DayFeedRepository.test.ts src/ui/foundation.test.ts src/ui/controls.test.ts --reporter=json --outputFile=/private/tmp/cp01b-adapter-evidence/tests.json
npm run typecheck
./node_modules/.bin/eslint src/features/flexible-native-gallery fixtures/flexible-native/src/ui/catalogs.ts
npm run ui:guard
./node_modules/.bin/prettier --check src/features/flexible-native-gallery fixtures/flexible-native/src/ui/catalogs.ts docs/architecture/FLEXIBLE_CP01B_SHARED_LAB_INTEGRATION_REPORT.md
./node_modules/.bin/esbuild src/features/flexible-native-gallery/labAdapter.tsx --bundle --platform=neutral --format=esm --alias:@=./src --external:react --external:react-native --external:expo-symbols --external:react-native-safe-area-context --external:@react-native-community/datetimepicker --loader:.png=file --outdir=/private/tmp/cp01b-adapter-evidence/bundle --metafile=/private/tmp/cp01b-adapter-evidence/bundle.json
```

Typecheck, scoped lint, UI guard, formatting and compilation PASS. UI guard checks
90 representative UI files and retains 473 legacy occurrences without new baseline
forgiveness. Initial typecheck could not find the local `tsc` link; task-local ignored
binary links resolved it. An initial added renderer test used the wrong synthetic
Museum title; corrected to the existing source title, then the complete suite passed.
A nonexistent Core domain test argument was replaced by the actual owning Core read
repository suite (14 PASS); no uncollected suite is claimed. No full-repository test
PASS is claimed; accepted G2's historical baseline failures remain separate evidence.

## F01–F14 preparation matrix

| Fixture | Adapter/component preparation                                         | Shared Lab / native acceptance                        |
| ------- | --------------------------------------------------------------------- | ----------------------------------------------------- |
| F01     | Empty Block snapshot and factory validated                            | Pending registration/native acceptance                |
| F02     | Both scopes; Group-only fallback; G2 filtering tested                 | Pending                                               |
| F03     | Two-column renderer reused; G2 Browse key/depth tested                | Geometry/large text pending native                    |
| F04     | Explicit Item snapshot; uniqueness; soft boundary tested              | Nested native placement pending                       |
| F05     | Published carousel reused; local expansion; no fake Choices           | Peeking/swipe feel pending                            |
| F06     | Normal/Expanded Pool and measured My target reused                    | Sticky target/nested-scroll pending                   |
| F07     | Discovery/favorites/custom resource and destinations reused           | Provider destinations remain synthetic                |
| F08     | COPY/remove/Undo producer and nonzero-rail component regressions pass | Actual drag/drop pending                              |
| F09     | Resize producer, ruler/cancel component cases pass                    | Whole-day gap creation not wired; native snap pending |
| F10     | Today synthetic origin/destination, independent G2 NOW                | Actual NOW/location/native geometry pending           |
| F11     | G2-filtered Past history; no planning workspace or visit claim        | Native Group-only/permissions pending                 |
| F12     | EN/ZH dictionaries and component fallbacks retained                   | Themes, Dynamic Type, VoiceOver/device pending        |
| F13     | Adjacent Block/full replacement/TNS/affiliation tests pass            | Privacy/native placement pending                      |
| F14     | Read-only Block fence; own Choice edits; independent deletion         | Promotion/admission remains gated                     |

## Native status, limitations and production gates

- Adapter/component preparation: **PASS** for implemented paths.
- Registered shared Lab fixture acceptance: **NOT RUN**, factory prepared only.
- Simulator: **NOT RUN — this turn completed isolated adapter preparation; main integration
  was confirmed at final verification**.
- Physical Device: **NOT RUN**; no iPhone 16 Pro availability/acceptance claim.
- No app install, Metro switch, screenshot or native gesture observation. Historical
  G2 native evidence and mocked handler measurements are not CP01B native evidence.

Native limits retained from CP01A: 8pt/15min fixture ruler calibration, no drag
ghost/haptics/autoscroll, unverified nested-scroll arbitration, sticky geometry,
scroll preservation, swipe peeking, image/text scaling and accessibility. The
configured temporal rail origin is 16pt in preparation; real shared Lab calibration
remains required. Screen-space My hit testing remains unadjusted.

Gap creation needs the shared feed entry point rather than an invented new shell;
F09 initially has no Block. Synthetic promotion is rejected by the shared producer
because this snapshot seam cannot create independent Canonical query Items; no
Core writer or falsely admitted Item is substituted. Native availability, accepted
Core DEV Read, durable lifecycle/undo/recovery, real permission revocation, Provider,
Photos/Ledger associations, Android and production activation remain separately gated.

## Exact changed-file boundary

The complete manifest (all untracked additions, bytes, SHA-256, import provenance)
and binary-inclusive diff against `12eadff4db4fe2f297f7d2a7a4d73a0790ab2745` are
`manifest.json` and `candidate-vs-base.patch` in the external evidence directory.
Imported illustration PNGs are included; generated bundles/logs/node dependency
links are excluded. Shared G2/Focus/NOW, TTR, Core/Admission, routes/native config,
SQLite/Supabase and all other agents' files remain identical to the preparation base.

No shared-file modifications or staging/feature commit. **STOP FOR OWNER REVIEW**;
main integration is confirmed at `54ecb4b`. Next: Owner Review of this adapter
preparation, then catalog registration and actual shared Lab/native acceptance. No automatic merge or activation.
