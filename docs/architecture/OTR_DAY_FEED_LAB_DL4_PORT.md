# DL4 shared presentation port

2026-10-12 · Owner authorized after DL2 main integration40c5d29.

Use a pure `day-feed-lab/1` contribution array and explicit typed
`day-feed-renderer/1` adapter, never a mutable global registry. Contributions
supply existing DayProjection/DayQuery/CoreDayRow, deterministic view clock,
bounded date selection, metadata, typed supplemental facts and existing G2
Flexible/TTR ports. Registration lives in the catalog; switching remains generic.

The production DayFeed accepts optional query/renderer/presentation ports. It
owns sorting via its single G2 Composer, one Focus and Immersive return/scroll.
Renderer callbacks receive composed row identity and shared depth actions; null
uses existing P1/P2 fallback. P1 geometry supports optional detail content in
Focus/Immersive. No repository or writer belongs in a renderer.

Synthetic P3 uses schema-checked in-memory authored facts and the owning
projectCoreDay/projectCoreItem read projectors. A fixture-only adapter maps
owning P3 rows into existing DayQuery, retaining roles and BASE position. No
accepted runtime certificate or Stay admission is claimed. Other Core families
remain unavailable in DL2 Core mode. Final P3 geometry is separately approved.

Flexible affiliation, optional soft boundary facts and My/Group Choices remain
presentation-only; no Block/Choice lifecycle. Qualified ttr-presentation/1 remains
same-day fixture-only without production Core occurrence authority. NOW suppresses
connector decoration only; straight-line and confirmed-mode facts remain intact.
No provider/ETA/MapKit or owning feature implementation is included.
