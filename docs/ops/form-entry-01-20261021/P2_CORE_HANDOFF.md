# P2 Manual Core integration — 21 October 2026

Base: FORM-ENTRY `755e3492` (complete `3423f273` P1/P3/P4/P5 chain). This adds the previously approved P2 Local Authority implementation, not a new profile or schema design. No Capture Source adapter/Import UI is merged: Source-reviewed commits remain closed without an independently supplied lawful source adapter.

- Existing SQLite69 TS SHA256: `a2ece35350d64cdc00ecb3a2f2ee4be1ff4f86aa79f4c3e4d442f5df693b1301`; SQL literal SHA256: `45f48e5bb3bb033c5734b9f1e3c53033c6bdec48e278abf03a37bf18b215acee`. Source bytes unchanged; SQL matches the approved TECHNICAL_FREEZE block.
- Registry adds missing69 before70. Runner still checks each ID, so an actual68+70 database applies69 once; no renumber, DROP, downgrade or fake migration marker.
- Journal baseline reuses the newer trusted Manual-reader account/current-owner/queue/certificate checks. Pending P1/P3/P4/P5 graphs remain under their existing reader and queue, separate from Local Committed Flight provenance; no false server certificate is constructed.
- Claim assessment accepts non-Flight pending commands only with valid same-account/Trip queue hashes and a validated same-target CREATE or accepted family. SET alone, unknown identities, missing queue pins, ambiguous duplicate CREATEs and existing Flight/legacy coverage stay closed.
- Existing transaction/batch/enqueue paths, Cover/Person queue exclusions and Forms description fields remain. Normal Flight/Day/Today/Journey Details readers now understand nullable server authority and journal revision.

Validation: 16 focused suites /139 tests PASS; full TypeScript, UI guard473/131, changed-runtime ESLint and formatting PASS. Actual temporary SQLite gap68+70→69 tests preserve every prior table row, Cover70 schema/FKs/photo, four legal pending Forms, and roll back a failed migration marker; retry/repeat/cold P2 journal reads pass. Normal Manual Save/recover/idempotency, queue-failure rollback, account fencing and accepted/local Reader tests pass.

Known unchanged baseline failure: `tripLocalManualReadRepository.test.ts` pending Hotel/floating09:00/no timezone case throws DAY_ZONE_INVALID. Reproduced on unchanged entry baseline, not a P2 regression; no TIME contract change included.

Native NOT RUN. AD5/Metro/5D09/A1A/Hosted untouched. Root must serially combine the P2 UI `edef9d27` and Chrome `0c92329c`, independently review the result, and qualify the actual69 startup before normal Native Save/Day/Details/cold verification. Rollback preserves all journal rows and committed data.
