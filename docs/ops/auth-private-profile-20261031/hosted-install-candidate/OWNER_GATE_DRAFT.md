# Private Profile DEV install — draft, not an execution request

Scope: DEV `tuqigdxrvrerfewsxqgm` only. Photo owns current shared release resources.
This packet is local-qualified; no Hosted read, install, runtime or Native activation occurred.

- Two **new** tables: `account_private_profiles`, `account_private_profile_receipts`.
- Two SELECT-only self RLS policies. Normal non-anonymous/non-disabled Account only;
  delegated OAuth resource/client/scope claims cannot read or save private data.
- Two new `SECURITY DEFINER` functions, owner `postgres`, fixed `search_path=pg_catalog`:
  `account_private_profile_actor()` and `account_private_profile_save(uuid,bigint,jsonb)`.
- `authenticated` receives SELECT on those two new tables and EXECUTE on those two
  functions; no direct table INSERT/UPDATE/DELETE. PUBLIC/anon/service_role receive
  no access. No role creation/membership or existing table/RLS/function changes.
- Fields remain optional private Display Name and independent split/unsplit Travel
  Document Name. Same existing Supabase Auth UUID; no second user/session authority.
- Body is byte-identical to reviewed `cf3081ab…` with existing local PG10 domain/RLS
  proof. Installer adds exact project/approval/role/absence preconditions, bounded
  timeouts and privilege postconditions within one transaction. Its six local
  checks include unexpected default-ACL rollback and duplicate-install denial.

Before a final Owner request: obtain actual relevant Root resource release, then
fresh read-only object/default-ACL/dependency metadata through the approved DEV
channel and freeze the exact runtime/QA handoff. Do not treat elapsed sprint time
or this draft as execution authorization. Existing local PG subjects are fixtures,
not normal OTP/JWT E2E.

If installation ACK is unknown: read only these exact four objects and reconcile;
never replay CREATE/replace, automatically DROP, or delete Profile data. A failed
pre/postcondition rolls back the entire transaction. Runtime stays unmounted.
Hosted Profile save/readback/cross-Account/receipt recovery remains pending.
