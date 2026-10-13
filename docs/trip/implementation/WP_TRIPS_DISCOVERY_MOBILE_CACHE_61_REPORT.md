# WP-TRIPS-DISCOVERY/INDEX — isolated Mobile read cache

Baseline: canonical Push30 `3dac3c5` after the reviewed Backend-only route. This
packet is local R0/R1 code, with no automatic network request, UI caller,
deployed DEV endpoint, Core admission or runtime activation.

SQLite61 holds an Account-keyed complete discovery snapshot and its minimal Trip
summaries. The transport uses the existing authenticated client and a hard
256 KiB response bound per page, including caller attempts to raise it. Explicit
refresh validates up to 40 ordered pages
(1,000 Trips); any error, duplicate, cursor regression, partial result or
Account-generation change leaves the previous cache intact. Replacement is one
Account-gated SQLite transaction. Reads merge cached summaries with local Trip
containers by stable UUID; local pending details/cover selection win without
creating a fake `CREATE_TRIP` operation. Nullable server `createdAt` stays null.

The resulting `TripListSummary` is a presentation read projection, not a new
business Trip authority or access certificate. The data-layer default factory
provides the account-fenced cached read without exposing SQLite to a feature.
`TripRepository.listTrips()` and
the My Trips UI remain local-only until a separately reviewed caller/workspace
route and applicable Native QA exist. Cached data follows the existing Auth
trust boundary; this packet does not prove current remote membership while
offline. No accepted Day, Person, Member or Ledger setup is inferred.

Author checks: focused repository/transport/migration/Backend contract tests
24 PASS; typecheck, Backend build, UI guard, scoped ESLint/Prettier and diff
check PASS. Independent connected security/data review and serial main intake
remain separate.
