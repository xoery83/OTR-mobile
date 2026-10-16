# DAY-PERF-01 — isolated component candidate

Base: `90cbc54` (R2 retained). Status: IMPLEMENTED component / NOT WIRED / NOT RENDERED / NOT NATIVE VERIFIED.

No product, database, admission, time, projection or P1–P6 renderer rules changed. No Simulator, Metro, account or DEV operation performed.

## Owner / interfaces

Coordinator exclusively writes DayFeed, LocalManualDayFeed integration, TripScreen and TripViewContext. Experience owns independent shell/calendar components. This candidate writes only `dayFeedWindow.ts`, `WindowedDayList.tsx`, their tests and this receipt.

- `DayWindowRow<T> = {key, date, value}`: one descriptor per Day Header, owning composed entry, empty-day message, local committed occurrence and trailing marker. Root must preserve existing occurrence/row keys, prefixing date where the old key is not occurrence-specific; never use index or Source/Input aliases.
- `WindowedDayList<T>` accepts descriptors and `renderRow` (existing owning renderer callback), `scopeKey` (account + Trip + account generation), optional `initialAnchor`, existing content style/header and shell insets.
- `DayListHandle.jumpToDayHeader(date)` returns false for an absent date. Every in-range date needs a header descriptor even when empty. No previous-day renderer mounting is required to resolve the target index.
- `saveAnchor()` / `restoreAnchor(anchor)` use `{key,date,within}`. If an item disappears, fall back to its same-date header, not another Item.
- `onViewportChange({firstVisibleDate,lastVisibleDate,scrollOffset})` consumes actual Native viewability + scroll offset; it does not derive Today/NOW.
- `onMountedRowsChange(count)` measures live Native cell wrappers for the integration receipt. Window: 8 initial cells, batch of 8, 5 viewport lengths. **8 is not a maximum mounted count.** Existing first cells may remain retained by FlatList.
- `onJumpResult(REACHED|UNMEASURED,date)` reports visible target or a finite failed measurement attempt; no endless jump loop. Unmeasured scroll first uses FlatList's reported average length, then at most 3 `scrollToIndex` attempts. No fake exact `getItemLayout` for variable-height content.
- `summarizeDay(query, localRows)` consumes the same already-authorized `timed/nonComparable` owning day projection and local committed row identities. Output matches Experience: `{date,markers:('Plans'|'Stay'|'Transport')[],itemCount,placeTransitionLabel?}`. No unresolved dates, timezone conversion, network or full item-detail fetch. Location label stays absent unless an existing trusted stage source independently supplies it.

## Minimal Root integration patch map

1. Keep current `queryForDate`, `composeDayStream`, contributed renderers, Focus/Immersive/TTR eligibility and source/account fences unchanged. Keep one native vertical list.
2. Replace only the accepted ScrollView and local-only ScrollView with `WindowedDayList`. Flatten each section into header/entry/empty/local occurrence/footer descriptors, storing data or closures, **not pre-rendered React elements**. `renderRow` invokes existing `renderItem`, BlockSlot and marker components when FlatList mounts the row.
3. The current `LocalManualDayRows` maps the whole day. Extract/reuse its exact single-row body (or add an exact row-key filter) so a long day is not one heavy row. Likewise do not hide an entire ordinary Day in one descriptor. Flexible containers retain their owning grouping semantics; internal group virtualization is not authorized here.
4. Build Calendar summaries from `queryForDate(day)` plus `localManual.rows(day)`; do not call full detail readers in Calendar. Existing repository still loads its accepted projection once; this candidate does **not** claim SQL cursor paging or reduced initial snapshot size.
5. Calendar selection calls `jumpToDayHeader`. Connect `onViewportChange` to Experience shell. Pass measured shell top/bottom insets, preserving page spacing in existing content style.
6. Store optional stable anchor in existing scoped DayReading/bookmark, alongside legacy offset. Save before tab/Focus/Immersive transition and restore after return. Scope/Account change resets list; sync or timezone context revision must not reset account/Trip scope. Existing explicit Today/entry semantics still choose the target date.
7. Memoize descriptor arrays against actual stream/Focus/data changes. Do not recreate them on every parent scroll callback. Keep pending Item detail navigation delegated to its existing legitimate owner.

## Executed local evidence

`npx vitest run src/features/day-feed/dayFeedWindow.test.ts src/features/day-feed/WindowedDayList.test.ts src/features/day-feed/DayFeed.navigation.test.ts`

29 tests PASS (15 new + 14 unchanged navigation). Local command duration ~185 ms; this is **test-runner duration, not Native performance**.

| Case                      | Executed evidence                                                                                                                     | Native gap                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 3-day short fixture       | direct date/header index, empty dates                                                                                                 | scroll continuity / actual mounts                         |
| 30-day fixture            | exact date keys, mixed variable-height anchor, inserted/deleted rows                                                                  | real Native remeasurement / sync jitter                   |
| 90-day fixture            | direct day 75 index; mocked FlatList invokes 8 initial render callbacks; finite unmeasured failure and visible-target acknowledgement | Native jump/viewport mount maximum                        |
| Mixed/empty fixtures      | local-only summaries; no network; missing anchor honest fallback                                                                      | actual offline App route + Focus/Tab return               |
| Real Japan Reference Trip | **not accessed**; fixture never substitutes it                                                                                        | Coordinator must read normal repository in integrated App |

Typecheck, scoped ESLint, UI guard and diff whitespace checks PASS. Component test mocks RN FlatList and is not a Native virtualization benchmark. No real Reference data was copied or changed.

## Integration gate / known limit

Candidate can be integrated by the single Screen Root writer. DAY-PERF PASS requires integrated Native measurements and direct-date/variable-height/offline/return tests, plus the real Japan reader. Keep Day Feed overall PARTIAL while Lab renderer/port recovery remains unresolved.

## Independent Review correction

Deleted-row restoration now normalizes pending key/date/offset to the actual same-date Header in both scroll attempts and viewability completion. A disappearing target date reports UNMEASURED and never chooses a different date. Directed component regressions cover deletion before restore, immutable sync snapshot deletion while pending, cleared retries after REACHED and removal of the entire target date. Independent re-review remains required for the fixed commit.
