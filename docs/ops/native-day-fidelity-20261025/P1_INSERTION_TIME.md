# P1 gap insertion start-time default — 25 October 2026

Owner requests the Focus before/after shortcut to carry date and start time through the chooser into P1 Create. This supersedes the older no-neighbor-inference rule only for an editable form default; it creates no duration, free-capacity assertion, timezone proof or Core instant.

- BEFORE uses the immediate previous row and reference row. AFTER uses the reference row and immediate next row. Both entry points to the same gap return the same result.
- With a comparable same-day previous END/DESTINATION and next START/ORIGIN, choose the midpoint. Prefer the nearest 10-minute mark if still inside the gap; otherwise keep a whole-minute midpoint.
- Previous end only: use that end. Next start only: suggest 30 minutes earlier, clamped to midnight; leave blank if that would be at/before the preceding known start.
- Overlap, nonmatching known zones, timed cross-day endpoints or no useful clock: leave time blank. Never skip over an immediately adjacent untimed row to invent a gap.
- Keep the clicked date. Pass `initialStartTime` through the existing chooser into the existing P1 editor. Apply only to new drafts; never overwrite Edit. The default remains editable and passes through normal save validation.
- DST: this helper carries a local clock default only. It does not resolve a local clock into an instant or claim DST gap/fold validity. Existing time/Core authority remains responsible for qualification.

Validation: 34 focused tests across helper, P1 editor and chooser pass. Forms QA native observation: Botanical garden visit ends12:00, next Local art studio visit starts13:00; Add below opens chooser with suggested12:30, then New plan displays Jan16,2027/start12:30/endNotset. Screenshot `/private/tmp/otr-p1-insertion-prefill-20261025.png`. Fixture is still a DEV-only, non-saving preview. Real Reader insertion UI integration and full Move persistence remain pending; this observation is not Core/Cloud PASS.
