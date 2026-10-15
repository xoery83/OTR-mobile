# TCL02 protected Trip Create recovery — review proposal

2026-10-16. **PROPOSED / NOT APPLIED.** This is the concrete remaining contract
decision after accepted TCL02 source integration. No Hosted inspection, SQL,
credential staging, role change, Backend deployment or real queue release occurred.

## What the existing contract actually says

`docs/trip/implementation/WP05_D_TRIP_CREATE_PORT_CONTRACT.md` and its report reserve
the Trip gateway as NOLOGIN and explicitly defer provisioning, Hosted execution and
Core activation. That closed reservation is intentional, not a live provisioning
receipt. The source has no accepted live LOGIN transition for this capability.

The observed `TRIP_CREATE_CLOSED`503 has an earlier, directly evidenced cause:
`backend/src/serverCapture.ts` passes Capture custody but no `tripCreatePort` to
`startDevBackend`; `tripCreateBoundary` returns503 before PostgreSQL when that port
is absent. This report does not replace that cause with an inferred Hosted role or
function state. The supplied Native receipt contains no proof that SQL was reached.

The precise source execution paths are:

| Source body / caller                                                                                                                       | Calls the Core finite predicate?                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20261013000500_trip_create_owning_port.sql`, original `public.trip_create_command` and `trip_create_result`           | **No.** They check the fixed real session principal, payload/idempotency and current owning rows. NOLOGIN is a reserved deployment profile.                                                                                                                      |
| `supabase/dev-forward/core-v2/20261014000300_trip_core_v2_finite_activation_contract.sql`, replacement bodies for those same two functions | **Yes.** CREATE calls `public.trip_core_finite_scope_allowed(p_actor,p_trip)` before mutation. Result checks actor/NULL before lookup and then the persisted Trip. This is a dormant replacement, not evidence of its installation.                              |
| `backend/src/tripCreatePgStorage.ts`, current `query()`                                                                                    | **Yes, regardless of which SQL command body is installed.** It calls `public.trip_core_finite_scope_allowed(actor,optionalTrip)` before invoking the command/result and again before COMMIT. A missing function fails closed; a false gate prevents the command. |
| `backend/src/serverCapture.ts` → `startDevBackend` → `tripCreateBoundary` in the observed deployment                                       | No SQL call while the port is absent; immediate503. Merely injecting a port would then expose the adapter/installed-body prerequisites above.                                                                                                                    |

Therefore the protected preflight must obtain the actual definitions and hashes of
both Trip functions, the Core predicate and read-state trigger before choosing a
forward. The source proof cannot answer which replacement is installed in DEV.

The later dormant forward
`supabase/dev-forward/core-v2/20261014000300_trip_core_v2_finite_activation_contract.sql`
requires the real Trip gateway session but rejects LOGIN on all three gateway/writer
roles. `createTripPgConnection` logs in directly as that same Trip gateway. They
cannot form a live connection/admission chain together. The forward also couples
Trip creation to Core CREATE_ITEM/P1/P3/MANUAL activation, which WP05-D does not
authorize. This is a source-proven activation-contract gap; its actual Hosted
installation state has not been inspected and must not be inferred.

Changing the password, using a Reader/admin login, SET ROLE, impersonating a Session,
or deleting the LOGIN denial from the Core finite function would not resolve the
owning contract safely. None is proposed.

## Recommended bounded contract revision

Give the **existing Trip Create port** its own exact-target admission; retain the
existing Core finite function, Core command gate and Core permissions byte-for-byte.
This is one capability guard, not a second queue, authentication system or generic
permission framework. It introduces no new database principal. The separately
approved future provisioned identity remains exactly `otr_trip_create_gateway`.

Proposed owning SQL path, not yet registered or created:
`supabase/dev-forward/trip-create/20261016000100_trip_create_finite_contract.sql`.
Before materializing that forward, the owning reviewer must approve this schema
and obtain actual DEV function/role fingerprints. A protected application must
reject a mismatching preimage rather than rewriting unknown deployed functions.

The new private table would be CLOSED by default:

```sql
create table public.trip_create_activation_gate (
 singleton boolean primary key default true check (singleton),
 enabled boolean not null default false,
 actor_account_id uuid, trip_id uuid, operation_id uuid,
 request_payload jsonb, started_at timestamptz, expires_at timestamptz,
 check (
  (not enabled and actor_account_id is null and trip_id is null
   and operation_id is null and request_payload is null
   and started_at is null and expires_at is null)
  or
  (enabled and actor_account_id is not null and trip_id is not null
   and operation_id is not null and request_payload is not null
   and jsonb_typeof(request_payload)='object'
   and octet_length(request_payload::text)<=2048
   and coalesce(request_payload->>'tripId'=trip_id::text,false)
   and started_at is not null and expires_at is not null
   and isfinite(started_at) and isfinite(expires_at)
   and expires_at>started_at and expires_at<=started_at+interval '15 minutes')
 )
);
insert into public.trip_create_activation_gate(singleton) values(true);
alter table public.trip_create_activation_gate enable row level security;
revoke all on public.trip_create_activation_gate
 from public,anon,authenticated,service_role,otr_trip_create_gateway;
