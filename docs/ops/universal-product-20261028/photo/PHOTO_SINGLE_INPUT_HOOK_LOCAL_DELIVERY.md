# Single-input Photo hook — local delivery, 30 October 2026

Status: IMPLEMENTED / LOCAL_PASS. The two frozen hook artifacts were verified
against manifest SHA4aa86baf… and copied without overwriting into the stable
codex/universal-photo-hook-20261030 worktree based directly on public maina9e33cbf.
The older Photo worktree/history remains untouched. Accepted582f2d4c actions/factory
are reused from that public baseline; no historical branch merge is needed.

Three suites32 tests PASS:19 Hook lifecycle tests plus13 existing real-SQLite
local actions/factory tests. Full typecheck, UI guard and changed-code lint PASS.
The hook defaults to passive local read; explicit screen/choice is one action at
a time per input, with no deferred click queue. Actual Capture pins/source metadata,
existing Account-generation events, visibility and unmount fence the view. Late
results/old handlers cannot overwrite a new scope. choose retains the observation
and revision actually shown, never a later read's value. The existing Repository
remains the exact-pin/CAS writer; cancellation cannot undo an accepted local write.

No caller/UI is installed. Hook tests mock React/factory results; real Native
OCR, Vision/cost receipts, image Source/Task qualification, region-evidence
Admission, actual Native cold restart and Photo formal Save are not verified.
No Host, SQL, Provider, GUI, AD5, shared Session/Sync/Navigation or registry change.

## Read-only next UI diff assessment — not implemented

The smallest appropriate parent is CaptureProgress.tsx's per-input section.
It already receives model/isCurrent and renders activity.currentInputs, even when
other Batch inputs are not all accepted. It therefore supports independent local
Photo preparation without making the normal Interpreter/Results consumer own it.
UniversalCaptureResults.tsx is currently mounted only after allInputsAccepted and
owns the Task/results/Admission views; do not put Photo local choice in that owning
pipeline or change its unprocessed/sourceBindings truth to hide an unsupported image.

Proposed future Writer scope only:

| File | Minimum change |
| --- | --- |
| New src/features/capture/UniversalPhotoRelevanceRow.tsx plus test | One stable input row invokes this hook unconditionally; canonical UiText/UiButton/theme/locale controls display local decision/busy/unavailable only. |
| src/features/capture/CaptureProgress.tsx plus its focused test | Render the Photo row for the matching accepted IMAGE when model/isCurrent exist, keyed by input.id; keep intake/results and all other Source handling unchanged. |
| src/ui/catalogs.ts | Root's serial catalog Writer adds only the precise local relevance/choice copy required by the row; no hard-coded strings or formal Review/Save-success wording. |

If that future row needs an original-preview button, reuse the existing Documents
reader/panel path. CaptureContent.tsx already owns its Documents surface and
CaptureProgress's isCurrent callback. Any new original-open callback must delegate
to that legal Reader; never derive sharing or Trip Document ownership from tripPrior,
and do not treat temporary Backend custody as permanent cloud backup. This extra
callback is not part of the above minimum local-status/choice row proposal.

Do not modify useUniversalP1Admission.ts, universalCaptureConsumer.ts, shared
Navigation/Session/Sync, SQLite registration or default IMAGE eligibility for this
UI step. Local Continue is only stored intent; until owning Vision qualification
exists it must not imply a Provider call, result or Core Save. No UI/catalog code
is supplied here; Root retains the next UI/Authority decision and Writer handoff.
