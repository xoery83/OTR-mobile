# CP-TTR-05A2-A — Feature preparation

2026-10-13 · **READY FOR OWNER REVIEW / VERIFIED SYNTHETIC + VERIFIED SQLITE**.

## 1. Baseline, isolation and scope

Branch `codex/ttr05a2a-feature-preparation`, worktree
`/private/tmp/otr-ttr05a2a-feature-preparation`, retained clean committed starting
HEAD `54ecb4bad6b91827d3abb42f355fc1e0d1fc7016`. This was current local main,
containing accepted G2 integration `a878be35db92fb7e36edd5e89f26fe94f1bcb07a`
and FLEX-02 `12eadff4db4fe2f297f7d2a7a4d73a0790ab2745` through normal merge
`6801bfcdf0023fd9605f09a8b96859f22037605e`. The committed FLEX-02 main report
records Owner acceptance and controlled integration; the prior preflight's
candidate-only status is historical, not the current baseline.

Tracking origin/main was `b4ddd27d2352350b6d16617543d0f17a715dc077`; no fetch.
Canonical chat checkout stayed dirty `intelligence/deferred-apple` at
`c4571746b0c300fa3b46842cd37745963567338c`, retaining its three tracked edits
and untracked work. Separate main retained its modified Platform report/four
untracked entries. Only committed sources were adopted; no parallel dirty files.
Dependencies were privately APFS-cloned from the preceding TTR workspace, with
no install/version/lockfile change. No native commands or protected app operation.

Read CP05A2-P from its isolated workspace, current handoff, actual G2/FLEX source,
accepted controller/repository, UI Foundation and terminology glossary. No
shared G2/Focus/Composer/Lab/Sheet Host/catalog or Core source was edited. A
validation-time inventory recorded HEAD/status/dirty-file hashes for 88 other
available worktrees. Concurrent Core ORDER-02 advanced to an isolated commit;
its source is not adopted or treated as real TTR runtime acceptance. Final
preservation comparison follows below.

## 2. Exact accepted adoption

Four necessary files were adopted byte-for-byte from accepted CP05A1
`b18203bf0dcdb654a0200dd0c126b9c3c72b2716`. No compatibility change to its
controller or the accepted CP04B2A repository was required.

| Adopted path                                             | SHA-256                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| `src/features/ttr/interactionController.ts`              | `53ddd121ac167a444b1b3263aaff4f4af8f73759fc7438b929e3015e823631d5` |
| `src/data/repositories/ttrInteractionController.test.ts` | `0ad7949c6c666ffae9b48cb4dce6429af322f58652757f7a2116ccd39f9d8006` |
| `src/data/repositories/ttrSelectionRepository.ts`        | `e22a38574fd082fd8596194eaf9d784493e53c7bbbbdcecd1d0eba0613a6db25` |
| `src/data/repositories/ttrSelectionRepository.test.ts`   | `c1644143d1862293387146c982e991f8a7efaec3c8142e06971f65eaf8f209a8` |

Repository files are also exact CP04B2A
`7d15629e11a71227447373fb8844bd9e87c4d585` bytes. Domain/reducer/test/fixture
already exist on the main baseline and remain unchanged, matching accepted
CP04A1/CP04B1 sources. No historical branches or reports were merged wholesale.

## 3. Sheet Content API

**VERIFIED SYNTHETIC:** `src/features/ttr/TtrLabSheetContent.tsx` exports
`TtrLabSheetContent` and `TtrLabSheetCopy`. It receives a typed interaction view,
explicit synthetic endpoint labels + matching identity key, localized copy and
Preview/Confirm/Dismiss/Recover callbacks. External Maps is optional and only
renders when the host supplies an authorized callback; no native maps handler.

The component is DEV-only and inert in Release. It provides one canonical
SheetHeader, themed flex viewport/ScrollView, canonical UiButtons for the three
modes and confirmation, existing localized straight-line distance, confirmed mode,
draft indication and readable opening/save/check/failure/uncertain/success feedback.
A selected button's localized Preview label communicates its draft state; no
new global choice control. No automatic selection, SQLite call or projection
publication occurs in rendering. Close delegates Dismiss and stays usable while
saving; it does not promise cancellation of durable work.

