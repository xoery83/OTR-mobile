# P2_RESOURCE_LEASE_AND_SCOPE_GATE

Status: PREPARED / NOT AUTHORIZED / NOT INSTALLED. Latest Owner instruction removes the artificial 13:00/UTC-two-call wait; this request is for protected SQL and finite configuration authority, not another budget approval.

## Exact target and boundary

- DEV only: Supabase `tuqigdxrvrerfewsxqgm`; existing `otr-dev-backend` at `178.105.151.143` / `api-dev.xoery.art`. No Production, real-user or cross-account data.
- QA Actor `f4b059c5-8241-4ffb-aa15-37fa25474543`, Trip `825f79b2-4a9d-4535-a62e-43000ca50c4a`.
- Integration `otr-universal-qa-1624499c-18d7-4026-b3fe-7346ab1f825d`, existing DeepSeek/deepseek-flash; config16/hash `9b23a254dadaa01588226f3d437bb3ee371d5587def27c544061760bea74e7d2`. No new Provider/secret access.
- Latest scope ID `baac2ca8-f769-4ace-8bd4-d394a36312d6` rev5/hash `1ab712404e63740cb50425910a2ee52ad70b1f7743652370dc3b517d4aa84c32`; grant rev5 remains unchanged. Original expiry `2026-11-01T08:48:56Z` remains.
- Existing healthy image `sha256:0d50d567cbd9f35022b626b2f45b05a9fe7aa2137fbfbe443c48e3329ca157cb`; no Backend image replacement required by this package.

## Authorized protected change requested

1. Replace **only** `public.flight_activation_reserve_call(jsonb,jsonb)` using `P2_RESOURCE_LEASE_DEV_INSTALL.sql`. Exact canonical function MD5: `3cef15114775a5334a6f68332c38b044` → `d7d6c6285b9752b89d516f8b2aaee554`. File SHA256s are in `P2_RESOURCE_LEASE_PACKAGE_HASHES.json`.
2. Its sole change is the existing concurrency COUNT: for incoming exact QA Actor/Trip/integration/DEV Universal workload/model/scope **rev6 only**, exclude same-scope/account/trip/integration/model old MAY_HAVE_STARTED RUNNING/UNKNOWN calls whose owning immutable full-key Model Task admission deadline equals its request policy deadline, and **deadline+60 seconds has passed**. Missing/mismatched/NULL admission stays counted. RESERVED/NOT_STARTED and unexpired/grace calls stay counted. Other scopes/Trips/accounts/workloads are unchanged. No new Task or call ID is an authority proof.
3. This explicitly changes **admission concurrency lease accounting**, not the remote execution outcome. UNKNOWN stays UNKNOWN; no declaration that DeepSeek stopped or cost is zero. Every old call, START, hold, admission, daily count and cost remains. Monetary checks, Source/Trip/session validation, one-call-per-Task lifetime binding, idempotency and existing transaction locks remain byte-identical.
4. Append existing scope rev6 via the real `flight_activation_select`, CAS expected5. Exact row is `P2_RESOURCE_SCOPE6_PROPOSAL.json`; canonical SHA `550eb26788e104de92f5f26ae46984af9b6235cd480248b7c254394f0fb273a2`. Only revision/hash, account/dev/provider daily2→20 and account/dev daily cost $0.10→$1 change. Keep concurrent1, attempt1, Task600000ms, input32768/output4096, $0.05/call, original expiry/pins/price/identity. Retain original aggregate $1 operational ceiling including existing UNKNOWN exposure. No automatic replacement after another UNKNOWN. No repeated per-call budget request or UTC wait.
5. Renew **only** existing expired CONFIG_ADMIN grant `d54496c1-273e-4181-a00c-6c76c022965c` rev8→9 and SECURITY_ADMIN `d596e9f4-643e-4395-9428-e0c6acea0648` rev10→11 for the same real verified QA Actor, DEV, at most15minutes; same grant IDs/created identity. Existing `otr_external_integration_admin_gateway` may LOGIN VALID UNTIL the sealed end, using its existing vault password/CA and real authenticated verifier in place. No credential/session copy or invented admin identity. Preserve all role attributes/memberships; no new role or password. Prior exact rows are `P2_RESOURCE_ADMIN_PREIMAGE.json`.
6. Installer transaction temporarily grants the existing meter-writer role to postgres WITH INHERIT/SET and temporarily schema CREATE to that role so its owned function can be replaced. It restores exact preimage role edges and removes CREATE **before COMMIT**, asserting original function OID/owner/ACL and memberships. This transient protected GRANT is part of this request; there is no persistent RLS/table/schema/role/ACL expansion. Installer rejects preimage drift or any existing scope revision≥6.

