# P1 insertion defaults — Owner revision, 25 October 2026

Editable form defaults only; never a duration, free-capacity claim, timezone proof or Core instant. This revision supersedes the earlier symmetric gap/10-minute recommendation.

- BEFORE: if the preceding start is within 70 minutes, or its end is within 70 minutes of the reference start, use the midpoint of previous end (fallback previous start) and reference start. Otherwise suggest reference start minus 60 minutes.
- AFTER: use actual end, or start plus 30 minutes as an advisory calculation only. No next timed boundary, or a gap greater than 70 minutes: suggest effective end plus 20 minutes. Gap at most 70 minutes: use its midpoint. If only the estimated end crosses the next start, use the actual start-to-start bracket; never declare an invented duration an actual overlap.
- Midpoints prefer the nearest five-minute tick strictly inside the bracket; if none fits, retain a whole-minute midpoint. A one-minute bracket can retain its lower minute.
- Actual overlap, conflicting/one-sided known zones in a two-clock bracket, cross-day endpoints or an out-of-day offset leave the time blank. Adjacent untimed rows are not skipped to invent an available gap.
- The two directions intentionally differ in a wide gap: previous end12:00 / next start15:00 → below12:20 / above14:00. Exactly70minutes uses midpoint.
- Keep the selected date, pass initialStartTime through the existing chooser to the existing P1 Create editor, and never overwrite an Edit draft. No inferred end is persisted.
- DST remains owning Temporal qualification: this helper does not resolve civil clocks into instants or approve gaps/folds.

Helper unit cases cover cutoff, direction, point fallback, tiny gap, midnight, overlap, zones, cross-day and input immutability. The existing form-prefill test remains in force. Production insertion callback now connects the current Core P1 renderer to the normal chooser and Repository form; only existing eligible qualified START rows expose shortcuts. Pending/Floating rows retain their current restrictions. Dedicated Forms QA has real local P1 but no qualified accepted P1, so this production shortcut does not yet have a real Native acceptance receipt.
