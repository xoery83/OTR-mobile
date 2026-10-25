# P1 move release repair — 25 October 2026

Owner observed a released gesture continuing to scrub with the floating card stuck onscreen. Forms QA observation confirmed that suspended active state. Earlier row-local Pressable movement/release callbacks were insufficient for a virtualized scrolling source.

The pickup row now only initiates. A stable screen View receives bubbling touch-move/end/cancel for the entire lifetime; release is idempotent and stops the timer before displaying confirmation. Second-finger touch-down cancels immediately, preventing finger takeover. AppState interruption cancels; unmount stops the loop. Precision-only horizontal motion retains off-grid clock; the source remains immutable and confirmation remains an in-memory fixture preview.

Actual native stationary smoke: Forms QA C0C23E00-5016-4289-B806-92C5484BD5BA; normal pickup row held1second/released. Metro emitted p1_fixture_move_arm syn-p1-exact then p1_fixture_move_end changed:false/status:READY; no overlay remained. This validates stationary release, not continuous drag/release, cross-date following or haptics. Tool's discrete hold and drag APIs cannot combine a sustained hold plus drag in one scripted touch, so no full touch PASS is claimed.

Directed hook/model/presentation/list tests56PASS; new lifecycle cases cover unchanged release, changed host release without source-row callbacks, cancel/background, precision-only off-grid motion, and second-finger takeover. Independent review verified single-finger cleanup and independently re-ran5hook cases after closing the multi-touch finding. Typecheck, UI guard and scoped lint pass. The existing visible prototype still uses the older time/date engine; the unified cursor redesign is a separate candidate in P1_MOVE_REDESIGN.md, not an implemented feature.

After native stationary smoke, Device Hub GUI exclusivity was yielded to Universal Coordinator at its authorized request. No additional GUI input or focus changes will occur in this lane until explicit release is returned; independent coding/tests can continue. AD5 data, Forms QA account/session, Repository and Backend are unchanged by this repair.