No P2 Source Review/Admission/Core Save authority is included. No P1/P3 Gate reuse. No table/column/CHECK/RLS changes, no direct Task/Call/hold edit, no Source/Task auth bypass.

## Execution after approval

- Independently recheck exact function/scope/grant/role preimages, image health200/protected401, current normal QA identity/Trip, old call/readback/raw and usage. If retained trusted old results are available, recover first; do not resend the old Task.
- Seal current actual15minute admin interval and real verifier receipt; use existing protected maintenance and CP14 command/gateway patterns, with request/audit hashes and a new task-owned private plan/claims directory. Do not overwrite the prior continuous plan or relax its closed-baseline validator to accept this live scope.
- Arm an independent +660second watchdog with sealed owning inactive-rev7 close command (execute on missing verified-success marker; read latest scope/audit before any send) and +900second NOLOGIN/revoke watchdog **before** renewal; start close by+660seconds and close immediately after configuration readback. Only the two exact renewed grants/own interval sessions can be closed, CONFIG rev9→10 / SECURITY rev11→12; retain audit/history. No silent extension.
- Install function, append scope6 through owning command, independently read hashes/ACL/role edges/scope/grant; close finite admin rights before ordinary App testing. Success leaves the exact QA scope6 active only until original expiry, supporting Owner-authorized normal testing; no clock-wait automation.
- Coordinate AD5; reuse already accepted Batch9 `a9be165b-5a90-4244-add7-d4977c9e7ba5` and original27byte file SHA `898bccf74ea63279b1aa43b49b8539625b97027e61c3e35dad14e6df2ed9d068`. No Run/Task or call exists yet. Backend proposals Task `7338329a-46eb-8050-9bec-96376f08b296` / Run `8af82103-55f2-84ea-8e6f-445a15321cf6` are not owning qualification; normal Source Prepare must persist matching binding.
- Normal App Analyze → Source/Task → one new paid DeepSeek attempt → Results/recovery. Keep30second transport/60second local outer timeout, Task10minutes/attempt1. UNKNOWN: read same IDs, preserve exposure, no automatic new replacement. Continue P2 qualification/wiring without claiming formal Save before a separate exact business Gate.

## Failure and rollback

- Any preimage/authority/health mismatch stops activation. SQL transaction failure restores function/temporary privileges atomically. Claimed CP14 UNKNOWN is reconciled by request/audit/scope readback, never blindly resent.
- If rev6 was never committed: close temporary admin rights and run the exact function rollback if installed. No new scope is fabricated.
- If rev6 committed: through the existing owning admin command append rev7, CAS expected6, **inactive**, retaining same scope/integration/pins/expiry and all history/holds (restore pre-rev6 financial limits in that inactive row). Read back rev7 before applying `P2_RESOURCE_LEASE_DEV_ROLLBACK.sql`, which refuses rollback while rev6 is latest active. No DELETE/UPDATE of historic scopes/calls, no refunds. If admin window is lost before append7, do not use unapproved direct table edits: role expires/watchdog closes authority; scope expires at the original bound; report exact remaining closure blocker.
- Exact function rollback MD5 `d7d6c6285b9752b89d516f8b2aaee554` → `3cef15114775a5334a6f68332c38b044`, restoring OID/owner/ACL/temporary edges. Existing healthy Backend image remains throughout; standing software rollback ac188662 is unchanged.

## Validation and honest limits

- `universal-p2-resource-lease-full-acceptance.py`: real owning Source registration/Run/Input, actual CP14/Model Task/CP15 reserve, baseline failure, scope6 success, independent transaction lock barrier, exact replay, live call blocking, day/cost hold preservation, real append7 closure, exact installer rollback. One cached network-none memory256MiB/cpu1 disposable PG, no hosted writes/Provider calls. 48 checks PASS. Result: `P2_RESOURCE_LEASE_FULL_PG_RESULT.json`.
- `universal-p2-resource-lease-predicate-acceptance.py`: exact installer/rollback/privilege preservation, wrong/NULL identities/admission joins, other live call, frozen test-clock59.999/60/60.001second boundary, byte-identical surrounding body. 49 checks PASS. Result: `P2_RESOURCE_LEASE_ISOLATED_PG_RESULT.json`.
- Fixture clock aging disables triggers only inside that disposable synthetic database to simulate time. It is not an approved DEV repair and is not copied into installation. No claim of remote termination, hosted new admission or P2 Candidate/Save PASS.
- The earlier single-Task `P2_RESOURCE_*` exception package is superseded by this scoped lease candidate and must not be installed. Preserve it as diagnostic history.
