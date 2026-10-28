# P1 iOS move interaction — redesign candidate, 25 October 2026

Status: Owner-requested design proposal; subsequently Owner approved the no-ruler variant. The implementation candidate and exact outstanding device gates are recorded in P1_MOVE_EFFECT_V1.md. The remainder below retains the original design discussion and must not be read as a later Native PASS. The host-touch release repair is implemented separately. The unified time cursor, continuous cross-date feed following, new precision bands and haptics below are NOT implemented or Native accepted. This proposal replaces the older DS25–28 experiment's independent rail-time/feed-edge control only after implementation and acceptance; existing authority, duration and qualification constraints remain.

## Recommendation

Use a long-press pickup followed by a single-finger, distance-controlled time scrub. One temporary placement cursor drives the ruler, insertion marker, date badge, floating item and feed following. Horizontal position changes precision. Vertical displacement from the initial pickup finger position changes direction and speed. Release freezes the target and presents the existing explicit Confirm/Cancel preview; unchanged release closes directly. This is an OTR interaction recommendation, not an Apple-provided time-picker behavior.

A calendar/date picker is the exact-entry alternative, and the supported alternative for people who cannot maintain a drag. Conventional row reordering alone cannot select a missing time in a gap. A proportional day-calendar grid could do that, but replacing the feed with one would materially change the approved Day Feed experience and is unnecessary here.

Apple guidance supports clear pickup/destination/drop feedback, scrolling the destination when needed, alternative ways to complete a drag, and undo/reversal. It does not prescribe the custom speed curve or four precision bands proposed here. Sources: https://developer.apple.com/design/human-interface-guidelines/drag-and-drop ; https://developer.apple.com/design/human-interface-guidelines/playing-haptics ; https://reactnative.dev/docs/panresponder .

## Touch lifetime and feedback

- Idle: normal vertical swipes scroll the feed. Holding an eligible P1 START for approximately450ms arms pickup. END projections do not become separate movable Items.
- Pickup: original placement remains unchanged; a compact floating representation appears offset from the finger and the current placement is highlighted. Show the active precision and one short localized left-fine/right-coarse hint. A soft pickup haptic is desirable on physical iPhone; simulator cannot validate its feel.
- The stable screen-level gesture owner retains touch tracking even when the original virtualized row leaves the viewport. Do not mount a new interactive overlay and expect it to acquire the already-running touch.
- One finger controls the operation; a second finger or system interruption cancels. Touch release stops every timer/animation immediately, before showing confirmation. Backgrounding, route departure and account-generation invalidation cancel. A late callback from an old gesture must not alter a new gesture.
- Source pickup placeholder and current target are separate visual states. The floating card follows the hand; the ruler/target line stay anchored in a safe visible region. The finger's neutral origin remains the actual pickup coordinate, independent of visual clamping.

## Vertical control

Let dy be the current finger Y minus pickup Y. A provisional neutral zone is ±10pt. Inside it, time holds still. Above it goes earlier; below goes later. Holding still outside it continues scrubbing; greater distance means faster progression.

A provisional curve is u=clamp((abs(dy)-10)/140,0,1), ticksPerSecond=sign(dy)×(rMin+(rMax-rMin)×u^1.6). Outside the dead zone a deliberate tick starts after a short onset; integrate elapsed active time, cap a delayed frame, and clear fractional progress on neutral entry, reversal or precision change. This prevents background/catch-up jumps and stale directional delay.

The rates are calibration candidates, not acceptance thresholds:

| Horizontal band (left to right) | Tick | Provisional ticks/s |
| --- | --- | --- |
| Fine | 10min | 1.2–3.0 |
| Medium | 30min | 0.9–2.2 |
| Coarse | 60min | 0.6–1.6 |
| Far-right fast traversal | 120min | 0.5–1.2 |

Use screen-relative bands within the safe content width, initially about25% each. Display the active interval; apply ~12pt hysteresis at band boundaries so finger tremor cannot oscillate precision. The far-right band intentionally accelerates across days. Rates differ by band so coarse mode cannot inadvertently race at seven hours per second.

Changing X alone NEVER changes placement, including an off-grid time such as16:15. Only the next deliberate vertical tick moves to the adjacent aligned mark: a60min forward tick from16:15 reaches17:00, backward reaches16:00; a10min tick reaches16:20/16:10. Do not round on pickup or on band change. Return left and toward neutral to settle precisely.

## One cursor, two visual followers

