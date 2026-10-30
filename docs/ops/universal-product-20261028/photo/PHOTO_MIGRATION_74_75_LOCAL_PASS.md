# Photo candidate75 migration qualification — 30 October 2026

Status: LOCAL_PASS, unregistered candidate only. The new test uses the actual
runMigrations/getSchemaVersion and real file-backed SQLite, not a mock Runner.
It temporarily selects migrations1–74 and appends {id:75,...definition} only in
its isolated test process; finally restores the in-memory registry. No shared
registry source, application runtime, Auth interface or DEV database is changed.

Four tests PASS; typecheck, changed-test lint and formatting PASS:

- The actual Runner creates baseline1–74; normal Capture repositories submit one
  mixed TEXT/PDF/IMAGE Batch and the existing processing repository schedules its
  three PENDING validation operations. Candidate75 preserves C3 facts, Capture
  metadata, queue/events, exact original bytes and all pre-existing schema object
  SQL. Rows1–74 in schema_migrations and source migration IDs/names/SQL SHA256
  remain identical to their pre-upgrade snapshot. The PDF is the frozen synthetic
  fixture, not user material.
- After storing a Photo choice, reopening the real database and running migrations
  again neither reruns75 nor changes migration markers, old records or the choice.
- Failure immediately after75 DDL, before its marker and after its marker each
  atomically restores74, removes all candidate table/triggers/marker, retains
  original data/foreign-key integrity, and permits a clean upgrade after reopen.

The actual application remains unregistered. Root is the sole Registry Writer;
Auth owns empty-Guest allowlist compatibility. Auth's future/current main window,
latest SQLite lineage, registered75 and actual App restart remain separate checks.
No Session/Keychain/credential, paid Provider call, Source authority or Core write
is involved. Source test: src/data/db/migrations/capturePhotoImportDecisions.test.ts.
