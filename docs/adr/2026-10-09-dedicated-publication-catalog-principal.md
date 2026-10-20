# Dedicated dormant Publication Catalog SQL principal

Date: 2026-10-09 (Pacific/Auckland).
Status: Final Owner accepted the dormant R3-A Option B contract, F1 correction
and independent recheck PASS. Hosted and runtime provisioning remain gated.

Preserve `otr_trip_source_command_gateway` NOLOGIN and its command/read grants.
Add `otr_trip_publication_catalog_reader` NOLOGIN/PASSWORD NULL with one dedicated
protected Catalog EXECUTE grant, CONNECT and public schema USAGE. Preserve shared
PUBLIC ACLs. Extend only the read root's exact session_user allowlist; retain the
writer owner/current_user guard and current Actor/Trip admission. Backend fixes
both pg authentication and same-lease checking to the Reader, rejecting the old
gateway. No configurable username or alternate authority is introduced.

A separate versioned R3 forward, capability inventory and guarded rollback carry
this change without rewriting migrations or the installed Ledger forward. A
preexisting role or H0 drift rejects; effective business/ownership/CREATE,
escalation or additional privileged routine paths reject transactionally. Root
replacement temporarily enables the existing administrator's writer inheritance
inside one transaction, restoring the exact prior grantor edge afterward. It does
not add any Reader membership or use SET ROLE.

The Reader authenticates Backend, not an end user. Protected SQL checks current
Trip admission for the supplied Actor; verified Auth must derive that Actor in
Backend. Stolen Reader credentials can disclose private catalogs for known admitted
Actor/Trip pairs. PUBLIC TEMP/catalog visibility persists; managed extension and
statistics reachability must be separately inventoried on the exact Hosted target.
The corrected extended H1/rollback commitments also cover normalized applicable
PUBLIC/Reader future table and sequence default grants. Transaction-local forward,
reverse and commitment guards reject unsafe defaults without sanitizing shared
ACLs. Managed extensions and secret state require separate target evidence.

Rollback disables the injection first, then separately disables LOGIN/credentials
and terminates sessions if provisioned, before the reviewed SQL reverse. The
reverse restores the original root/ACL and retains the unowned NOLOGIN role;
reinstallation needs a separately reviewed forward because the original artifact
intentionally refuses existing roles. Offline SQLite history remains intact.

See `../architecture/OTR_PLATFORM_R3A_SQL_PRINCIPAL_BUILDER_REPORT.md` for evidence
and required Owner/Hosted decisions. No new SQL service or authentication framework.
