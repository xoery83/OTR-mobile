# Day Calendar far-jump geometry candidate — 2026-10-17

Status: LOCAL REGRESSION PASS / INTEGRATED NATIVE NOT VERIFIED.

## Evidence and diagnosis

- Original Native evidence is retained at `/private/tmp/otr-day-shell-native-evidence-20261017/metro-d8.log` and the associated receipt/screenshots. Target row99 (Japan 2027-02-12) was not visible despite repeated offset8185.667 commands; viewability returned indices74–83, then UNMEASURED. Do not relabel that attempt PASS.
- Installed React Native is0.86.3. `@react-native/virtualized-lists/Lists/VirtualizedList.js` scrollToIndex refuses an unmeasured tail (lines180–194); spacer offsets use estimated cell metrics (lines1000–1045). Its maintainVisibleContentPosition adds native anchoring separately. Previous owning code persisted absolute onLayout.y across Cell unmount and interpreted that cache as current Native geometry.
- The exact allocation of observed drift between estimated spacers and native position preservation is not proven by the old trace: it did not record current target/viewport physical coordinates. This candidate records those facts for the next bounded Native acceptance.

## Small change

`WindowedDayList` now aligns only a currently mounted native target View against the current native ScrollView viewport using measureInWindow. Offset = current scroll offset + target-window-y − viewport-window-y + within-row − topInset, bounded by the known actual content bottom. No cached absolute y fallback remains. Detached or replaced nodes, superseded requests and changed offsets reject late measurement callbacks. A previously saved within-row offset is clamped if Focus content shrinks.

A jump temporarily disables automatic maintainVisibleContentPosition compensation; ordinary reading retains it. There is still at most one target-window remount, the existing5second deadline and no increase to the existing8 command bound. Identical desired offsets are not resent. Missing native target/measurement returns UNMEASURED. REACHED requires actual target viewability and two actual native geometry checks, after which the measured anchor is published to the existing caller for Focus/cold restoration.

No caller API, Renderer, repository, Calendar semantics, date/time logic, DB, account, Simulator, provider or configuration change. Existing d8 header-index and CALENDAR transport summary fixes are retained in the owning helper.

## Verification

The scoped tests use mocked Native measurement callbacks and explicitly do not prove Native virtualization. They cover the old onLayout8301.667/current physical target10100 mismatch, native geometry changing without a fresh onLayout, exact viewability, one remount/deadline, detached/replaced node epochs, late cancellation and changed offset, empty final date/bottom clamp, deleted Item/date, Focus revision and cold-anchor restore, live reading anchors and bounded non-sensitive DEV diagnostics.

TypeScript, scoped ESLint and UI guard run with the candidate. Independent Review and one integrated AD5 test are required next. Coordinator owns ScreenRoot and Native scheduling. Native evidence must include TARGET_MOUNT/UNMOUNT epoch, NATIVE_GEOMETRY numeric target/viewport/offset, actual VISIBLE indices, FINISH, and screenshot. Test Japan2027-02-12, empty date, Focus return and cold restore; no new fixtures or Canonical mutations. Do not increase retry counts if that acceptance fails.
