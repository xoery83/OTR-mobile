# Private Profile + AKA DEV install — candidate only, not an execution request

Status: PREPARED_NOT_REQUESTED_NOT_AUTHORIZED. No Hosted metadata read, install,
activation or Owner permission question has been issued for this packet.
Target, if separately approved: Supabase DEV `tuqigdxrvrerfewsxqgm` only.
Install SHA256: `c84671f456f4b0a850ae14dec9bf842b769cbab419e6398d1fefc1422ce6420d`.
Body SHA256: `550a36d72333c970b564c759aa6446c85705409401748358cceb99bfc6053608`.

## Exact metadata / permission scope

- New empty tables: `account_private_profiles`, `account_private_profile_receipts`.
- Two SELECT-only self RLS policies, restricted to normal non-anonymous,
  non-disabled Accounts; delegated OAuth client/scope/resource claims denied.
- Two SECURITY DEFINER functions, owner postgres, fixed search_path=pg_catalog:
  `account_private_profile_actor()` and
  `account_private_profile_save(uuid,bigint,jsonb)`.
- Existing authenticated receives SELECT on the two new tables and EXECUTE on the
  two functions. No direct table INSERT/UPDATE/DELETE; PUBLIC/anon/service_role
  denied. No new role or role membership; no existing business object altered.
- Optional private Display Name, independent split/unsplit Travel Document Name
  and exact-string `globalAka` array. No identity connection or authority from names.
- No business data migration, historical Profile copying, normal user writes,
  Cloud worker, Native UI cloud binding or feature activation is in this install.

This supersedes neither the frozen non-AKA SQL package nor any prior approved
Gate. This new body/marker requires a separate exact Owner decision if execution
is later proposed. It accepts only `OTR_PRIVATE_PROFILE_AKA_DEV_INSTALL_20261102_V1`;
the old non-AKA marker is rejected. The fixed renderer validates all three source
hashes and exposes no arbitrary SQL input/output path or guard bypass.

## Preconditions and closed rollout

The one transaction retains exact project/database/role/absence checks, bounded
locks/statements and table/function/policy privilege postconditions. Fresh read-only
object/default-ACL/Auth dependency metadata must still be qualified by the unique
Root SQL Writer; this packet does not claim that Hosted objects are actually absent.
Unexpected existing objects, default ACL drift or duplicates stop/roll back, never
CREATE OR REPLACE, migrate, drop or reset existing data.

Runtime remains unmounted/default closed after installation. Old strict clients
may reject AKA-bearing snapshots: an explicit fixed client/runtime contract must
be qualified before enabling any cloud read/write. Normal UI remains local-only;
`globalAkaDraft` is never automatically submitted. Entitlement, payment and usage
policy remain untouched. Do not interrupt an active MCP service or OAuth window.

ACK UNKNOWN means exact-object read-only reconciliation, never automatic SQL replay
or DROP. Formal normal-Account self read/write, foreign-account denial, original
operation recovery and cold restore require a separate lawful QA activation plan.
Local network-none install tests and AKA body/RLS/CAS/legacy receipt tests are
candidate evidence, not Hosted install or real OTP/JWT/Native E2E.