Confirm/mode/maps actions are disabled outside a matching qualified READY session,
while saving/checking, for unavailable/stale/Past/same-location facts, and for
uncertainty. Confirm additionally needs an explicit preview mode. Safe re-read
appears for uncertain/error states. Endpoint/confirmed labels are not reconstructed
from missing authority. G2 must slot this **entire content body including its one
SheetHeader** into the existing Modal, rather than add it beneath another header.
The component creates no Modal, navigation stack, Focus or host of its own.

## 4. React adapter API and lifecycle

**VERIFIED SYNTHETIC:** `src/features/ttr/useTtrLabInteraction.ts` exports
`useTtrLabInteraction`, `TtrLabInteractionInput` and `TtrLabInteractionView`.

Input contains Account/Trip/generation/traveller/localDate/visitKey; G2 authorization
key/version/actionable; current relation+projection resolver; injected repository,
clock, synchronous publication-acceptance callback and host-dismiss callback.
The resolver uses accepted `TtrInteractionSource`; intent delegation derives
`Parameters<Controller["onOpenTtr"]>` and therefore the actual G2 payload.
No competing intent or Day-row model.

Returned API: view, onOpenTtr, preview, confirm, recover, dismiss, invalidate,
dispose. Phases distinguish CLOSED/OPENING/READY/SAVING/RECOVERING/UNAVAILABLE/
ERROR/UNCERTAIN/PUBLISHED/SAVED_UNPUBLISHED. The adapter catches async Open,
Confirm and Recover errors; no unhandled Promise is delegated to G2.

A private closure owns mutable controller/session bookkeeping. React renders
only state and immutable descriptors; controller creation/disposal and latest
owner-input updates occur in committed layout effects. Scope/repository/eligibility
changes replace the binding. Captured descriptor identity fences A→B→A callbacks,
even where primitive values repeat. Full source changes are rechecked before
paint/actions/async completions. No event bus, scheduler or shared state manager.

The adapter explicitly trims context to the repository's strict three fields
(Account/Trip/generation); traveller/date/visit remain adapter/host facts. This is
an adapter boundary, not an accepted repository semantic change. Source presentation
key must match current G2 key, and current traveller must match supplied relation.
A stable repository handle and pure/local current resolver are required.

## 5. Guarded DEV SQLite factory and schema

**VERIFIED SQLITE through injected Node SQLite:**
`src/data/repositories/ttrLabSelectionRepository.ts:openTtrLabSelectionRepository`
is an explicit async factory returning `{ repository, close }`. Native import
is lazy within the guarded path; no module-level open or startup/default instance.
Installed Expo API/types support openDatabaseAsync with useNewConnection; actual
Expo/native behavior remains NOT TESTED.

The fixed filename is `otr-ttr-native-lab-cp05a2-v1.db`, with no path parameter.
Entry, post-loader, post-open, schema and repository operations require exact DEV,
explicit current synthetic authorization, the fixed fixture Account, approved
synthetic Trip namespace (14 accepted TTR cases plus combined case99) and existing
Account generation. Unknown/real Account/Trip scopes reject before opening.
These are fixture bounds, not proof of Core actor admission.

A single module lease rejects concurrent live/opening factories for this file;
one owned connection is injected into the unchanged accepted repository. It uses
existing serializeDatabaseTransactions and the original Account apply gate.
Read/Confirm/reconcileExpiry/cleanupExpired are exposed only as explicit guarded
operations, with no automatic maintenance or render-driven sweep.

Initializer copies the exact nine-field test schema/PK/CHECK constraints from
accepted CP04B2A. Existing sqlite_master objects, original SQL text and nine-column
PRAGMA shape must match. Only statement-edge whitespace/terminator are normalized;
quoted constraint text remains exact. Extra columns/tables/triggers or weakened/
altered constraints fail closed without drop/repair/upgrade. Empty isolated files
initialize atomically in one transaction. This is not a migration system or a
production migration allocation/registration.

Close fences new leases, awaits all admitted operations (including failed writes),
then closes the owned connection. It is idempotent; explicit retry of close failure
is allowed, with the singleton fenced until close succeeds. Cold file reopen reads
exact durable selection. An initialization-cleanup close failure remains fail-closed
until process restart; there is no hidden reopen over an unknown live handle.
Pending writes surviving process termination/Metro refresh are NOT TESTED or promised.

## 6. G2 bridge compatibility and ownership

**ACCEPTED CONTRACT / BLOCKED ON G2:** all host/composition behavior is injected.
The package has no ordinary application/DayFeed/Lab registration caller.

