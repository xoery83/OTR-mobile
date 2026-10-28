# Day Feed Shell V1 — Experience handoff

Base90cbc54f8ed3f701884e056ccb9f0dd269e31262. Branch codex/day-shell-v1;
worktree /private/tmp/otr-day-shell-v1-visual-20261017. This preserves the specified
R2/TIME01A/Editor source; older R2 worktree remains191a557 and is not the base.

## Implemented, not wired or Native verified

- DayFeedShell.tsx: compact list introduction with no Hero, native-center calendar
  title content and event-driven Shell state. Root retains native controls,
  translucency, safe insets, navigation, Capture and Focus/anchor ownership.
- dayFeedShellState.ts: forward32pt hides Navigation Island; stop stays hidden;
  reverse8pt restores; top4pt restores. These are presentation hysteresis constants,
  not benchmark targets. Programmatic movement is not classified as reading.
- Actual visible dates settle120ms; a timer also commits when scrolling stops.
  No per-pixel React state update. Account/Trip/generation key isolates context;
  same key preserves Focus/Immersive return state. No provider or global store.
- DayFeedCalendarSheet.tsx: existing native pageSheet + SheetHeader, chronological
  conventional Mon–Sun grids, known inclusive bounds, empty-day selection, muted
  disabled off-range dates, exact supplied place-transition labels and at most
  three deduplicated semantic markers. Unknown bounds show translated fallback.
  One tap closes/selects; no Go To/confirmation button. Native swipe dismissal.
- Calendar reads only lightweight passed summaries. It renders month/date cells,
  never full Item/renderer details or per-date repository requests. Ninety days
  create three lightweight months, not ninety mounted formal Day sections. Calendar
  months currently use a vertical ScrollView; heavy feed virtualization belongs
  solely to Performance's WindowedDayList. Longer-than90-day sheet cost is not
  benchmarked. Selected-month layout positioning and large-text horizontal grid
  fallback still need integrated Native evidence.
- Calendar cell targets remain >=44pt even on narrow screens/large font; native
  font scaling remains on. No fixed card/text heights or forced font shrink.

## Root-only minimal integration patch

Do not overwrite Root's DayFeed/TripScreen/BottomShell files with a baseline copy.
Apply these additive adapters to the final Performance integration tree. All
identities, summaries and jump qualification remain with the owning Root/reader.

```tsx
// TripScreen: scopeKey is the same account/Trip/generation key used by Perf.
const shell = useDayFeedShellState(scopeKey);
const [calendarOpen, setCalendarOpen] = useState(false);
const readingGesture = useRef(false);
const dayList = useRef<DayListHandle>(null);

// Existing native header; retain established Menu/Back/Search semantics.
// headerTransparent:true; headerBlurEffect:"systemMaterial" with adaptive
// floatingSurface scrim. No new RN topbar or permanent opaque Day header.
// headerTitle is DayFeedShellTitle:
//   label = offset<=4 || !shell.visibleDates ? tripName
//     : formatDayFeedVisibleDates(shell.visibleDates)
//   openCalendarLabel = t("dayShell.calendar.open")
//   onOpenCalendar = () => setCalendarOpen(true)

// Existing DayFeed -> WindowedDayList props, forwarded once:
header={<DayFeedIntroduction tripName={tripName} rangeLabel={rangeLabel}
  locationSummary={trustedLocationSummary} />}
onInteraction={() => { readingGesture.current = true; }}
onViewportChange={({firstVisibleDate, lastVisibleDate, scrollOffset}) => {
  shell.observeScroll(scrollOffset, readingGesture.current);
  shell.observeVisibleDates({first:firstVisibleDate, last:lastVisibleDate});
}}
// Existing topInset = measured native header / safe area exactly once.
// Existing bottomInset stays measured full Shell including safe area even
// while Navigation Island is hidden; do not reflow the list or resize inset.

<DayFeedCalendarSheet visible={calendarOpen}
  onClose={() => setCalendarOpen(false)} tripName={tripName}
  rangeLabel={rangeLabel} tripStart={tripStart} tripEnd={tripEnd}
  selectedDate={selectedDate} summaries={authorizedDaySummaries}
  copy={{unknownBounds:t("dayShell.calendar.unknownBounds"), markers:{
    Plans:t("dayShell.calendar.plans"), Stay:t("dayShell.calendar.stay"),
    Transport:t("dayShell.calendar.transport")}}}
  onSelect={(date) => {
    // Root revalidates current account/Trip/generation and bounds at this tap.
    readingGesture.current = false;
    // Delegate to one owning Perf anchor pipeline; no scroll offset estimate.
    if (dayList.current?.jumpToDayHeader(date)) {
      shell.observeVisibleDates({first:date,last:date}, true);
    }
    // Retain Perf onJumpResult/UNMEASURED handling, no fake reached assertion.
  }} />
```

- Performance props are summary{date,placeTransitionLabel?,markers:
  ('Plans'|'Stay'|'Transport')[]}, tripStart/end/selectedDate;
  viewport{firstVisibleDate,lastVisibleDate,scrollOffset};
  DayListHandle.jumpToDayHeader/saveAnchor/restoreAnchor. No second Calendar index.
- Root forwards only real visible sections (never guessed dates from row times).
  Empty authorized Day Header rows must exist in Perf data for direct selection.
- Before calendar jump/tab restoration/Focus anchor restoration mark
  readingGesture=false. Actual subsequent drag/interaction marks true. Keep
  existing saveAnchor/restoreAnchor identities and qualification; UI does not
  reconstruct Focus, NOW, TTR or a Renderer.
- Root maps shell.navigationVisible only to Navigation Island visibility and
  hit testing (pointerEvents none/hidden a11y when hidden). Animate existing
  opacity/transform without changing layout or Capture+. Do not hide all Shell.
- On account/Trip/generation changes use a new scope key and close the sheet;
  fence stale native callbacks with Root's existing identity guard. Focus return
  must retain the same key and restore the owning saved anchor.
- Root merges DAY_SHELL_V1_COPY_20261017.json into its catalogs once. It contains
  only proposed EN/ZH namespace entries; feature code takes translated props.
- Root updates CURRENT_IMPLEMENTATION_STATE with IMPLEMENTED/WIRED/RENDERED/
  NATIVE VERIFIED separately after assembly. This independent package has no
  production caller and cannot establish Runtime PASS.

## Checks and remaining gates

Targeted deterministic tests cover sustained/reverse/stopped scroll, programmatic
jumps, date-boundary hysteresis and timer/context cleanup, one-tap empty dates,
off-range guard, leap/year/month boundaries, unknown dates, summary marker/place
boundaries, ninety legal dates, minimum targets and selected-month positioning.
Validation: 11 tests across three targeted files PASS. Typecheck, strict UI guard
(473 legacy occurrences / 117 representative files), scoped ESLint and formatting
PASS. Independent read-only Review: scoped PASS, no blocking findings. Review
covered calendar bounds, marker deduplication, accessibility, scroll/date hysteresis
and context timer cleanup; it did not establish Native or Runtime acceptance. No new dependency, Auth, Repository write,
Core/Admission/model, P1–P6 renderer, TTR/NOW or App Root change.

Root must integrate Perf + these components before Native: initial/forward/
reverse shell, date sheet/direct empty-day jump,30/90-day/mixed-height loading,
visible date title, Focus/Immersive/Tab anchor returns, last row safe inset,
My Trips root and established Ledger/Capture navigation regression. No AD5
installation, Metro edit/start, other device operation or main merge/push was
performed for this independent coding package. Await one unified install SHA.
