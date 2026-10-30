# Photo transactional installation maintenance — exact Owner extension

Status: prepared, independently reviewed NO_BLOCKER; NOT approved or executed.
Original Photo business/custody Gate77a6febb is approved and remains unchanged.

## Actual failure and scope

Original DEV `tuqigdxrvrerfewsxqgm`; original QA Account f4b059c5 / Trip825f79b2,
retained Batch67842863 / PNG078de830 (42,630 bytes). First fixed transaction was
rejected with SQL42501: `must be able to SET ROLE "otr_trip_source_writer"`.
Independent readback proves no installation: PNG columns/helpers absent and Core
guard66410 still6c7ef0d85cfd8893796ccc53e31f51f0. No partial Save or paid image call.
Backend28dd/fb0d remains healthy and unchanged. Approved Host files are installed
but no Backend PNG runtime configuration or business activation is installed.

Existing SourceWriter and ExecutionWriter each have two membership edges to
postgres: supabase_admin-grantor ADMIN=true/INHERIT=false/SET=false, and
postgres-grantor ADMIN=false/INHERIT=false/SET=false. Neither owner has schema
CREATE. The original Photo packet deliberately includes no maintenance grants;
its no-membership/broad-GRANT promise does not authorize changing these options.

## Exact additional authority requested

One DEFAULT-CLOSED installation transaction only, using the existing two owner
roles `otr_trip_source_writer` and `otr_trip_source_execution_writer`:

1. Require current_user=postgres, both existing postgres-grantor edges exactly
   ADMIN=false/INHERIT=false/SET=false and both schema CREATE privileges absent.
2. Snapshot the entire pg_auth_members graph (all rows including OID) and raw
   public schema ACL in transaction-local temporary tables.
3. Change only the two existing postgres-grantor edges to INHERIT=true/SET=true;
   temporarily grant schema public CREATE to those two existing owners.
4. Run the already approved frozen Photo package, original SHA256
   `21bfcdb459ee4bd3900a572bf35cb243b683b04e6ca18534e77adf4f08d98ef1`.
5. Revoke the two schema CREATE privileges and restore each changed edge to
   ADMIN=false/INHERIT=false/SET=false before COMMIT. Require exact entire
   membership graph and raw schema ACL equality; any mismatch raises and rolls
   back the full installation. Lock timeout3s / statement timeout20s apply.

No new role or membership edge, login change, persistent maintenance authority,
RLS, table GRANT, Provider/Secret/budget/scope change or business-window extension.
The already-approved two policy columns, nine helpers/narrow EXEC and existing
function replacements are the only committed installation differences.

Wrapped SQL SHA256:
`484d7bce6e5a71b759bbbd67984e461e0e39a33f8c7b17c17640cd5b8081d9ec`.
Private SQL, immutable inner-packet recovery check, builder and PG receipts are
preserved in ignored `.env.photo-maintenance-20261031/`; raw catalogs are not public.

## Verification and rollback

Isolated network-none PG used equivalent non-superuser operator privileges and
existing ADMIN/disabled INHERIT/SET edges. Both function-owner transfers passed;
success restored complete graph/schema ACL; injected mid-install failure and
missing-restore failure rolled back; original fixture graph remained unchanged.
Only the operator name is mapped in that test because bootstrap postgres cannot
lose SUPERUSER. Full Source/Core body uses the prior independent PG verification.
Independent wrapper Review: NO_BLOCKER after expanding to the full graph.

Before execution repeat DEV, exact preimages/roles/ACL and CLOSED verification.
Execute once; on UNKNOWN independently read before any retry. Failure rolls back
DDL and temporary grants together. Before any PNG artifact, the original frozen
pre-use inverse remains available only under its original exact postimage CAS;
once used, close writes and retain compatible readers/originals/receipts instead.
Normal Photo execution remains the approved <=60min / +45close / +50watchdog /
+60SQL-expiry and original2026-11-01T08:48:56Z hard expiry. Do not open that window
until install, physical close, compatible runtime and normal QA checks all pass.