| Required G2-TTR-02 input/callback        | TTR usage / constraint                                                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Exact onOpenTtr intent + key/fingerprint | Forward to adapter; Promise resolves with truthful view/error state, not unhandled rejection                                  |
| Current context + visitKey               | Actual synthetic generation; new visit identity on context revisits; stable repository                                        |
| authorization key/version/actionable     | Current composed visibility/overlay availability, versioned invalidation; never inferred from qualified relation alone        |
| Current TtrInteractionSource resolver    | Authoritative synthetic input, access/publication versions, matching projection/key/traveller; no Canonical repository lookup |
| publish(projection, key): boolean        | Synchronously validate current host lease and accept immutable replacement; only literal true acknowledges publication        |
| dismissHost(): void                      | Close only the current TTR host, without Focus/NOW/date/scroll mutation                                                       |
| Localized TtrLabSheetCopy                | Catalog keys approved/populated by G2/UX, recomputed with locale changes                                                      |

G2 owns actionability checks for queued old taps and Flexible anchor nesting, active
session invalidation, existing DEV Modal body integration and immutable transitions
props on the same mounted DayFeed. TTR never calls composeDayStream, reads Day rows
or resets shared Experience state. G2's callback payload needs no change. The
authorization/callback data above are an injected TTR dependency contract for the
future bridge, not an assertion that those exact G2 exports already exist.
No genuine Controller/repository incompatibility appeared; G2 host implementation
and copy approval remain dependencies, not bypasses.

## 7. Localization, theme and accessibility

Existing ttr.mode.* and ttr.straightLineDistance + canonical formatting are reused.
New copy is **injected**, with no fallback English/product literals in source and
no shared src/ui/catalogs.ts edit. The following exact keys/translations are proposed
for G2/UX to install centrally; this checkpoint does not claim catalog integration.

| Proposed key             | English                                                                    | Simplified Chinese                                 |
| ------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------- |
| ttr.lab.title            | Travel mode                                                                | 交通方式                                           |
| ttr.lab.confirm          | Confirm                                                                    | 确认                                               |
| ttr.lab.checkSaved       | Check saved choice                                                         | 检查已保存的选择                                   |
| ttr.lab.externalMaps     | Open in Maps                                                               | 在地图中打开                                       |
| ttr.lab.noMode           | No mode selected                                                           | 尚未选择交通方式                                   |
| ttr.lab.opening          | Opening…                                                                   | 正在打开…                                          |
| ttr.lab.saving           | Saving choice…                                                             | 正在保存选择…                                      |
| ttr.lab.checking         | Checking saved choice…                                                     | 正在检查已保存的选择…                              |
| ttr.lab.unavailable      | This transition is unavailable.                                            | 此路段暂不可用。                                   |
| ttr.lab.failure          | Could not complete this action. Check the saved choice.                    | 未能完成此操作。请检查已保存的选择。               |
| ttr.lab.uncertain        | Save outcome is uncertain. Check the saved choice before confirming again. | 保存结果尚不确定。再次确认前，请检查已保存的选择。 |
| ttr.lab.published        | Saved locally.                                                             | 已保存到本地。                                     |
| ttr.lab.savedUnpublished | Saved locally; this view was not updated.                                  | 已保存到本地，当前视图未更新。                     |
| ttr.lab.endpoints        | {from} → {to}                                                              | {from} → {to}                                      |
| ttr.lab.confirmed        | Confirmed: {mode}                                                          | 已确认：{mode}                                     |
| ttr.lab.preview          | Preview: {mode}                                                            | 预览：{mode}                                       |

Host binds whole-message parameter functions through t(key, params), and strings
through t(key), after catalog approval. It must rerender injected copy on locale
changes without replacing context/repository or mutating relation facts. Tests use
these proposals only as test fixtures, alongside real existing en/zh mode keys.
SheetHeader provides canonical Close/large-text behavior; UiButton supplies 44pt
native targets/role/disabled state. Busy and polite status announcements are supplied.
Full viewport colors use semantic tokens. Automated Light/Dark/fontScale3/label/
state checks PASS; actual visual contrast, VoiceOver focus and device Dynamic Type
remain NOT TESTED. External Maps callback must itself revalidate current host lease;
only the affordance is supplied here, no OS dispatch.

## 8. Durable sequencing and local races

Open validates current host scope/eligibility, loads selection through CP05A1,
then exposes the draft. Preview affects only reducer state. Confirm/re-read share
one pending Promise for duplicate actions; draft actions are fenced while pending.
An explicit Confirm awaits durable repository acknowledgment before publication.