```

Only a reviewed administrator may stage/close its one row. No setter or table
grant reaches the runtime principal. UUIDs and exact request JSON bind one retained
creator intent; changing only a Trip UUID cannot admit another queued operation.

The proposed security-definer predicate has this fixed signature:
`trip_create_finite_scope_allowed(actor uuid, trip uuid, operation uuid)`. It must:

- require real `session_user='otr_trip_create_gateway'` and an exact operation;
- lock the one gate row FOR SHARE, compare Actor/Trip/operation and PostgreSQL time,
  and require the original request JSON separately inside CREATE;
- allow nullable Trip only for same-operation receipt lookup; the subsequent receipt
  lookup must repeat the check with its persisted Trip;
- reject superuser/BYPASSRLS/CREATEROLE/CREATEDB/REPLICATION/INHERIT, any gateway role
  membership edge or owned object, and reject changes to the reviewed exact ACL;
- accept the dedicated Trip LOGIN only when `rolconnlimit=1` and its finite
  `rolvaliduntil` is no later than the armed scope expiry; every other protected
  Core role remains NOLOGIN and unchanged;
- return false when closed, expired, unprovisioned, on any catalog mismatch, or for
  another Actor/Trip/operation. Grant EXECUTE only to the existing Trip gateway.

This revision requires Owner review because the existing reservation admits no
runtime LOGIN. It does not grant one now. The existing dedicated principal's
private password custody must be separately approved before a live test; no new
credential or existing Reader/admin credential is prepared or reused here.

## Exact changed interfaces and integration points

| File / owning object                                                                             | Minimal proposed change                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New forward above                                                                                | Create the CLOSED private Trip gate and fixed predicate. Replace only the two existing Trip command/result bodies with their exact current implementations plus operation/payload gate checks. Keep receipt insert, Trip insert, creator trigger and original idempotency checks unchanged.                                                                         |
| `public.trip_create_command`                                                                     | Before receipt reservation: check predicate with `p_actor,p_trip,p_operation`; compare constructed `payload` with the armed `request_payload`. Recheck before returning.                                                                                                                                                                                            |
| `public.trip_create_result`                                                                      | Before lookup: predicate with `p_actor,NULL,p_operation`; after lookup: predicate with the persisted Trip. Preserve current creator/membership/read-state checks; retain the original receipt.                                                                                                                                                                      |
| `public.trip_core_finite_read_state_guard`, **only if that dormant guard is actually installed** | In its `elsif session_user='otr_trip_create_gateway'` branch only, validate the existing same-transaction Trip receipt operation against the new Trip predicate before empty read-state INSERT. Retain the Core gateway branch, all Core write checks and every other caller unchanged. If absent, do not install the Core finite forward merely for Trip creation. |
| `backend/src/tripCreatePgStorage.ts`                                                             | Replace its Core predicate query with `SELECT public.trip_create_finite_scope_allowed($1::uuid,$2::uuid,$3::uuid) AS allowed`, passing actor, optional Trip and the original operation. Preserve one lease, transaction, pre/post checks, rollback, error mapping and receipt-first semantics.                                                                      |
| `backend/src/tripCoreV2PgConnection.ts`                                                          | No alternate identity or SET ROLE. Reuse unchanged `createTripPgConnection` and its direct verified-TLS fixed-principal checks.                                                                                                                                                                                                                                     |
| `backend/src/serverCapture.ts`                                                                   | Only after protected contract/custody acceptance: compose `createTripPgStorage(createTripPgConnection(approvedPrivateConfig))` into the existing `startDevBackend({tripCreatePort, captureMaterialCustody})`. Retain Capture custody and existing close handling. No Core connection, provider, Reader or public environment credential.                            |
| Accepted Mobile TCL02 runner                                                                     | Remains default CLOSED. A separately approved exact Account/Trip/create-operation target is required; no startup-wide or account-wide queue release.                                                                                                                                                                                                                |

The SQL delta cannot be reduced to removing `rolcanlogin` from the Core guard:
that would both weaken an unrelated boundary and leave Trip-only activation coupled
to Core. Actual deployed preimages determine whether the read-state branch delta
is needed; no speculative Hosted migration inventory is asserted here.

The Owner decision is specifically whether to approve **Trip-only finite admission
and its dedicated bounded LOGIN**, rerouting the Trip adapter and the Trip-specific
SQL checks to that admission. If the dormant replacement bodies are installed,
their existing Core-predicate calls must be replaced too; adding a new guard alone
cannot make them run. The optional read-state trigger branch is another mandatory
preimage-dependent delta. Preserving the Core predicate body does **not** mean no
protected contract change or immediate Runtime readiness. The new admission stays
CLOSED until separately reviewed SQL, actual principal custody, exact target/time
staging and Backend composition are all accepted.

## Acceptance, data impact and rollback

Before any protected execution: independently review the completed forward against
actual read-only DEV preimages, then exercise it in an existing disposable synthetic
PostgreSQL fixture. Required negatives are closed/expired scope, wrong actor/Trip/op/
payload, extra privilege/membership, unlimited or overlong LOGIN, Core write attempts
and direct business-table access. Positive checks cover exact replay, lost response,
one Trip/owner/member/receipt, empty Core state without a certificate, expiry rollback
and original request/IDs retained. Current local TCL02 tests are not this SQL proof.

Any later real Owner window must explicitly cover both Trip creation and release of
the named NZD25 Expense: accepted Trip completion can wake the existing dependent
Expense worker. Do not describe it as a read-only Trip test. Reference Trips and
unrelated pending operations are outside the target. No acceptance is claimed here.

Close HTTP/Native runner first; close the Trip gate; set the dedicated role NOLOGIN
and revoke its staged runtime credential through its owning custody path; retire its
one connection. Restore exact Backend startup preimages and reviewed function bodies
only after the gate is closed. Keep every accepted Trip/member/receipt/Expense and
local intent. Do not delete business rows, reset the device, make replacement UUIDs,
or restore an old database. Expired/unknown acknowledgements recover by the same
receipt under a new explicit same-target window, never by a blind second CREATE.

Readiness: concrete protected-contract proposal available for review; not an
authorized/applied migration, provisioned connection or deployable live activation.
