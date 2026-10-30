# Photo owning integration delta — 30 October 2026

Status: integration proposal after software slice0e9536d3. A local-only unregistered
repository/schema definition was subsequently implemented; see
PHOTO_LOCAL_DECISION_PERSISTENCE.md. No registered migration, shared
interface, Task identity, SQL, DEV Gate, Provider or UI activation is implemented.
The parent Delivery Owner remains the Integration/DEV/main Writer.

## 1. Persist decisions under existing Capture ownership

C3 Batch headers/manifests and accepted inputs are immutable. The existing
capture_local_interpretation_results belongs to the historical Flight diagnostic
queue and cannot store Photo choices. capture_batch_assessment_observations is
an immutable projection with retained caller-owned candidate decision history;
it is not a new decision authority. Do not repurpose any of these records.

The smallest candidate is one Capture-owned **per-input child state**, not another
queue, Import Activity system, upload lifecycle or Source authority:

| Column | Proposed local representation |
| --- | --- |
| account_id | Existing Account ID; part of PK/FK |
| input_id | Original accepted C3 input UUID; part of PK/FK |
| decision_revision | Existing safe-integer/CAS convention, initial1 |
| body_json | Strict photoImportDecisionSchema value, canonical JSON, <=4096 UTF-8 bytes |
| recorded_at | Owning repository timestamp; not execution permission |

Proposed table name: capture_photo_import_decisions. PK(account_id,input_id),
FK(account_id,input_id) to capture_submission_inputs ON DELETE RESTRICT. The body
retains version1, original pin, relevance/reason and explicit UNDECIDED /
CONTINUE_WITH_AI / SKIP. It contains no OCR text, file URI, model response,
credential, queue claim, retry schedule or execution outcome. Source/Task/Provider
receipts remain in their existing owning stores.

A repository must check current Account/generation before and inside the existing
Account Apply Gate/SQLite transaction. Insert requires an existing accepted IMAGE
and matching retained original. Choice update takes expected decision revision
and exact current pin. Identical value replay returns the existing row without
allocating another revision; conflicting CAS rejects. Malformed, mismatched or
missing original is unavailable, not automatically re-screened or re-submitted.
An OCR retry cannot overwrite an explicit choice. No historical auto-backfill.

Do **not** persist the in-process Account generation as a cross-restart identity.
Cold reopen captures a fresh normal Account context, reads only that Account's
rows, validates the strict body and current original, then projects them alongside
the original Batch/input order. UNCERTAIN/UNDECIDED still waits; Continue still
requires existing Source/Provider qualification; Skip keeps the original.

The current software pin also carries Capture revision. Legal Trip assignment
can increment that mutable revision without replacing the payload. Before durable
installation, the owning contract must choose immutable accepted-original revision
versus current scope revision explicitly. Never silently rebind a recovered choice
to changed bytes or widen its Trip/Source authority. The current read-only adapter
conservatively rejects any late pin change; it is not yet a durable choice writer.

### Unique Writer file changes

- New migration candidate: src/data/db/migrations/capturePhotoImportDecisions.ts.
  Assign its ID only against the latest accepted SQLite lineage, not this old
  worktree's numeric tail. No C3 immutable trigger removal/rebuild is proposed.
- Shared src/data/db/migrations.ts registration: designated Native/DB Writer only.
- New owning repository: src/data/repositories/capturePhotoImportDecisionRepository.ts
  and focused SQLite tests, reusing Account Apply Gate and current SQLite patterns.
- src/domain/capture/photoImportRelevance.ts: finalize the above revision semantics;
  remain a decision value, never Source/paid-call authority.
- src/domain/capture/captureSubmission.ts and
  src/data/repositories/captureSubmissionRepository.ts: only the agreed read-model
  extension/reopen projection, outside immutable intake facts, by one Writer.
- Import-owned UI/default composition can then explicitly call
  src/data/operations/universalPhotoRelevance.ts and the repository. Shared
  useUniversalCapture / defaultUniversalOriginalSource integration stays serial
  with PDF; no shared Navigation/Session/DayFeed/Sync modification is needed.

## 2. Preserve mixed-Batch execution identities

Current code evidence:

- backend/src/universalBatchSource.ts prepares a fixed Run/Task identity from
  Actor/Trip/Batch. Once a binding exists, its input set must match exactly or
  prepare rejects OPERATION_KEY_REUSED.
