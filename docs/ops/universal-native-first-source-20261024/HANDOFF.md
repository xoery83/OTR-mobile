# Native first Source preparation — isolated candidate

Base: Coordinator `1d0c979`. No DEV, Provider dispatch, GUI, installation or SQL execution.

## Actual wiring

`useUniversalCapture` now supplies the concrete Source preparation composition to the existing consumer. Only explicit Start, after exact HTTP503 `UNIVERSAL_IMPORT_CLOSED` or `UNIVERSAL_CONTEXT_UNAVAILABLE`, invokes it. Recover remains read-only; Auth, unrelated503, Provider failure and prior uncertain paid dispatch cannot trigger Source writes.

The composition reopens the retained C3 Batch, recovers Source command IDs via its stable admission key, reuses the owning Source repository and exact targeted Source queue, normal-auth Source transport, sealed Native catalog receiver and existing import catalog repository. Original FILE/FILES filename and bytes remain distinct from TEXT provenance. Unsupported original profiles remain blocked. No global queue is enabled.

After independent Source catalog refresh, the consumer re-reads the real Backend context. It never creates a Run or Task. If no lawful owning context is returned, `OWNING_TASK_READER_UNAVAILABLE` is preserved; Source registration is not AI success, Item Admission or Cloud backup. The finite trusted operator's reviewed Source-Run/Task bootstrap remains a separate existing prerequisite.

## Validation scope

- Consumer/composition/cold SQLite checks: 26 tests PASS; Auth/transport composition fixtures are synthetic.
- Actual SQLite close/reopen preserves the existing Source binding and exact Operation/Source/Representation IDs without another queue entry or Run.
- Typecheck, scoped ESLint and UI guard PASS. No user-facing copy or layout changes.
- Previous Backend independent Review remains scoped to fixed `adff007`; this increment requires Root independent Review.

## Data Path Checklist

1. Ownership: existing Cloud-shared Source registration; local C3 originals and binding/queue remain owning repository data. Task/Run remains Backend/Core-owned.
2. Local storage: unchanged schema; stable C3-derived admission key resolves persisted Source binding and exact operation.
3. Contract: existing Source command/transport/catalog path only; unchanged finite SQL/HTTP Gate required before a remote write can succeed.
4. Offline/conflict: existing targeted UNKNOWN/result reconciliation preserved; no blind replay, historical queue dispatch or Task creation. Repeated/cold Start recovers the same IDs.
5. Evidence: scoped local SQLite + deterministic L2 only; no Native/real Auth/Provider/DEV L3 claim.
6. Delta: reviewed Source/Universal deployment and finite activation, real C3 Batch pins, lawful Run/Task bootstrap and actual Native/DEV acceptance remain pending. Source-only registration cannot imply Task availability.

Root serial integration: cherry-pick this fixed increment or apply `/private/tmp/otr-universal-native-first-source-20261024.ROOT_SERIAL.patch` to the same source baseline; do not apply both. No shared server/startup/Trip/P1 files are modified.
