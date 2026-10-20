# WP05-D owning Trip creation port — isolated local result

2026-10-13. Branch `codex/wp05-d-trip-owning-port` starts at sealed WP05-C
`f4bac6c` (base `edcbd7d`). Main's later C data-only intake is separately
owned by Source. This packet adds an authenticated Backend Trip-create and
receipt route, a dedicated dormant PostgreSQL owning function/receipt, SQLite59
acceptance fields, and an explicit local `CREATE_TRIP` worker/coordinator. The
generic queue excludes that operation. Backend server construction does not
inject the port or provision the new `NOLOGIN` principal. No Hosted migration,
credential, Core activation, or authenticated Native journey occurred.

One stable local operation/Trip UUID is retained. The PostgreSQL function
stores an actor-bound receipt and exact request JSON, inserts the Trip, observes
the existing creator triggers' linked Person, and initializes the empty Core
read-state row in one transaction. Exact retry/receipt read return persisted
identity; changed payload, actor, or Trip UUID reject. A lost HTTP response
leaves the local queue durable until a receipt-first retry. SQLite acceptance
checks Account generation and payload/actor/Trip/Person, then writes owning
Person and queue completion together. Ledger financial fields remain null.

Validation: focused six test files /43 PASS including actual file SQLite
close/reopen, local acceptance rollback on A→B→A, receipt-first replay and
generic-worker exclusion. Typecheck, scoped lint, UI guard, Backend build and
format PASS. Local Supabase PostgreSQL was used only for a bounded
transaction-rollback migration/function check: exact replay, receipt replay,
changed-payload/actor/Trip collision rejection, exactly one Trip/owner member/
linked Person/receipt, and full rollback all PASS. The local database lacks the
Core read-state migration, so the script created a transaction-scoped stub with
the same required columns; this is mechanical function acceptance, not full
Hosted/owning-read acceptance. Repro script:
`/private/tmp/otr-wp05-d-sql-rollback-acceptance.sql`.

The D backend/data commit excludes the two-method compatibility amendment in
`LocalTripWorkspace.test.ts`, because Source's C data-only main does not yet
contain that UI test. A separate follow-up commit carries that test change for
the eventual C UI integration. Source owns final SQLite/PG allocation, main
registry, independent function review and serial integration. Original C UI
seal remains at immutable `f4bac6c`; its authenticated Native Visual and full
J1–J5 journey remain blocked by the genuinely missing session.
