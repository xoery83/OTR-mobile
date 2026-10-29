# Frozen Guest Trip/P1 source projection

The next atomic publication candidate needs domain values, not a copied SQLite
file or a second Sync Engine. Read only through the frozen Guest workspace and
existing owning Trip/Person/Core parsers. Preserve original Trip, Person, Item and
operation IDs, original Create inputs, current metadata, static cover preferences,
retained deferred metadata actions and ordered canonical P1 intents. Preserve
source timestamps as provenance (not Server Accepted time) and owning Ledger
bootstrap Journey settings separately; never silently reset currency/scale/policy.

Require the actual current-source census and hash before and after projection.
Every queue entry and local Person must be accounted for exactly. Refuse unknown,
foreign, already-dispatched/accepted, linked or inconsistent material; preserve
originals without partial export. Do not copy local capability caches into server
authority. The existing server owning contracts must generate Account authority
and return explicit identity mappings and receipts in the later publication slice.

This projection contains no target Account, Provider credential, file path, upload,
mutation, reservation or Session activation. It is local evidence only and cannot
make a preflight grant or permit publication. The eventual wire/SQL candidate and
protected authority changes require separate implementation and exact Gate.
