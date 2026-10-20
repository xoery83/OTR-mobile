# ADR 0021: Settlement page scroll anchors

Date: 2026-09-30
Status: Phase 2A accepted on iPhone

Replace the Ledger route's shared vertical ScrollView for Settlement with a
single shared collapsible header above the four-page native pager. Each page
owns one vertical ScrollView and an in-memory body anchor. Journey context,
mode selector, and Settlement tabs render once above the pager; tabs remain
visible when the Journey context and mode selector collapse. Spending keeps its
current vertical layout until Phase 2B.

The header has one collapse amount `0…collapseDistance`. Each Settlement page
has a separate body offset beyond that boundary. On a vertical drag, consume
downward motion into header collapse before body motion; consume upward motion
from body before header expansion. During a horizontal transition, retain the
header amount and position the incoming page at `collapse + savedBody` before
it becomes active. A cancelled transition leaves the active page and header
unchanged. Short pages get only enough extra scroll extent to hold a fully
collapsed header.

Use the existing PagerView and React Native Animated. Scroll events update
refs and an Animated value without per-frame React rendering. Keep the Phase 1
Settlement controller mounted across UI switches. This is a presentation
change with no Backend API, SQLite schema, Supabase, or financial logic change.

Acceptance: the owner verified independent deep page anchors, continuous shared
header state, short-page scrolling, cancelled partial swipes, rapid swipes mixed
with tab taps, and Spending/Settlement return on the signed iPhone build. Five
four-tab click rounds added zero controller, pull, preview, sections, or review
loads. Journey A→B→A, offline navigation, and background/foreground passed the
preceding regression gate; account switching was not tested.