- src/data/operations/universalCaptureConsumer.ts recovers that owning Task and
  explicitly rejects a resumed different Task ID. Its terminal Task is immutable.
- backend/src/universalRegisteredTaskDraft.ts still registers modalities:[TEXT].
  Declaring IMAGE in a static model profile does not change this qualification.

Therefore a late Continue cannot append an image to an already-successful Task,
change its request hash, reset it, or replay successful text/PDF Sources. A local
choice record alone does not solve this. Do not mint another Batch to hide it.

The required owning extension is an explicitly qualified continuation selection
within the **same retained Batch**, covering only legally eligible, not-yet-executed
image Sources. It must retain the original completed Task/results and use existing
Run/Task/Provider/Usage records, immutable exact-source pins and budget admission.
The Backend, not arbitrary client JSON, must establish that selection. Its stable
identity, lookup and Results aggregation need one owning contract before code;
this proposal does not choose or issue a new Task identity.

Source states must be read before selection: succeeded material/result is reused,
UNKNOWN remains unresolved and cannot be replaced, waiting images remain pending,
and a failed unrelated Source must not erase successful or untouched inputs. UI
projects per-input status from those owning records. Original Batch order remains
unchanged; one image decision does not block an otherwise qualified text/PDF
selection. No automatic calls on reopen.

### Unique Writer file changes

- backend/src/universalBatchSource.ts: explicit owning selection/lookup contract,
  preserving the existing fixed-binding behavior for already-created Tasks.
- Its existing owning SQL ports trip_source_find_sustained_universal_binding and
  trip_source_begin_sustained_universal_inputs: determine the exact protected
  function/schema difference from actual approved definitions before proposing
  installation. No SQL change is supplied or implicitly authorized here.
- backend/src/universalRegisteredTaskDraft.ts: IMAGE requirements only after real
  original-image material and scoped Provider qualification are established.
- src/data/operations/universalCaptureConsumer.ts and existing import transport /
  result DTOs: consume qualified continuation lookup and aggregate existing
  Batch results without treating same-Batch identity as permission to replay.
- Source image preparation and region-evidence Review/Admission remain their
  existing owning ports; do not convert visual regions into invented text spans.

Until this contract exists, retain deferred images and present the honest waiting
state. Do not claim the full mixed-Batch continuation acceptance. Single-image
software/qualification work can proceed independently of this missing path.

## 3. Minimum negative/recovery tests before activation

- Existing C3 manifests, accepted inputs and immutable triggers remain unchanged.
- Account isolation, same-Account generation transition and transaction cancellation
  withhold stale choice writes and late reads; no client-forged Account identity.
- Choice version/JSON bounds, exact original pins, ordinal and expected revision
  reject corruption/conflict. Same choice replay does not add a revision.
- Cold restore uses a new current context and restores UNDECIDED/Continue/Skip
  exactly. Changed/missing original does not silently reset or dispatch anything.
- Skip retains bytes; low/empty/unsupported OCR is UNCERTAIN; no textless-photo
  automatic IRRELEVANT claim. Continue/Skip remains distinct from an OCR verdict.
- No default runtime or UI paid dispatch occurs while IMAGE qualification is absent.
- Mixed Batch successful Sources/Tasks retain their IDs/results/call receipts;
  late image Continue cannot resend them or mutate completed request material.
- UNKNOWN does not allocate a replacement call or Task; repeated Continue/reopen
  looks up the same owning selection before any new execution.
- An unresolved image does not turn independent qualified text/PDF work into failure.
- Real Image Input still includes qualified original/full-layout pixels and hash;
  existing one-image/4MiB limits, normal Auth/Trip and budget controls remain.

This document is an integration proposal only. It installs no new Schema, business
Authority or automatic negative classifier and makes no cold-recovery/Photo E2E PASS.

Follow-up: Auth confirmed no current purge/delete list; Logout/Switch keeps
Account-isolated data. The actual cross-lane registration prerequisite is its
empty-Guest schema allowlist, owned by Auth. Existing retention/reparent behavior
was tested on real SQLite without editing Auth; see
PHOTO_LOCAL_DECISION_PERSISTENCE.md. Do not add a cleanup system for this slice.
