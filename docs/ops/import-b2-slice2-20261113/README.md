# Import V3 B2 Slice 2 — Submit & Activity Progress

13 November 2026 · local candidate on `codex/import-v3-local-first`.
**Status: SLICE_2_COMPLETE_FOR_OWNER_REVIEW.**

Owner baseline: Slice 1 `5af027b`, CP-UX-02, October 23 Import Activity, approved B2 plan.

## Delivery

- Same Composer sheet becomes Activity after normal local Submit; Close only dismisses.
- Existing Active Imports / Recent submissions reopens original Jobs. No new Activity engine,
  queue, database state or lifecycle owner. New presentation labels are derived facts only.
- V3 Activity history explicitly opts into the V3 capability reader; existing Updates callers
  keep their original lightweight path (Slice 6 is not implemented). V3 history uses the V3 capability reader; an explicitly legacy Batch retains its legacy reader.
- Activity automatically reads original Core receipts and target/Document readback. One existing
  Review owner is reused per observation pass. Pending saves poll read-only while visible;
  dismissal invalidates observations and stops timers. Foreground return can refresh reads.
- Existing explicit development confirmation remains. No Admission or auto-save change.
- Known original Item/Association/Flight UNKNOWN is read through existing queue diagnostics.
  Exact operation filtering avoids the diagnostics list's normal 51-row cap. Read-only,
  account-fenced, at most the existing 32 candidates × 3 original operation IDs.
- No SQL, Core write contract, ACL, RLS, Queue dispatch behavior or Backend deployment changed.
  No DeepSeek/Analyze/Confirm/Save was initiated by this slice. No main merge/push.

## Main files

- `src/features/capture/UniversalCaptureResults.tsx`, `UniversalV3Review.tsx`:
  Activity receipt observation, existing Review owner reuse and explicit-confirm feedback.
- `CaptureActivity.tsx`, `CaptureProgress.tsx`: V3 history display and truthful local intake copy.
- `src/data/operations/universalActivityReader.ts`, `universalV3Activity.ts`:
  scoped read-only history and pure progress projection.
- `src/data/sync/syncOperationRepository.ts`: optional exact-ID diagnostic SELECT only;
  dispatch/retry/mutation methods unchanged.
- `src/ui/catalogs.ts`: English/Chinese status and explanation copy.
- Adjacent tests; B2 plan/current-state status and this evidence directory.

## Truthful state mapping

| Existing fact | Visible English copy (Chinese also localized) | Meaning |
| --- | --- | --- |
| All original inputs ACCEPTED and locally reverified | Originals saved on this device | Local originals; not cloud Items |
| Capability read in flight | Reading saved intake… | Observation only |
| No execution / WAITING_INPUT / NEEDS_ACTION; unavailable network | Waiting to analyze | No automatic Analyze; processing conditions may be unavailable |
| PROCESSING | Analyzing travel information | Backend actually reports a running Task |
| REVIEW_READY, receipts not yet checked | Recognition ready · checking save receipts | Candidates are not saved Items |
| UNCONFIRMED | Recognition ready · waiting for development confirmation | Original explicit confirmation still required |
| PENDING | Applying confirmed saves | Original operations queued or awaiting their receipts; no new confirmation |
| ITEM_VERIFIED_RELATION_PENDING | Item saved · Document association pending | Not complete; never recreate Item to repair a link |
| OUTCOME_UNKNOWN / known queue UNKNOWN / unreadable save outcome | Outcome not yet confirmed | Read original IDs; not confirmed failure; no resend |
| Actual rejected/conflicting receipt or unsupported file bytes | Needs your attention | Genuine intervention, not ordinary retry |
| Every candidate VERIFIED by existing receipt + Item/association readback | Completed | Count verified suggestions, not distinct Item cardinality |
| REVIEW_READY with zero candidates | Recognition complete · no items created | Originals retained; not a fake failure |

No percentage, artificial upload progress, background execution promise, or Candidate-as-saved count.

## Full App observations — real data

Dedicated DeviceHub iPad simulator `1B2252F4-4F90-4F93-9223-545269EAA06C`,
Bundle `com.xoery.otrmobile.b1full20261113`. Existing normal Session/data retained;
physical QA179/iPad untouched. Build inputs in `build-source-manifest.json`.

