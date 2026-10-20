# ER02 DS-08 — restore Navigation Island when reading stops

Base649653b5 (same product as residentca7875a). New isolated worktree/branch
keeps the current proven Currency preview source immutable. Coordinator assigned
one Presentation Writer; shared TripScreen change is one presentation callback,
not Receipt, account-generation, DayViewContext, FLOATING, Reader or permission.

Owner Product Delta/Blueprint require idle navigation visible. Old tests explicitly
kept it hidden through rest, and oldca Native long empty Nelson reading retained
hidden navigation after the gesture settled. Native screenshot also records a
separate header overlap; do not claim that defect fixed here.

Minimal fix: FlatList emits an optional presentation stop after a zero-velocity
native drag release, or native momentum end. Nonzero release waits; prior momentum
cannot end a new active drag, and old list epochs cannot publish. Both existing
Feed paths forward the callback. Shell restores navigation and resets hysteresis,
rejecting old scopes. No timers, responders, anchors, Capture owner, financial or
business read/write contract changes.

Validation: three directed suites/48 tests PASS; typecheck, scoped ESLint,
Prettier/diff and UI guard PASS. Independent scoped review PASS (47 tests
independently run); subsequent new-drag predicate/test independently reviewed
PASS and final48 tests rerun. No P1/P2. CODE_READY / NATIVE_PENDING.

Required Native: zero-inertia release, inertia end, boundary rebound, rapid
interrupted drag; Capture stays usable, navigation restores, safe area unchanged.
Use a candidate-specific child Metro cache, preserved original App/account/data,
and rollback to ca7875a if qualification fails. No new Native installation is
required by these source-only changes. Current resident preview remainsca7875a.
