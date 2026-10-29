# MetadataV2 on a caller-held transaction — private extraction candidate

Native delegated only MetadataV2 PgStorage transaction/DI and direct tests. The
frozen ac2ad124 files match Auth baseline7f2975d6. Preserve all normal SQL, CAS,
principal, snapshot/receipt/result pins and standalone transaction behavior.

Factor the owning query and methods once. A separate internal callback consumes
an already running, lifetime-fenced lease and never begins/commits an inner
transaction. As in the reviewed TripCreate candidate, caught/pending/overlapping
or escaped operations retire the supplied caller lease, retain the first error,
and refuse later dispatch. Clone the revisioned update before its first await.

The normal factory is unchanged to callers. No bootstrap/HTTP wiring or SQL/GRANT
activation. Metadata, TripCreate and Core still require different session_user
principals, so these interfaces alone cannot authorize atomic Guest publication.
The actual GuestA deferred metadata operation must be legally reconciled and
included in full-dataset verification; never omit or fake an Applied receipt.

## Stable Auth replay

Native delegated these exact transaction/DI ports to Auth as unique Writer on
2026-10-29. Replay starts at accepted main dd53870c; all selected parent files
are byte-identical. Only these files and direct tests are replayed, never the old
Native parent branch. SQL/role/Authority/DEV publication remain closed.
