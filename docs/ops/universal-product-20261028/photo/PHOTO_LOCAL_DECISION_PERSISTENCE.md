# Photo local decision persistence — 30 October 2026

Status: IMPLEMENTED / LOCAL_PASS in the isolated Photo worktree. No shared
migration registration, default factory/UI caller, App cold recovery, Source/Task
change, paid call, DEV schema/permission or runtime activation is included.

## Local-only implementation

The Capture-owned child record in capture_photo_import_decisions is keyed by
existing (account_id,input_id). Its five fields are Account, input, CAS revision,
strict <=4096-byte decision JSON and timestamp. The unregistered definition has
no migration ID and is absent from the application migrations array. No existing
migration string, C3 manifest/input fact, queue or Flight diagnostic table changes.

The new repository reuses createCaptureSubmissionTransactionStore,
createLocalCaptureTransactionStore, normal Account context and Account Apply Gate.
It loads and hashes the retained original inside the same SQLite transaction;
no nested repository transaction, provider/request operation or dispatch is added.

save(context,jobId,expectedRevision,decision,signal?) writes only a current exact
original. Identical replay returns the existing revision before CAS comparison.
A different value needs the current expected revision. Re-screening cannot erase
an explicit Continue/Skip. A lost COMMIT acknowledgement can be reconciled with
read on the same Account/input; identical resubmission adds no revision or work.

read(context,jobId,inputId) returns null or the exact stored choice/revision and
CURRENT / ORIGINAL_CHANGED. The latter retains history and is not executable.
The process-local Account generation is never persisted; reads require a newly
captured current context after restart. No choice can claim that a Provider call
or Core save ran, completed or was canceled.

Capture revision is deliberately exact. Legal Trip assignment can make a saved
choice ORIGINAL_CHANGED. The user must re-screen and explicitly confirm again;
there is no silent pin transfer or automatic reset. This conservative limitation
can be refined only with an owning immutable-original versus scope contract.

## Minimal serial integration adapter — not applied

The designated shared SQLite Writer chooses the next legal ID from latest main,
then registers the existing definition without modifying prior migrations:

```ts
import { capturePhotoImportDecisionsDefinition } from "./migrations/capturePhotoImportDecisions";
// In the unique Writer's migrations array, using the actual next approved ID:
{ id: NEXT_APPROVED_SQLITE_ID, ...capturePhotoImportDecisionsDefinition }
```

Import default composition may then construct
createCapturePhotoImportDecisionRepository using the existing initialized database,
normal getAccountId and Capture storage dependencies. Do not open it from UI or
invent a new database. Reopen projection/UI choice wiring remains a separate
serial owning integration; this repository has no installed default caller.

## Validation

Nine directed/regression suites110 tests PASS (12 new real file-backed SQLite
checks plus98 prior Photo/OCR/Capture checks); typecheck, changed-code lint and
format PASS. The SQLite tests cover reopen with UNCERTAIN/Continue/Skip, revision
CAS/competing writes, identical replay, lost ACK recovery, Account/generation,
pre-COMMIT cancellation/Account-change rollback, current-origin mismatch,
explicit re-confirm after Trip assignment, malformed rows, SQL scope/retention
checks and unchanged C3 facts/queue. This is local SQLite recovery proof, not an
actual Native App restart or Photo Vision E2E. Existing model costs/Source/Task
identities are untouched. Deferred mixed-Batch continuation remains unimplemented
as specified in PHOTO_OWNING_INTEGRATION_DELTA.md; a decision row does not fix it.

## Retention and Account compatibility follow-up

The real existing C3 input/header and LocalCapture payload/reference delete guards
continue to reject deletion with a Photo child record installed. The ordinary
captures.deleteCapture path also rejects deletion of the accepted retained
original. Attempts to reparent Photo/C3/Capture/payload Account/input identities
fail without altering C3 rows, original bytes or the saved choice. Two additional
real-SQLite tests pass; the latest repository suite is14 PASS. Prior joined
Photo/Capture regression remains9 suites110 PASS before these two added tests.

At source baseline411c5317 accountLocalState.ts contains legacy-adoption updates
only, not a purge/cleanup implementation. Auth confirmed there is no current
cleanup/delete list; normal Logout/Switch retains Account-isolated local data.
No Auth DELETE adapter is required or implemented, and no fictional account-purge
PASS is claimed. Tests use normal UUID Accounts, not legacy/Guest Photo adoption.

The actual remaining Auth compatibility point is its empty-Guest schema allowlist.
Auth owns that change and its empty-table/business-row/unknown-future-version
negatives; the parent Registry Writer owns fresh-lineage migration registration.
The proposed next75 is not registered by this worktree. No Auth file, allowlist,
shared registry or unknown-version policy is modified here.