Publication deep-clones/freezes the owning projection and checks host key/eligibility.
The synchronous G2 acceptance callback receives only the current candidate after
durable success. PUBLISHED, SAVED_UNPUBLISHED and UNCERTAIN remain distinct, including
safe-read publication rejected by G2. Preview never becomes Day Feed confirmation.
A row may persist after Dismiss/disposal, but old binding/sequence cannot publish
or dismiss a newly opened host. Temporary invalidation never deletes stored mode.

Repository rejection is conservatively UNCERTAIN, following unchanged CP05A1;
it is not automatically proof of SQL rollback. Explicit Recover observes durable
selection and may publish only a matching current choice. Failed Recover retains
uncertainty. No blind retry or background recovery. Controller-owned fixture route
states do not gate Confirm, and display permission denies Provider metrics.

## 9. Test matrix and validation

**60 new checks:** Sheet17, adapter27, factory16. **247 retained regressions:**
CP05A1 controller57, CP04B2A repository41, domain71, Lab/G2 intent78.
**Nine files / 307 focused tests PASS.** Final Sheet/factory changes were also
verified by their focused reruns. No full suite was required.

| Area                         | Evidence                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sheet — VERIFIED SYNTHETIC   | No/confirmed/draft mode; Preview/Close; pending/read/uncertain/error/success distinctions; duplicate/unsafe disabled actions; stale/Past facts; optional Maps; both copy sets, palettes and accessibility/large-text props; Release inert                                                                                                                                                   |
| Adapter — VERIFIED SYNTHETIC | Exact intent and strict repository context; durable-only immutable publication/no fixture mutation; rapid Preview/double Confirm; pending Dismiss/new Open; scope/date/Trip/generation/traveller/access/input/actionability/visit changes; A→B→A; unmount/explicit dispose; old completion; uncertain read/failed read; rejected publication; duplicate Recover; caught Open; Release inert |
| Factory — VERIFIED SQLITE    | Actual disposable files through injected driver; DEV/context/post-loader guards; fixed filename/new connection; exact schema; quoted constraint/column/table/trigger mismatches preserve rows; close/reopen; drain/reject leases; explicit close retry/concurrent opener refusal; authorization loss/no startup or application/Provider/Sync path                                           |

React adapter tests use the same controlled injected-hook strategy as G2 render
tests; they exercise effect cleanup and pending callbacks, not an actual native
React renderer or concurrent runtime. Sheet tests use real React DOM server rendering
with native primitives mocked. Factory tests use actual Node SQLite files, not Expo.

Focused TypeScript, all adopted/new source ESLint, UI guard, strict Sheet import-tree
check and formatting/whitespace PASS. UI guard retains473 legacy occurrences/90
representative files. The unwired Sheet and its two canonical UI children also
pass explicit representativeFiles(root, [Sheet]) strict scanning, no baseline
forgiveness or shared guard registry edits. Future G2 import will join its existing
host root naturally. No new dependency or test framework was installed.

```sh
node node_modules/vitest/vitest.mjs run src/features/ttr/TtrLabSheetContent.test.ts src/features/ttr/useTtrLabInteraction.test.ts src/data/repositories/ttrLabSelectionRepository.test.ts src/data/repositories/ttrInteractionController.test.ts src/data/repositories/ttrSelectionRepository.test.ts src/domain/trip/ttr.test.ts src/features/ttr/labFixtures.test.ts src/features/day-feed/composition.test.ts src/features/day-feed/render.test.ts
node node_modules/typescript/bin/tsc --noEmit -p scripts/ttr/tsconfig.json
npm run ui:guard
```

## 10. Exact baseline failure

Architecture guard on the task and plain archive of exact54ecb4b both have
**3 PASS / 1 pre-existing FAIL**. Normalized complete failure messages match:
unchanged src/components/LocalOperationsDiagnostics.test.ts imports a sync mock.
No guard/source exemption, migration or unrelated fix. New feature source/test files also pass each original forbidden-import pattern
individually, so the existing fail-first error cannot mask new TTR violations.
No global architecture PASS claim; unrelated navigation/full-suite failures were not rerun here.

## 11. Remaining G2-TTR-02 dependencies

**BLOCKED ON G2 for combined host integration:** authoritative current actionability/
overlay lease and invalidation, existing Modal whole-content slot, catalog approval,
atomic current projection ref/version replacement, and safe host-close handling.
The feature package can be independently tested now. Accepted FLEX-02 is in the
baseline; its future interaction with this new Sheet still needs combined regression.
No shared-file ownership conflict was introduced and no competing API was created.

