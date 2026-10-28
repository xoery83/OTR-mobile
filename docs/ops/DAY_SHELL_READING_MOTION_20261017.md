# Day Shell reading motion — bounded candidate

Baseline: `5a569ed3c34a3bf5ecd6398c4bfe62dc650bae10`.
Worktree: `/private/tmp/otr-day-shell-v1-integration-20261017`.
Status: code reviewed; Native revalidation pending resource handback.

## Change

The old persistent `dayUserDriven` flag classified every later raw offset as
reading, including MVCP/prepend compensation. The owning native list now emits
single-finger window-coordinate deltas only during a current native drag, guarded
by pointer identity and list epoch. Cancellation, release and scope replacement
cannot carry reading into another drag. Both accepted and local manual feeds
forward the same signal. Raw offsets still drive anchors, dates and introduction
visibility; only origin zero with offset at most 4 restores the whole-feed top.

The existing forward 32pt / reverse 8pt hysteresis accepts incremental deltas,
including 1pt events. Capture, SafeArea, bounded list window, Calendar, renderer,
Core, account and data paths are unchanged. No new dependency or parallel Shell.

## Validation

- Six targeted suites: 103 tests passed, including actual-motion versus offset
  compensation, cancelled/stale gestures, both feed callers, whole-feed versus
  local-window top, small-delta hysteresis and existing virtual-window behavior.
- Typecheck, scoped ESLint, UI guard and diff/format checks recorded with candidate.
- Independent read-only review: no confirmed P1/P2. Native event order remains
  explicitly unverified; mock callback ordering is not Native proof.

## Requested Native window

AD5/8083 remain Coordinator-owned until explicit handback. Reuse the existing
account and native host; no login/data rebuild, Source simulator or other Metro.
Use one stable middle-Day position with reading space: forward gesture must
produce `READING_MOTION` and hide Navigation after 32pt while retaining Capture;
slight reverse must restore after 8pt while still away from the whole-feed top.
Confirm pure MVCP/prepend compensation alone does not emit reading motion or hide
Navigation. Check normal bottom access and no anchor jump. No long-jump or full
visual/performance matrix. Do not merge before this bounded check is evaluated.

Shared current-state documentation remains Coordinator-owned; integrate this
receipt there when closing the packet. Create/Edit/Preparation remains unopened.
