# Photo sustained Run Input guard — precise default-CLOSED repair Gate

Status: CANDIDATE / NOT INSTALLED. Independent focused review NO_BLOCKER.

## Actual failure and smallest change

Same retained PNG Batch e7dfba6d / Source df39c9b2 / original 9bf0ad08 has
UPLOAD d2f59e69 and VERIFY 5cc29190 APPLIED/FINAL. Actual TaskPrepare at
2026-10-31T10:39:16Z fails SOURCE_BINDING / INPUT_STALE / P0001.
The actual HTTP input-set and all eight pin field fingerprints exactly match the
reconstructed Native pin; Source/representation/ancestry and current validator pass.
No SourceRun, Task, paid Vision or Save exists for this Batch.

Call chain: normal Native prepareTask → universalContinuousHost source.prepare →
trip_source_begin_sustained_universal_inputs → trip_source_begin_universal_inputs →
INSERT trip_source_inputs → trip_import_catalog_write_guard → trip_source_run_only_row
→ trip_source_sustained_run_row. Its current material CASE accepts original text or
PDF material only. The PDF helper explicitly returns NULL for PNG, raising INPUT_STALE.

Only add PNG CASE: ORIGINAL/BINARY/image/png, existing PNG scope IS TRUE,
exactly one scoped Source and existing trip_source_png_original_facts IS NOT NULL.
Retain input_valid, Actor/Trip, hash/count/revision, historical/confirmation and all
Run identity/state checks. TEXT and PDF branches remain byte-identical. Adjacent
manifest/Reader/Provider already enforce PNG proof and one input; no duplicate pipeline.

## Exact requested change and bounds

Only DEV tuqigdxrvrerfewsxqgm, same Synthetic QA Account
f4b059c5-8241-4ffb-aa15-37fa25474543 / Trip825f79b2-4a9d-4535-a62e-43000ca50c4a.
Replace one existing public.trip_source_sustained_run_row(text,text,jsonb),
OID66391, Owner otr_trip_source_writer, existing sole Owner EXEC ACL,
invoker, search_path=pg_catalog. MD5:
`8ef354beae3cb950d024ce17c7f200b5` → `661c2130343a42aaa987ecc84c95fd16`.

- [Install](../photo/run-input-guard/install.sql) SHA256 `de9cbdea005f87ab30a54caec6a3e48cc3bf21446d6fafd6facd5a0e5b73d5dd`.
- [Inverse](../photo/run-input-guard/rollback.sql) SHA256 `cb75c81f369aa3b8faf543518cf71a3935f21a86785ea29ee0559c4704f66c6f`.
- [Exact diff](../photo/run-input-guard/function.diff),
  [manifest](../photo/run-input-guard/manifest.json),
  [review](../photo/run-input-guard/REVIEW.md).

Fresh exact function/dependency and retained target CAS required. Both forward and
inverse require PNG=false/expiry=NULL, target MD5 c3cff8ff6d2c120908654222cd96189e,
and no Run for this Batch or Source. Drift aborts; no automatic rebase.
Use only the existing SourceWriter→postgres postgres-grantor membership edge:
temporarily set INHERIT/SET true and schema CREATE, then restore both before COMMIT.
Complete pg_auth_members including OIDs and original public ACL must match exactly;
otherwise whole transaction rolls back. OID/Owner/ACL/invoker/config also unchanged.
No new persistent table/column/schema/RLS/role/member/EXEC, credential use, budget,
expiry, cross-Account access or business type. No image replacement is needed.

## Verification and execution

12 isolated PostgreSQL body checks PASS: actual old guard rejects verified PNG;
new body passes; CLOSED/expired/stale/historical/missing Source/wrong hash/count/
confirmation/material/representation rejected. Existing fixture and actual PNG
scope/facts/input validator reused. A transaction-local pg_temp SECURITY DEFINER
wrapper supplies the actual SourceWriter calling context. The unavailable PDF
helper is represented only by its explicit non-PDF NULL return; full Begin, PDF
regression and full maintenance install are NOT claimed. No previously denied
fixture table/column additions were retried. Prior same-transaction maintenance
mechanism is reused from approved eba232fc; no new permission mechanism.

After approval: fresh READY checks, short resource-scoped Source function CAS lock,
install once, independent body/metadata/role/ACL/CLOSED readback, receipt, release.
Unknown installation requires readback before retry. No main/Host/global QA lock.
Then use existing independently verified close controller and original Photo window
bounds, normal App on the same Batch → first actual original-image Vision(max1,
original unused allowance) → Results → normal Review → unique PRIVATE/SELF P1 or P6
→ independent readback → Day/cold/idempotence → close. No new Batch/Source or model
allowance; existing Task is prepared normally, never reset. Hard expiry remains
2026-11-01T08:48:56Z. Each session <=60m, +45 close/+50 watchdog/absolute SQL expiry.

## Rollback and approval reason

Pre-use inverse only at exact postimage, exact target and CLOSED with no SourceRun.
Any accepted Run/Task/model call/result forbids inverse; close write scope and keep
compatible readers, original, upload/VERIFY/journals and all receipts. Never reset
or delete previous UNKNOWN objects. Transaction failure restores all changes.

This asks only for the newly changed protected function body and its exact temporary
maintenance wrapping. eba232fc approved a different function; ordinary software/
Standing Gate execution does not authorize changing this protected body. All
unaffected coding may continue while this one protected step waits.
