# Trusted Source → Task preparation operator

Base `8c9bb16`, isolated-only. No shared Bootstrap/Trip/P1/HTTP mutation, deployment, DEV SQL/ACL, Provider call or Native operation.

## Closed local execution gap

The Source-only runtime already had the owning `prepareInputs()` command, and the Task loader already validated current Source/catalog/Auth and used the existing SQLite Task Repository/WakeQueue. Only documentation connected them. `scripts/import/prepare-universal-task.ts` now provides an executable trusted Operator entry using the **same** private capability reader, Source port and Task loader.

- `--prepare-once`: invoke the existing exact finite Run command at most once; independently read/validate its retained Source manifest afterward. An uncertain response never authorizes mutation retry.
- `--recover-only`: only reconcile the fixed owning Run, then hydrate/bootstrap the Backend-owned local Task through its existing repository; no Source mutation or paid call.
- A missing capability returns CLOSED. Missing/uncertain owning Run stops before Task. Source phase closes before Task phase. Task context must match the trusted Actor/Account/Trip/Batch/Task exactly, then Task runtime closes. No Native-supplied Task/Run identity and no new Task/Source/Queue authority.
- `readPreparedInputs()` is trusted runtime-only and invokes the existing owning Source reader, with normal Auth/Trip access before and after. Current finite original profile is UTF8; binary is rejected rather than relabeled.

Run the reviewed bundle in the existing Backend image only after the exact Source/Universal DEV Gate is approved. The Operator neither installs grants nor sets gates, credentials or execution windows. After it reports `TASK_CONTEXT_READY`, restart the same approved Backend image/config in Task stage; Native's existing context GET then discovers the durable Task. **Source registration alone remains insufficient.** No server startup or Native action implicitly runs this Operator.

## Evidence

[Local receipt](LOCAL_RECEIPT.json): existing isolated PostgreSQL source acceptance11 checks; new operator Recover crosses the owning Source reader using actual isolated-PG rows (driver/Auth synthetic) into actual SQLite Task/WakeQueue, followed by existing custody/HTTP/cold7 checks.22 scoped deterministic tests, TypeScript, scoped lint and Capture build PASS. The bundled executable returned CLOSED in a network-disabled read-only Linux container with no capability. No real Auth/Provider/Native/DEV acceptance claim.

## Exact remaining activation Gate

Reuse the reviewed Source original/pinned-result and Universal Source/profile SQL candidates, fixed Backend image, same trusted private runtime file and normal QA Auth. Gate must fix Actor/Trip, actual Native C3 Batch and original Source/Representation/Operation IDs/hashes, submission SHA, existing Task/Run/Attempt pins, <=900s window, source mutation/read limits and independent watchdog/close/rollback. Source-only Native catalog refresh precedes explicit trusted Run preparation; no V1 catalog parser relaxation. Provider activation/cost/call limits remain separately explicit within the same approved vertical slice, not granted by this Operator. No new SQL, Schema/RLS/GRANT or Provider profile is introduced here. Real Source registration → operator → existing Task context → paid interpretation/Native Results remains CLOUD_PENDING until those Gates and L3 receipts exist.

## Data Path Checklist

1. Source/Run remain owning Core data; Backend Task/Queue/custody retain existing ownership. Operator status is transient.
2. No new table/schema; existing Backend SQLite owns Task and queue state. App database/session are not opened or copied.
3. Existing finite Source command/read and Auth/catalog/Task loader, unchanged HTTP and SQL contracts.
4. Unknown begin is read back without retry; failure/close stops further phase. Recover cannot call Source mutation or Provider.
5. Scoped L2 and actual isolated SQLite/custody evidence only; L3 pending.
6. Root serial integrate this fixed increment; approve and execute existing exact Source/Universal Gate before remote use. Independent Review pending.
