# P3 Form-scoped Interpretation v1

Owner V3 C3 local candidate, 2 November 2026. Import owns only
`src/data/operations/universalP3FormInterpretation.ts` and its focused test.
Native owns Form, review/adoption, navigation, repositories, Queue, Day Feed and
Sync. No existing consumer, service, feature flag, Source/Task lifecycle or
Admission interface is changed. No remote interpretation route is activated.

## Existing contracts

- Input: existing `UniversalImportResult` / `UniversalExecutionContext` from
  `src/data/api/universalImportContracts.ts`, parsed with their owning schemas.
  The caller obtains these through existing authorized Source/Task/result ports;
  this pure adapter cannot establish authorization or qualify original bytes.
- Field coverage: `../native-forms-p3-20261025/contract/FORM_AUTOFILL_FIELD_MATRIX.md`
  and adjacent `PRODUCT_DELTA.md`.
- Native candidate inspected read-only: `codex/native-focused-main-20261101`
  at `136742bef24783cc09a5b514952704500bf25703`, specifically
  `formScanResponse.ts` / `p3FormSuggestions.ts`. Its existing synthetic
  discriminants remain synthetic; this adapter never relabels real output as a
  `SYNTHETIC_STAY_SUGGESTIONS` response.

## Callable contract

`projectUniversalP3FormInterpretation({ result, task, capturedContext,
currentContext })` returns `null` on invalid wire data or any scope mismatch.
Otherwise it returns version `otr.import.p3-form-interpretation/1` with:

- `context`: required `accountId`, `tripId`, `formId`, `formType: P3`, draft/current
  `itemId`, account `generation`, UI `revision`, Core `itemRevision`, and `mode`.
  Create uses `itemRevision: null`; Edit requires a positive revision.
- `task`: original `actorId`, `batchId`, `taskId`, `requestSha256`. Actor, Account,
  Trip, Batch and Task must agree with the caller's existing owning Task context.
  An explicitly supplied activity must be `RESULTS_READY`.
- Original `sourceBindings` including Source, Representation, revision, hashes
  and optional PDF provenance. Text spans and image pixel regions are retained
  unchanged and remain observations rather than custody/Place/Person proof.
- `status` and `providerOutcome` preserved, including `LOCAL_FIXTURE`, ABSTAIN
  and UNKNOWN. Non-ready results never synthesize candidate fields.
- Independent P3 `candidates` with original temporary `id` / `token`, `fields`,
  `presentationTier`, `evidence` keyed by Native field name, `unsupported`, `unhandledEvidence`.
  Duplicate P3 IDs/tokens reject the entire result. Other families are excluded.
- Original `sourceObservations`, `canonicalWrites: false`.

Exported `universalP3FormInterpretationSchema` parses the formal output directly,
reusing the owning Universal Evidence and Source schemas. It checks candidate and
Source uniqueness, bound evidence aliases, canonical scalar types/ranges and
evidence/value agreement for every usable field. It rejects invented clears,
synthetic kind injection, ABSTAIN fields/review issues, and UNKNOWN/NOT_RUN candidates.
The projection itself passes through this schema before returning. This is DTO
validation, not evidence custody or authorization. Native's formal bridge may
wrap it as `SOURCE_STAY_SUGGESTIONS`; do not parse it as synthetic output.

`isCurrentUniversalP3FormContext(captured, current)` strictly parses and compares
every required pin. Native must recapture current Context before displaying a
late result and again before field adoption; a previously true check is not a
lease. Closing/reopening the Form needs a fresh `formId`. Core/UI changes,
Account/Trip switches, target changes and Create/Edit changes invalidate results.
Never rebind an old envelope to a new Context merely to pass this check.

## Field mapping and review

| Native field | Existing evidence paths                                            |
| ------------ | ------------------------------------------------------------------ |
| `title`      | `property.name`, `title`                                           |
| `location`   | `property.address` (authored text only)                            |
| `startDate`  | `check_in.date`, `checkin.local_date`, `schedule.start.local_date` |
| `endDate`    | `check_out.date`, `checkout.local_date`, `schedule.end.local_date` |
| `startTime`  | `check_in.time`                                                    |
| `endTime`    | `check_out.time`                                                   |

The existing civil-date helper accepts ISO or explicit English month/day/year;
no locale, year, timezone or duration is inferred. Clocks must already be HH:mm.
Aliases must agree after normalization. Uncertain, invalid or conflicting fields
retain their evidence and become `NEEDS_INPUT` without a patch. An ABSTAIN
candidate retains evidence and tier but has no usable fields or review issues;
it must not create mandatory field Review. A contradictory READY result with
provider outcome UNKNOWN or NOT_RUN is rejected rather than downgraded into suggestions.
The existing Universal host emits NOT_RUN only for an empty ABSTAIN result;
only SETTLED or explicitly labeled LOCAL_FIXTURE may carry candidates here.
Inverted date/time ranges suppress the affected temporal fields. Missing required
title/dates become `NEEDS_INPUT`; absent optional values remain absent, never
clear instructions. Same-day ranges remain reviewable under the current Native
draft semantics; the existing Save/Core qualification remains authoritative.

