# ADR 0020: Settlement pager Phase 1

Date: 2026-09-30
Status: Phase 1 implementation

Keep the existing Ledger and standalone Settlement routes. In the Ledger route,
mount one Settlement controller on first entry and keep it mounted while the
user switches to Spending. Its existing hooks continue to own refresh, focus,
sync, and account/Journey transitions. UI page selection must not remount them.

Use one native pager for Summary, Paid, Shares, and Payments. The controller
renders all four existing section views from its single data instance. The
Ledger-owned section name remains the selected state; pager progress is an
animation value and selection is committed only when a page settles. Keep the
current shared vertical ScrollView and defer independent page anchors to Phase 2.
React Native Animated's native driver consumes PagerView's position and offset
events for the indicator, so Reanimated is not a new direct dependency in this
phase. Disable iOS overdrag at the pager's first and last page.
Lock the parent ScrollView's drag direction on iOS, and fill its remaining
viewport with the pager when a section is short so blank space accepts swipes.

This is a presentation change. No Backend API, SQLite schema, Supabase, or
financial calculation changes are required. The native pager adds a direct
dependency and requires an iOS client rebuild.
