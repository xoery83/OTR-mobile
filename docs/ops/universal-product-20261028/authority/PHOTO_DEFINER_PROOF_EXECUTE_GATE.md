# Photo nested definer proof EXECUTE — exact repair Gate

Status: Owner approved; installed and independently verified2026-11-01T07:31:11Z. Exact OID/Owner/body retained; maintenance graph/schema ACL restored. Photo Golden Slice subsequently passed; PNG business authority safely closed. No new model execution used for this repair.

## Actual failure / exact cause

At 2026-11-01T07:17:38.262Z, normal Native confirmation of retained Batch
794b02d7 / Task96ce2929 / i1 failed in Source publication SEAL with SQLSTATE42501:
permission denied for function trip_source_read_sustained_png_proof.

Actual DEV tuqigdxrvrerfewsxqgm readback: CoreWriter already EXECUTE=true;
postgres EXECUTE=false and SUPERUSER=false. The chain is
CoreWriter INSERT → trip_sustained_import_p1_guard (SECURITY DEFINER postgres)
→ trip_source_png_reviewed_evidence (SECURITY DEFINER postgres)
→ trip_source_read_sustained_png_proof (SECURITY DEFINER SourceWriter).
Nested EXECUTE is checked against postgres. Source reads and projection already
pass; no candidate/item/receipt has been accepted for this operation.

## Exact requested change

Only grant EXECUTE on existing
public.trip_source_read_sustained_png_proof(uuid,uuid,uuid,uuid,bigint)
to existing postgres role. OID67149, Owner SourceWriter, body SHA256
`c94c9e52951e7f58e7cead7197dadae00d1da3189e4804431015febe370a3e83` unchanged. No PUBLIC/authenticated grants.
The helper still requires session_user=CoreGateway, current_user=SourceWriter,
matching Actor/Trip GUC, read-committed isolation and the original owning facts
checks. This does not permit postgres sessions or arbitrary account access.

One transaction uses only the existing SourceWriter→postgres postgres-grantor
edge OID64306: ADMIN=false remains; INHERIT/SET false→true→false to SET LOCAL
ROLE SourceWriter and grant the one EXECUTE. No new edge, role, schema CREATE,
table GRANT, RLS, function body, Secret, Provider budget or new business type.
Full pg_auth_members including OIDs and raw public schema ACL must be identical
before COMMIT; any mismatch or failure rolls back the whole transaction.
Function OID/Owner/body/ACL CAS and current candidate/item/receipt absence checked.
Lock timeout3s / statement timeout20s; same shared protected-state advisory lock.

Install SQL SHA256: `074b52afbfd37d46d773cded0684570ee5e835f44245260b8cda61b147de361c`.
Before ACL: `{otr_trip_source_writer=X/otr_trip_source_writer,otr_trip_core_v2_gateway=X/otr_trip_source_writer,otr_trip_core_v2_writer=X/otr_trip_source_writer}`.
After ACL: `{otr_trip_source_writer=X/otr_trip_source_writer,otr_trip_core_v2_gateway=X/otr_trip_source_writer,otr_trip_core_v2_writer=X/otr_trip_source_writer,postgres=X/otr_trip_source_writer}`.

## Execution and preservation

After approval and independent review/local reproduction, install once under the
short resource-level SQL lease. Reconcile actual ACL after any UNKNOWN; do not
blindly rerun. Resume normal Native confirmation of the SAME candidate:
Candidate3bdc40b7-add4-8902-b8fa-f3e8773652ef,
operation4f095d9c-449e-8456-a134-c69e9c33f3bb,
Itemc59d3d03-6830-84e8-8579-02a59fe624fa,
QA Accountf4b059c5 / Trip825f79b2.
Do not repeat Vision or alter any previous result/hold/receipt.

Owner's latest one-hour execution extension remains bounded by independent
08:00Z close /08:05 watchdog, no later than08:10Z SQL expiry if extended, and
original08:48:56Z hard expiry. Expiry was independently CAS extended07:35→08:10Z under Owner’s explicit additional hour; all other policy fields unchanged. No automatic extension.

Before-use inverse SHA256 `919812d6fd9db13712112d34836414cbcc9f7bcbae75cb061e6b6816329bb57d` revokes only this EXECUTE,
requires exact postimage, PNG CLOSED and no candidate/item/receipt. It restores
the same maintenance edge/graph/ACL transactionally. After publication/use,
close PNG writes and retain compatible proof readers/originals/receipts; do not
reverse a dependency under accepted or unresolved operations. Never delete data.

Focused isolated PG reproduced missing-EXEC RED, single-grant GREEN, wrong Actor/session denial, REVOKE denial and rollback. Exact maintenance sections also passed non-superuser forward/inverse/full-role-graph/schema restoration and injected-failure rollback. Independent focused Review: NO_BLOCKER. Actual live preimage/Candidate/Item/receipt CAS remains mandatory. Evidence in photo/definer-proof-execute/. This Gate is required solely for the new protected EXECUTE and
single-transaction maintenance edge; ordinary software and business retry
permissions are already approved.
