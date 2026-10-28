# Guest adoption census before publication

AUTH Final V1 requires a whole-dataset inventory before upload or identity
conversion. Guest A is accepted on main9f78a503; B adds an Auth-owned read-only
census in the same Guest vault, using the existing apply gate/transaction serializer.
It creates no tables, Session, worker, remote Trip or authority.

The census enumerates table counts, validates local Guest/Trip ownership before
reading supported rows, and hashes stable logical contents. SQLite bookkeeping is
not business data. Unknown nonempty tables/operations remain explicit blockers;
no prefix-based ownership inference, partial selection or silent omission. The
current supported closure is Trip/destinations/deferred metadata, P1 intents,
local Persons and automatically initialized Ledger/cover preferences. Registered
owning file and live-draft inventories are required separately: missing collectors
must not be interpreted as zero. Neither SQL census nor a digest grants adoption.
`readyForServerPreflight` only qualifies the supplied inventory for subsequent
server validation; it does not validate all mutation payload semantics or grant
upload/publication. External `COMPLETE` metadata is currently an explicit caller
attestation, not an implemented file/live-draft collector. Actual collectors must
collect and recheck in one controlled source snapshot/revision; identity generation
alone does not fence same-Guest draft/file edits. There is no Native adoption
consumer, and normal calls without collectors remain blocked.
The durable digest excludes runtime generation; the transient scope retains kind,
UUID and generation fences so cold recovery recomputes its current scope.

The first real A database contains an automatic
`account_trip_cover_preferences` row from the existing SQLite70 Trip initializer
trigger. Inside the isolated Guest vault this is a Guest-local preference keyed by
its local owner UUID, not proof of a formal Account. Preserve it in B.

Existing Trip and Core PG adapters each own BEGIN/COMMIT and use separate private
principals. There is no accepted atomic Guest publication seam. Serial HTTP
creation, hiding partially committed Trips in Native, or borrowing Manual QA
qualification cannot satisfy publication. B must prepare an exact private staging/
preflight/publish/status candidate reusing owning command/Person/Ledger semantics;
new protected SQL/roles/GRANT execution retains the precise Owner gate. Default
activation stays closed until that candidate is reviewed and lawfully installed.
No commercial limits, prices or reset cycles are introduced by resource counts.
