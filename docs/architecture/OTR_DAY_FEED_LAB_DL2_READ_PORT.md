# DL2 read-only Lab port

2026-10-12 · Owner authorized after DL1 main integration `c0a6920`.

Core owns actor-scoped accepted collections, certificates and DayRow authority.
The existing `createTripCoreV2Repository.acceptedSnapshot` and owning
`projectCoreFlightFeed` / `CoreFlightDayProjection` are implemented and integrated
on current main; their bytes match the owning accepted Flight adapter. The newer
Native Capture workstream does not alter those adapter files. No unreviewed merge.

DL2 adds read-only accepted-Trip discovery to the owning repository and a Lab
facade using its accepted snapshots. Discovery binds current adopted Account and
generation, complete business2/read2/temporal1 certificates, current access revision
and nonrevoked scope. Snapshot reads repeat existing actor/Trip/generation gates;
certificate version/completeness invariants are also explicitly checked on read.
No migrations, collection refresh/install, command/queue/Seed or network path is
exposed. Expired access tokens do not prevent trusted adopted offline reads.

Fixture and Core modes use the same shell and production Feed. Mode/Account/Trip/
date changes reset the Feed context; stale Account-generation callbacks cannot
publish. Core mode is enabled only after a valid adopted session and at least one
current accepted local Trip collection. Discovery is local/partial, never a claim
of complete server Trip membership. Missing session/collection/capability stays
unavailable; errors withhold the projection, with no v1 fallback or Fixture mixing.

The accepted owning adapter supports P2 Flight (including sparse P1 presentation).
Other Core families remain explicitly unsupported, rather than silently presented
as an empty supported collection. DL2 does not implement new P1/P3–P6 adapters or
renderers, Booking/Ticket/Participant facts, Flexible or TTR. Fixtures retain P1/P2.

G2 keeps each accepted CoreDayRow role/date identity: one compact Flight display
may group two same-day endpoint rows, preserving both owning row keys; v1 fixture
keys remain unchanged. No second Composer, Flight adapter or authority model.

Live Core DEV admission/read transport activation is not certified by this slice.
Synthetic repository/DTO tests may use disposable test-only SQLite, never the
native app's canonical tables. Native no-session/empty-certificate validation must
show Core unavailable. Real authenticated Core DEV and positive native Core mode
need an existing authorized session and accepted collection; no fake login or Seed.

Core date choices contain accepted Flight boundary dates and UTC today/tomorrow
plus the current view date so an empty Day remains selectable. These are view
contexts, not invented Trip dates or event facts. The Feed uses the current clock
for Core; the deterministic Fixture clock is never carried into Core mode.
