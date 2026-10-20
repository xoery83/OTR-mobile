# G2-FLEX-02: scoped presentation replacement and Immersive-local Focus

Status: accepted bounded implementation direction; delivery awaits Owner Review.

G2 retains one Day Feed Focus. Flexible Block Immersive suspends that Focus,
removes its active rendering and disables the background Feed. Closing restores
only a still-visible target in the same Account/Trip/date/generation. Flexible
owns one local expanded resource; Pool/Search/Saved resources receive no global
Feed identity. Canonical nested Item navigation continues through G2.

`g2-flexible-snapshot/1` replaces the complete authorized presentation for a host-
declared Account/Trip/date/generation. Revisions strictly increase within that
stream. The consumer validates and copies immutable values, rejects stale/wrong
scope publications, and recomposes the mounted DayFeed. Context changes reset
the stream and fence callbacks from earlier mounts/context visits.

Reuse `g2-flexible/1`, explicit affiliations and the existing Composer. An
ambiguous/ineligible affiliation leaves an authorized Item outermost; Block
deletion changes presentation only. TTR qualification remains owned by the
accepted TTR projection and existing anchor-placement checks.

No persistence, event bus, second Composer/Focus controller, admission, sync,
Provider or business workspace is added. The interactive fixture demonstrates
the seam using authorized synthetic facts and feature-local expansion state.