1. Normal Trip → Add to this trip → Import. One new **local-only** synthetic text submission
   `9583b5ad-225a-46de-81f7-039d85b4a888`, created 21:08:30 NZDT. Same sheet changes
   to Activity, one locally saved original, Waiting to analyze. Analyze never tapped.
2. Actual Close returns to original Trip; Recent submissions discovers original Batch.
3. Existing B1 Files `48181fe2…`: **4/5 suggestions verified**, NZ2 remains unconfirmed.
   Correctly waiting for development confirmation, not all-complete. No original choice altered.
4. Existing B1 Photos `3d2789c7…`: **3/3 suggestions verified**, Completed, not Processing.
   Two suggestions can link one Item: this does not claim three unique newly created Items.
5. Final normal-candidate cold launch and same-Batch discovery: see interaction log/screenshots.
   This is process termination / reinstall-preserving-container, not an OS-level offline test.

`interaction-log.txt` records actual App UI actions/observations. `local-readback.json` records
original Batch IDs, receipt/operation counts and original file hashes after validation.
One pre-existing local-only Batch `dd7de7ff…` was already present before this slice; it is
not attributed to this slice. Baseline had 3 batches / 9 inputs; only the new text submission
adds one Batch/input. B1 Save is not rerun.

## Synthetic fault-state display — not real DEV failures

`screenshots/09-synthetic-state-display.png` is an actual native screenshot of a temporary,
explicitly labelled **SYNTHETIC OBSERVATIONS — DISPLAY ONLY** panel in the full App.
It calls the same pure projection/localized copy for analyzing, UNKNOWN, development wait,
applying, Item-saved/association-pending and Needs Attention. No backend facts/queue changed.
Exact temporary patch: `synthetic-display-only.patch`; it only applies to the new local Batch,
was never product source, and was removed before final normal-candidate cold verification.
This is synthetic-observation visual verification, **not** a real Worker failure or Provider E2E.

## Checks and limits

Targeted state, lifecycle, UNKNOWN, account fencing, original-ID reads and exact SQLite diagnostics
are recorded in `validation.json`. UI guard and affected-source lint pass. Whole-repo typecheck
retains the same three unrelated baseline errors (two continuation fixture `presentationTier`
and missing browser `react-dom/client` declaration); no new touched-source type errors.

Readback can be slow on current DEV: opening existing B1 results performs the existing Core
receipt/graph checks. The UI stays truthful (checking, progressive verified count); no timing
claim or fabricated completion is made. No new read/poll framework was introduced.

Physical-device acceptance and OS-level offline testing were not performed. Offline/UNKNOWN
no-resend behavior is covered by scoped hook/component tests; cold discovery uses real App data.

## Deferred — do not start automatically

- Slice 3: production auto admission, one development submission confirmation, exception Review,
  automatic deduplication/association. Existing per-candidate explicit behavior is preserved.
- Slice 4: separate candidate Review from formal Results, unique Item cardinality/result links,
  complete saved/partial result presentation and return navigation.
- Slice 6: full Activity/Updates list UX, filtering, notifications/search and cross-module navigation.
- No new file formats, billing/CP14, Source Proof, Worker recovery or historical QA work.

**STOP after Slice 2 for Owner review.**

## Owner screenshot review

- `slice1-vs-slice2.png`: six real App screenshot crops only, with original hashes/crop bounds
  in `comparison-sources.json`; reproducible with `make_comparison.py`. No synthetic panel
  appears in this comparison.
- `01-before-submit.png` / `02-submit-waiting.png`: same-sheet transition.
- `03-close-return-trip.png`, `10-cold-discovery.png`, `11-final-cold-waiting.png`:
  dismissal, discovery and the exact same local Batch after process replacement.
- `06-b1-files-partial-confirmation.png`, `12-final-cold-completed.png`: real distinct
  B1 states (4/5 awaiting confirmation versus3/3 completed).
- `09-synthetic-state-display.png`: explicitly labelled fault-state visual check only.

Final validation:158 tests in10 files passed, plus the updated18-case reader suite including
one additional compatibility regression (159 unique tests). UI guard/lint pass. The final
reader opt-in compatibility change leaves the tested Activity UI/path unchanged; reuse its
recorded screenshots rather than repeating B1 or the full App journey.
