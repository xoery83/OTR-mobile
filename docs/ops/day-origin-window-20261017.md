# Day Calendar data-origin candidate — 2026-10-17

LOCAL REPRO PASS; Native acceptance pending. This supersedes the failed unknown-
prefix positioning direction in9103554 / integrated2ae98bb, not its historical evidence.

## New Native evidence

`/private/tmp/otr-day-shell-native-evidence-20261017/live-geometry-2ae/metro.log`
shows global target99 mounted once after a far initial index, then an unknown-head
spacer update removed it. The first geometry calculation also combined a fresh
cell with the old list offset1615. Subsequent Native visibility was0–7, target
absent; result UNMEASURED. More retrying or a larger timeout does not solve that.

## Minimal alternative

- Keep exactly the existing lawful global rows, same keys, renderer and date index.
  A requested global row becomes `data.slice(origin)[0]` in a fresh list epoch.
  Native initialScrollIndex is always0. There is no preceding estimated spacer,
  getItemLayout guess, scrollToIndex or index-failure recovery.
- Jump, Focus restoration and cold-anchor restoration share this path. Each list
  epoch clears offset/content/visibility/mounted-node facts before changing data;
  callbacks from older epochs are ignored. The existing live Native geometry and
  viewability requirements remain, as do the5s deadline and original8-command cap.
- Earlier content is not deleted: a real upward user drag near the window start
  prepends one existing earlier date/header block into the same list, using native
  maintainVisibleContentPosition. Layout events, initial pending measurement and
  programmatic scroll never prepend. Descriptors remain cheap; FlatList still
  bounds heavy mounted renderers using8/batch and windowSize5.
- `onViewportChange` adds `originIndex` to distinguish native relative offset0 at
  a later date from the real Trip Introduction. Root must propagate that field
  through the existing DayFeed presentation type and treat `originIndex>0` as
  past-introduction for its native date title. Keep observeScroll on real native
  offsets; do not synthesize a global pixel offset. ScreenRoot changes remain
  Coordinator-owned.
- Numeric diagnostics distinguish global/local index, origin, cell/list epochs,
  actual geometry and actual viewability. No Source, Canonical, date, zone, user,
  Session, Simulator, Provider or Renderer semantics change.

## Minimum repro evidence

Scoped mocked Native-contract tests explicitly reproduce old offset1615 arriving
from the retired list while global99 is now local0; the new target reaches actual
viewability without any index call or inferred prefix offset. They cover no-user-
gesture/no-prepend, upward prepend preserving the existing list, empty final date,
late mount/cancel/epoch callback, Focus/cold stable keys, and immutable descriptors.
These are not Native PASS. Original failed Native evidence remains unchanged.

One integrated AD5 sampling should record Japan2027-02-12 global99/local0, target
remaining mounted through content-size changes, actual date header/visible result,
empty date, upward access to preceding content, Focus return and cold restoration.
If it fails, preserve accurate stage evidence rather than increasing retries.