The cursor contains an Item identity, authored local date/clock, the Item's existing timezone qualification, and a temporary resolution state. It is not a Core mutation or a new Reader. Derive both the ruler and the feed target from this cursor; never infer the target date back from pixels that the controller itself scrolled.

The feed has variable-height cards and untimed rows, so it is NOT a proportional time ruler. Use the existing displayed sequence to find the legal insertion neighborhood for the candidate date/time, excluding the source Item's pickup occurrence. Show a distinct target line/placeholder with the candidate date and clock in that gap. Several different candidate times may share a physical gap; the label and ruler distinguish them. Do not invent pixel-to-minute proportionality or claim the gap is free capacity.

Keep the target within a comfortable viewport band, roughly35–55% of usable height. While it remains there, do not move the feed. When it exits, follow with bounded easing toward about45%, using measured row geometry and existing list anchoring. Skip repeated scroll commands when the neighborhood is unchanged. Programmatic following cannot feed back into the cursor or shell reading-motion heuristics. At high speeds, coalesce layout/scroll work; do not run overlapping scroll animations or recompose all cards every touch frame.

Across midnight, advance the calendar date and clock continuously: Jan16 23:50 → Jan17 00:00 at10min precision. The date badge/ruler change and the existing Day heading/rows scroll into view together. Empty days still have a target and Day heading. A coarse tick may cross midnight at its chosen interval without a forced extra stop; make date changes conspicuous through the date label and a restrained haptic. Avoid slowing every midnight with mandatory dwell. Reversal crosses back naturally. At a permitted range boundary stop and show the boundary. The current fixture uses its frozen10-day range. A real flow must obtain permitted bounds from the owning existing move/edit contract; do not invent a stricter Trip-date rule or silently extend the Trip.

Remove the old competing rule “left edge changes time, content edge independently changes day.” Vertical displacement is the only time/date engine. Screen edges merely allow holding that same speed; feed following is its output, not another input.

## NTC, duration, DST and conflicts

NTC/date-only placement is an explicit separate destination/mode, not a side effect of the feed scrolling an untimed row under the finger. Freeze the clock scrub while in that mode and make leaving it deliberate. Preserve known duration internally while hiding both clocks, as in the approved experiment. Exact NTC entry ergonomics need their own small device test; do not claim that every row is an NTC target.

Preserve a known elapsed duration for a timed move and recompute the local end through the owning time logic, including cross-day and DST offset changes. Never invent an end or reinterpret duration as wall-clock subtraction. Keep one Item identity and its derived END occurrence. Unknown Item timezone cannot borrow the Trip timezone. Calendar stepping is a display proposal, not adding86400000ms to an instant. A nonexistent/ambiguous civil time remains visibly unqualified, cannot be confirmed as exact without the existing resolution contract, and is not silently skipped or assigned an arbitrary offset. Another location/timezone is a separate edit, not an inferred drag side effect.

Overlapping events remain visible and are reported using existing conflict semantics; dragging never shifts other Items to manufacture a gap. Confirmation uses the existing lawful mutation only when available. Until then, this lane has only in-memory Native preview. Production undo/permission/conflict/sync behavior requires the existing owning interface, not a parallel queue or writer.

## Accessible exact-entry alternative

Provide a discoverable Move action (including VoiceOver custom action) with the same date/time controls as the existing editor, plus Cancel/Confirm. The confirmation preview can refine date/time using those controls without restarting the drag. Do not require dragging, perceive-only haptics or color. Announce settled date/clock and mode changes, not each animation frame. Honor Reduce Motion and Dynamic Type.

## Implementation boundary and acceptance

1. Repair release/cancel at the stable host and test interruption/unchanged release first. Implemented this turn; native stationary release observed. Continuous native drag/release is still pending calibrated touch verification.
2. Implement the new cursor/tick policy as pure UI proposal math with boundary/off-grid/reversal/precision tests. Not yet implemented.
3. Prototype feed-follow through existing measured list positioning. A minimal unique-Writer display port may be needed for row-key alignment with bounded animation; no Reader/authority redesign. Do not concurrently modify shared navigation/list contracts.
4. Verify coarse cross-day traverse → fine return → exact release on Forms QA, including empty day, deep virtualization, initial row recycling, cancellation, app interruption, DST gap/fold, known duration and one-Item END projection.
5. Validate physical-device haptics, VoiceOver, Reduce Motion and large text independently. Simulator/fixture success is not real Reader/mutation/Cloud PASS.
