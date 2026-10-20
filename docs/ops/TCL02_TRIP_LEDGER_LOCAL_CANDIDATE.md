# TCL02 local Trip receipt and Ledger reconciliation candidate

Source-only candidate based on accepted TCL01 `ee296a6`. No Hosted connection,
deployment, Native operation or real Nelson queue release was performed.
`docs/CURRENT_IMPLEMENTATION_STATE.md` remains parent-owned.

## Local implementation

- Existing Trip Create worker remains receipt-first. Its original Account scope
  reaches repository receipt application, preserving same-account ABA fencing.
- Only the matching creator intent blocked by `TRIP_INITIALIZATION_REQUIRED` may
  become pending. The dormant Native composition requires an explicit immutable
  Account/Trip/create-operation target; another local Reference-style Trip is not
  resumed or dispatched. Normal startup installs no runner and stays CLOSED.
- Receipt application maps the provisional Person to the receipt owner Person
  inside the same transaction as Trip acceptance and CREATE_TRIP completion.
  The existing SQLite68 binding retains the original local UUID; the owning Trip's
  `owner_person_id` records its formal mapping. No SQLite69 is required.
- Current local Expense payer/creator/participant/split/payment/household references
  and unbound queue/causal-command snapshots map only typed Person fields. Titles,
  money, dates, valuations, operation UUIDs/idempotency keys and audit evidence remain
  unchanged. Existing authoritative members/capabilities win a bootstrap race;
  only a fully remapped provisional mirror is retired in that case.
- Attempted/bound/server-owned Expenses, unrelated Ledger mutation kinds, completed
  settlement/private-payment data, foreign actors and identity collisions fail
  closed for owning review. The source pack does not generalize financial repair.
- Existing dependency wake logic can release Expense CREATE only after the mapped
  Trip commit. Expense successors still require their predecessor's APPLIED receipt.
  No second queue, scheduler or retry lifecycle is introduced.
- The existing operational Ledger cycle has an optional, default-null Trip runner
  before Expense selection. `createNativeTripCreateSyncRunner(target, gate)` composes
  the existing repository/queue/transport/worker; installation and gate enablement
  remain a separate explicit activation. No Core scope, certificate or capability
  is derived from a Trip receipt. Local role/capability markers stay local until an
  owning Ledger bootstrap supplies actual server observations.

## Protected Backend gap: wiring alone is insufficient

The current Capture Backend entry point calls `startDevBackend` with Capture
custody only. `startDevBackend` already accepts `tripCreatePort`; the dormant
composition would be:

```ts
tripCreatePort: createTripPgStorage(createTripPgConnection(approvedPrivateConfig));
```

This is a reviewable composition seam, **not a deployable activation delta**:

1. `backend/src/tripCoreV2PgConnection.ts` hardcodes a PostgreSQL login as
   `otr_trip_create_gateway` for `createTripPgConnection`.
2. `supabase/migrations/20261013000500_trip_create_owning_port.sql` creates that
   principal as NOLOGIN. No approved credential was created or reused here.
3. The dormant finite contract
   `supabase/dev-forward/core-v2/20261014000300_trip_core_v2_finite_activation_contract.sql`
   requires `session_user='otr_trip_create_gateway'`, but its
   `trip_core_finite_scope_allowed` returns false if that principal has LOGIN.
   Thus enabling LOGIN to satisfy the current connection closes the current gate.
4. That finite gate also couples Trip creation to the Core CREATE_ITEM/P1/P3/MANUAL
   activation shape. TCL02 cannot silently open or redesign Core authority.

An owning protected-contract decision must resolve this contradiction before a
legal live port can be composed. Catalog Reader/service-role/admin credentials
must not be substituted. No role, ACL, Auth/RLS, schema, finite gate, credentials,
Backend image or deployed startup code is changed by this candidate.

## Validation boundary

Controlled local SQLite tests cover receipt-first recovery, Account ABA, atomic
rollback, provisional-to-formal mapping, a real Ledger-bootstrap race, original
dependency release, existing Expense CREATE→DELETE ordering, response loss and
cold reopen without duplicate Trip/member/Expense/operation creation. Other
pending Trips remain unchanged under explicit targeting. Mock transports exercise
existing workers and formal DTOs; they are not Hosted or Native evidence.

TCL02 real end-to-end readiness remains blocked by the protected contract above
and separate activation/acceptance. Preserve Nelson Trip
`b67d35d9-f338-45b9-9344-5038f86a22d1`, actor
`3a44420f-ec2b-4d7e-9770-410a5ed5e77e` and CREATE_TRIP operation
`1e055353-cd8f-4cd8-a0cd-052e6e66b279`; this source-only work reads/writes no device
database and releases none of their real operations.