The separate Lab DB handle must remain stable while injected; host lifecycle owns
explicit close after draining, not ordinary render or Sheet Preview. Factory can
close after Controller disposal and independently drain admitted writes. Fixed
synthetic clocks and current actual Account generation must be supplied consistently.

## 12. Core / Apple / native gates

**BLOCKED ON CORE:** accepted contract direction and parallel ORDER-02 do not
constitute accepted real actor/occurrence/Person-branch/continuity/access authority
for TTR runtime. Resolver/checker remain explicitly synthetic.

**NOT TESTED:** Expo/native DB file lifecycle, Metro refresh/handle caching, actual
process termination/IPC acknowledgment uncertainty, real offline auth/Core, native
Sheet rendering/VoiceOver/scroll/Focus retention, Release binary or physical device.
Only installed API/type compatibility and injected SQL mechanics are verified.
Apple licensing, MapKit/ETA/route-distance/cache, Provider/OSRM, Supabase/sync,
Canonical writes, production persistence/migrations/startup and paid services remain
closed. No native build, Simulator/device or real Provider execution occurred.

## 13. Exact changed-file manifest

Thirteen paths: two incremental tracked edits, four exact adopted files, six new
feature/source/test files and one report. No shared UI/G2/Core/app/native/dependency
file changes. Handoff is an additive isolated prefix; its baseline suffix remains
exact. Index is empty; no commit.

```text
docs/CURRENT_IMPLEMENTATION_STATE.md
docs/architecture/OTR_TTR_CP05A2A_FEATURE_PREPARATION_REPORT.md
scripts/ttr/tsconfig.json
src/data/repositories/ttrInteractionController.test.ts
src/data/repositories/ttrLabSelectionRepository.test.ts
src/data/repositories/ttrLabSelectionRepository.ts
src/data/repositories/ttrSelectionRepository.test.ts
src/data/repositories/ttrSelectionRepository.ts
src/features/ttr/TtrLabSheetContent.test.ts
src/features/ttr/TtrLabSheetContent.tsx
src/features/ttr/interactionController.ts
src/features/ttr/useTtrLabInteraction.test.ts
src/features/ttr/useTtrLabInteraction.ts
```

## 14. Combined integration recommendation and stop

Sheet / adapter / isolated SQLite contract: **PASS within synthetic scope**.
Ready for Owner Review and for G2-TTR-02's injected bridge preparation; not native
or production readiness. No material accepted-controller/repository change was needed.

After separate acceptance/authorization, G2 alone integrates current eligibility,
whole Sheet body and copy into its existing DEV host, passes a stable synthetic
repository/context/clock, and replaces only transitions props on the mounted Feed.
Run narrow combined FLEX/TTR stale-tap/session/nesting/Focus/NOW/nonzero-scroll tests.
Only after explicit native-run/container authorization verify Expo file durability
and cold relaunch in a fresh anonymous Simulator. Keep real Core and Apple/production
gates separate. Do not implement CP05A2-B from this report.

**STOP FOR OWNER REVIEW. No commit/merge/cherry-pick/push/deploy or native wiring.**

Final preservation comparison:88 other available worktrees; canonical/main,
historical TTR and all others matched recorded HEAD/status/dirty-file hashes except
four concurrent owners' changes, left untouched:

- Core ORDER-02: `dbeea4b19107ae12b22971d358c75d8de932091a` →
  `a027f2ad0703d853afc6fa490a8b5734bbd2e454`, status changed.
- Flexible CP01B coordinated: HEAD `d190d89a38c29037f08a8816c7cccb21ce98e156`
  retained, status changed.
- Flight Upload Source02: `9e80142a7e5797c68dd36da659c058517cda3d5f` →
  `065bdd96d334cfa4818178cb715dfd7ff14b5289`.
- Flight PDF Provider01: `54ecb4bad6b91827d3abb42f355fc1e0d1fc7016` →
  `8d6eedda4e69db1176dc13570a10ddc940ce9c00`, status changed.

Own baseline/main remain54ecb4b and tracking origin/main remainsb4ddd27.
Exact thirteen-file scope, four adopted blobs, unchanged handoff suffix, empty
index, formatting/whitespace and credential-pattern scans verified. No generated
native/dependency/database/log file belongs to the deliverable. Parallel work may
continue after the snapshot; none was restored or overwritten by this task.
