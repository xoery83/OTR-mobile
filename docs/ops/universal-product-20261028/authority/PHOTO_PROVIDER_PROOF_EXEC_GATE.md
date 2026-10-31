# PHOTO_PROVIDER_PROOF_EXEC_GATE

Status: prepared, independently reviewed NO_BLOCKER; NOT approved or installed.

## Actual Golden Slice and first failure

Same approved Batch d56f2cbc-43da-46c0-84d0-462c98b69689, Source03109f59-894f-4ddf-aad9-090d0920092f,
representation06e6bb76-f754-47d2-9475-11148147ff6f. Normal App VERIFY b2fcc424-7f24-898b-9f0d-65445e56e403
is now FINAL/APPLIED, attempt75ee87dc-8c98-4632-8364-1088abbde15e. Source upload remains FINAL/APPLIED.
Task13792ae2-123a-8c3b-8a64-922cc8902350 was accepted, but actual RUNTIME_PREPARATION at
2026-10-31T18:12:13Z failed UNIVERSAL_SOURCE_CLOSED. No model Attempt or Provider ledger call.
Its original deadline 2026-10-31T18:20:33.121Z is expired and must not be reset.

Exact chain: universalContinuousHost.ts executeQueued → universalRuntime.ts lifecycle.priceSchedule →
universalPersistenceHost.ts currentScope → universal_import_read_continuous_scope →
universal_import_continuous_scope → universal_import_source_current → trip_source_png_original_facts.
The Provider Source guard is SECURITY DEFINER owner postgres; the PNG helper is owner SourceWriter,
ACL only SourceWriter. postgres has no EXECUTE. Its permission exception is caught and becomes false,
then UNIVERSAL_SOURCE_CLOSED. Source-side checks legitimately pass because SourceWriter owns the helper.

## One protected permission delta

Only original DEV project tuqigdxrvrerfewsxqgm, Backend178.105.151.143/otr-dev-backend.
QA Account f4b059c5-8241-4ffb-aa15-37fa25474543 / Trip825f79b2-4a9d-4535-a62e-43000ca50c4a.
Default CLOSED transaction grants EXECUTE on this one existing helper to postgres only:
public.trip_source_png_original_facts(uuid,uuid,uuid,uuid,bigint).
OID67145, MD5 a2945b7def0e9e5a19d4a66bd1e5a951, Owner otr_trip_source_writer, body unchanged.
Before ACL: {otr_trip_source_writer=X/otr_trip_source_writer}.
After ACL adds only postgres=X/otr_trip_source_writer. Provider Gateway/Meter still have no direct EXECUTE.
No function-body, Schema, RLS, table GRANT, new role/member edge, Secret or budget change.

To issue the owner GRANT, existing SourceWriter→postgres self-granted edge OID64306 temporarily changes
SET false→true→false in the same transaction. ADMIN/INHERIT remain false. No schema CREATE.
Full pg_auth_members graph including OIDs and public schema ACL must exactly match before COMMIT;
any failure rolls the entire transaction back. Exact helper OID/Owner/body/ACL and CLOSED policy CAS.

## Same scope execution and expired input

After approved install, normal App continues the original Photo scope and existing Review/Plan/Admission/Core;
not a new Parser/Provider/Save path. Old Task deadline/UNKNOWN/originals/markers/receipts remain unchanged.
Because the current normal API cannot reset the expired retained Run, authorize at most one replacement
normal App Batch + same42630B PNG Source + Run/Task in the same QA Account/Trip. No direct SQL object creation.
Before any replacement: read all retained same-image Task Attempts, Provider calls/reservations/UNKNOWN/results.
If any paid Attempt/call/UNKNOWN or recoverable result exists, stop new dispatch and reconcile retained identity.
The replacement consumes only the original unused maximum ONE Vision call, not an extra paid allowance;
10-minute Task/attempt1, existing caps and hard expiry2026-11-01T08:48:56Z remain.
No reset/retry of an expired Task, no second replacement after UNKNOWN without new Owner direction.
Select only an actual qualified P1 or P6; normal original/Trip/NEW/title/date confirmation is required.
No fabricated evidence, Manual fallback, Booking/Ticket or other P-family expansion.

All code/build/controller/QA tests finish CLOSED. Each Source execution ≤60 minutes, +45min close,
+50min independent watchdog, absolute SQL expiry and original hard expiry enforced. Before opening, reanchor
existing closer to the latest compatible healthy service from Native (currently2c037b20/imagea3a2d4e/capture6ac6c953);
no old image rollback. Independent Source close, worker inactive/EMPTY, timer completion required.

## Evidence, inverse and review

Isolated existing no-network PG: actual helper with qualified synthetic Source reproduces exact42501 before grant,
returns complete verified proof after single EXECUTE, rejects again after revoke. Non-superuser maintenance
forward/reverse PASS; graph/schema restoration enforced. Inverse blocks any matching PNG Provider ledger row
regardless of status (including reservation/UNKNOWN); fault exit rolls back all changes, no role/table retained.
This is focused adapter/ACL validation, not a new Hosted Vision PASS.
Independent narrow review NO_BLOCKER after inverse protections were corrected.

Reverse only CLOSED, independently zero SQLite Attempts, zero matching Provider call/reservation/UNKNOWN and
no in-flight dispatch. The inverse locks policy and checks absence of every same-QA/Trip/original-PNG call;
it never deletes rows, and may perform pure no-use permission removal after the original hard expiry.
After any model use or accepted result, do NOT inverse: close new writes and retain compatible reader/helper,
originals, Task, usage/UNKNOWN and Item/receipts. Never reverse accepted work or delete custody.

Frozen SQL SHA256:
- PHOTO_PROVIDER_PROOF_EXEC_FORWARD.sql: `0aff791e4eecb09827299f81889969baa23a58a1c8615dcb636a1c91ac9cf310`
- PHOTO_PROVIDER_PROOF_EXEC_REVERSE.sql: `475282df07ef7d528ea059729bcb52a49ccafabbd80eb739ec5443616337aed9`
