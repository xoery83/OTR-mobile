# Server-parent Metadata local consumer

Native writer handoff: LocalTripWorkspace Metadata entry, tripMetadataRepository,
tripNormalSync and tripNormalCoordinator; targeted tests. Native retains registry.

A formal Parent receipt plus current accepted Core/Owner projection qualifies the
consumer. Snapshot V3 supplies the editable revision. Confirmation rows never
confer permission. Saves use existing Metadata V3 CAS, queue and receipt-first
worker. No local Create/container is manufactured and no Adoption is replayed.

SQLite 76 candidate rebuilds the existing confirmation table without its local-Create
FK, preserving rows, key, checks and revision index. A delete trigger preserves
existing local-container cascade cleanup. Account switching retains private rows
under their original account; fresh Parent/Core checks fence revoked or stale
scope. Native supplied fixed Registry patch SHA b4b07c84… (applied locally, not installed).
Native verified no current hard Account purge port exists; logout/switch retain
account-private data. Any future hard purge must explicitly clear confirmations
without local containers. This does not change Hosted schema or authorization.