Unmapped extracted fields remain `UNSUPPORTED` with their original evidence.
There is currently no evidenced P3 notes path, so `description` is never invented.
Room, guest, contact, instructions, Booking/Ticket relations and arbitrary Source
Observations are not coerced into title/location or canonical fields. Native can
show these observations and preserve manual entry separately.

The Native bridge must use its existing field Review, preserve edited/cleared
fields, offer Keep/Replace for Edit conflicts, and perform explicit duplicate
update/separate/skip decisions. The adapter does not infer `targetItemId` from an
extracted candidate. Each selected Stay remains an independent draft and uses
the existing manual Save only after user review. Suggestions alone neither save
nor create Admission, accepted Place, membership or Ticket rights.

All P3 candidates up to the owning wire maximum of 64 are retained. Native's
synthetic schema caps at 12; its formal bridge can show the 64 bounded candidates
directly without paging and must not silently truncate.

## Readiness

Local fixture and strict scope/alias/locator tests only. No Provider, credentials,
device session, shared Host, SQL, Backend deployment or DEV call is used.
The adapter is source-only with no runtime caller, so real Form interpretation
stays closed. Native formal-envelope consumption, authorized real Source/Task
intake and actual Field Review → existing manual Save/readback remain pending.

Status: `LOCAL_PASS` after the focused test/type/lint checks; ready for independent
review and Native adapter integration, **not** SHARED_DEV_PASS or CONSUMER_E2E_PASS.
Root records the final SHA and current-state handoff during serial integration.

## Raw Form material orchestration candidate

`createUniversalP3SourceInterpreter` structurally implements Native's formal
`P3SourceInterpreter(context, AbortSignal, CaptureSelection[], getCurrentContext)`.
The fourth argument is `() => UniversalP3FormContext | null`. Each factory is
owned by **one Form instance and one explicit material intent**. Native retains
the factory and its frozen session; UNKNOWN never implicitly replaces it. There
is no global last-request lock, Map, new queue or persistent store.

Required injected owning dependencies are the existing Capture submission
repository/open/UUID/clock inputs, trusted `requireNormalAccount` (normally
`requireAdoptedUserId`), and an existing Universal transport
factory honoring the invocation's `signal` / `assertCurrent`. Optional
`prepareSources` must be the existing authorized Source lifecycle adapter. The
candidate has no default mount, environment switch, Session reader or Provider
capability. Absent Source preparation leaves accepted raw Capture retained and
reports the missing owning Task rather than starting anything.

The implementation uses `createCaptureSubmissionSession.submit` for the actual
raw picker roster and Trip prior. That session freezes its original submission
key and IDs; the repository owns durable intake and validation. The Account
request context is independently captured using the owning auth helper; both
Account guards use only that context, with explicit Account/Trip agreement to the
Form. Form generation/revision is never substituted for Account generation. After successful intake,
repeat calls use that same session's `recover` and original accepted Job. A failed
intake retains the same session/submission key for its owning recovery.
The session's raw opener remains bound to the initial cancellation scope. After
accepted intake, a new invocation signal can recover/read that same Job without
reopening raw bytes; cancellation never replaces its frozen material. Incomplete
intake stays under existing Capture recovery rather than implicit Form recreation.

It then uses the existing `createUniversalCaptureConsumer` in continuous mode,
starting with passive `recover`. Existing successful or UNKNOWN Tasks are only
read; existing missing Results, 503, forbidden or other ambiguous failures do not
start work. Only the first exact owning context `404 TASK_NOT_FOUND` may use the
existing explicit Start/Source preparation dependency. This start is marked
before invocation and is never repeated after a lost preparation ACK. If a Task
appears between the passive read and Start, it cannot fall through UNKNOWN into
Source preparation. There is no feature timer, polling loop or automatic retry.
Typed results pass through the existing v1 Context/Evidence projection.

Before/after async work, cancellation, Account generation/identity and live Form
Context are checked. Cancellation or stale Context blocks further Source
dispatch and UI consumption; existing Capture/Source is left to its original
durable lifecycle, never deleted. Same roster pointer identities and exact
captured Context reuse the request. A reselected roster or changed Context yields
`FORM_SCAN_FROZEN_REQUEST_MISMATCH`, preserving the existing reference. A future
explicit new-intent nonce/lifecycle change belongs to Native, not an inferred
NoCommit or implicit replacement inside Import.

Native's owning bridge supplies the fourth argument from the original private
`P3StayEditor.scanContext` reader. Import rejects old three-argument callers
before intake. This is required so stale edits cannot authorize dispatch after
long intake; echoing captured Context is not a production live reader. Native
also owns explicit per-Form factory lifetime; recreating it to bypass UNKNOWN
or frozen-intent mismatch is forbidden. The synthetic three-argument contract
remains separate. Real Source capability injection/mounting is still pending.

Focused LOCAL_PASS tests use the real Capture session/repository and in-memory
SQLite, with explicitly labeled LOCAL_FIXTURE Source/Task results. The actual
HTTP transport is exercised only with intercepted local wire responses. These
tests demonstrate raw selection → durable accepted Capture → existing consumer
→ v1 suggestions, same-ID read recovery, UNKNOWN isolation, stale/cancelled intake,
ambiguous preparation and default-closed capability behavior. They are not real
Source/Provider authorization, DEV PASS or consumer E2E. The expired November 1
scope is never revived; Native's live source port remains unmounted.
