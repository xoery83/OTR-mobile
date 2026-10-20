# Capture C1 canonical integration — independent review

Date: 2026-10-08 (Pacific/Auckland). Role: Independent Integration Reviewer.
Reviewed prepared merge: `/private/tmp/otr-c1-canonical-integration`, branch
`codex/c1-canonical-integration`.

**FINAL VERDICT: PASS**
**Ready for Final Owner Integration Review: YES**

No new CRITICAL, IMPORTANT or required LOW/MINOR corrections. One nonblocking
inherited formatting observation is recorded below. Readiness applies to the
prepared integration; it grants no commit, main advancement, push or activation.

## Review method and provenance

Read the integration Builder report, accepted C1 implementation/report/recheck,
Owner ADR, reconciled current-state handoff, accepted CP15B F1–F4 targeted recheck,
LIVE-W FINAL R1-C1 targeted recheck, CP14 Final Closure targeted F2 recheck and the
external integration preflight/amendment. Historical FAIL/pending sections were
read in conjunction with their final superseding appendices.

Independently checked Git objects, index/worktree bytes, ancestry, staged scope,
source HEAD/index preservation, contract evidence hashes, Account caller/gate flow,
C1 production/test sources, deployment/custody boundaries and retained logs/bundles.
Fresh executions in this review were preservation/Git assertions, Prettier checks,
a Backend bundle build/metafile audit and reproducible Linux test **bundling**.
No test suite, Linux test runtime, SQL fixture, typecheck, lint, UI guard or device
acceptance was newly executed. Their prior results are identified as inspected
retained evidence, not this reviewer's runs.

Owner provenance was independently retrieved read-only from chat
“Authorize C1 Integration Builder”, thread
`01a11821-a289-79e2-ae11-67b2afdc05fb`:

- User message `01a11821-aa4a-75f1-a23c-33c2ad966c31` explicitly records joint
  P1 ↔ C2 Revision 1 acceptance and `continuesFromInputId` /
  `continues_from_input_id` naming, and forbids fabricated historical evidence.
- User message `01a11848-2841-7de0-8d26-969b8b439fb2` authorizes minimal completion
  of the existing merge and reuse of 670 + 63 PASS evidence when runtime/test bytes
  remain unchanged. It permits report formatting repair and the documented staging.

These messages establish provenance only; this review did not act on their builder
permissions. No message was sent to another chat.

## Exact ancestry and index — PASS

- HEAD / intended first parent:
  `a817e8e881e2fa2e094696b13bc4df2eca7e2db2`.
- MERGE_HEAD / intended second parent:
  `79237cbd993792100ed51468e31671e4a2b59888`.
- Common ancestor: `b973f039dfd6405d302409252ddbdc8f70584159`.
- Divergence is exactly 2 Platform / 7 Capture commits. This is a pending merge,
  not an existing two-parent merge commit. No replacement objects, rebase,
  cherry-pick or revert sequencer exists. Original commit identities remain intact.

Platform-exclusive commits, oldest first:

```text
56a050c0063bd062cb0bac7f50b928dfeb79ca6f
a817e8e881e2fa2e094696b13bc4df2eca7e2db2
```

Capture-exclusive commits, oldest first:

```text
e5a5f100e0411f1eef08d55e64a5a37b4e438835
f47e8d5feddb7c17b83b68957100e40d4ad3ece5
012d84c0ca93a7121778463d2cabd0f7ab3b997d
ed499218ca8acb2ea06c06d8f572d863b6c335bd
3c063532666411279f74658520e00defdfff45fb
92b87bd20f0d4baf23d3b4da8934d3142133e765
79237cbd993792100ed51468e31671e4a2b59888
```

Exactly 22 approved staged paths; all 19 Capture-only paths match Capture HEAD
bytes, all 55 Platform-only paths match Platform HEAD bytes. The sole shared path
is the intentionally reconciled handoff; the two authorized additional files are
the Owner ADR and Builder integration report. All tracked worktree files match
the index. No unmerged entries, conflict markers, unexpected staged files or
unstaged tracked changes were found. At entry there were no untracked files.

Exact staged inventory:

```text
app/(tabs)/capture.tsx
docs/CURRENT_IMPLEMENTATION_STATE.md
docs/adr/2026-10-08-c1-integration-owner-decision.md
docs/architecture/OTR_CAPTURE_C1_CANONICAL_INTEGRATION_REPORT.md
docs/architecture/OTR_CAPTURE_C1_IMPLEMENTATION_REPORT.md
docs/architecture/OTR_CAPTURE_C1_IMPLEMENTATION_REVIEW.md
docs/architecture/OTR_CAPTURE_C2_DURABLE_INTAKE_PREFLIGHT.md
docs/architecture/OTR_CAPTURE_END_TO_END_PRODUCT_FLOW.md
docs/architecture/OTR_CAPTURE_IMPLEMENTATION_READINESS_AUDIT.md
docs/architecture/OTR_CAPTURE_RESOLUTION_ARCHITECTURE.md
docs/architecture/OTR_CAPTURE_REVIEW_ARCHITECTURE.md
docs/architecture/OTR_CAPTURE_UX_ARCHITECTURE_BASELINE.md
docs/architecture/OTR_EVIDENCE_DOCUMENT_CUSTODY_ARCHITECTURE.md
scripts/ui/guard.ts
src/data/auth/accountGeneration.ts
src/features/capture/CaptureContent.test.ts
src/features/capture/CaptureContent.tsx
src/features/capture/captureLifecycle.test.ts
src/features/capture/captureStaging.test.ts
src/features/capture/captureStaging.ts
src/native/capturePicker.ts
src/ui/catalogs.ts
```

Source Platform and Capture HEADs, tracked state and index hashes match the
preflight/Builder evidence. Platform's pre-existing untracked LIVE1P provisioning
report remains external to this merge. Integration index SHA-256 at review entry:
`b1e98a39833673cb827449d07f6688a86acc1be5462e18866e9613f63b82076a`.

## Required semantic and boundary checks — PASS

| Check                             | Independent evidence and disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handoff preserves acceptance      | `docs/CURRENT_IMPLEMENTATION_STATE.md:22` retains C1 device/review acceptance; `:52` identifies accepted Capture HEAD/C2 unstarted; `:58` preserves CP14 closure/F2; `:100` records final LIVE-W recheck supersession; `:182` retains Server84/SQLite50; `:212` retains activation gates. CP15B final recheck is at `CP15B_REAL_DEV_DISPATCH_INDEPENDENT_REVIEW.md:174`; LIVE-W final PASS at `CP15B_LIVE_WIRING_INDEPENDENT_REVIEW.md:744`; CP14 F2 resolution at `TRIP_CHECKPOINT_14_FINAL_CLOSURE_REVIEW.md:216`. Their accepted bytes are unchanged. |
| Owner ADR is accurate             | `docs/adr/2026-10-08-c1-integration-owner-decision.md:8` records the actual current decision and final naming; `:27` identifies external evidence; `:34` explicitly refuses historical reconstruction. Both recorded external SHA-256 values independently match the supplied files. Historical PROPOSED wording remains external and unchanged. No historical final Capture contract acceptance artifact is invented.                                                                                                                                   |
| Existing Account gates preserved  | `src/data/auth/accountGeneration.ts:4` adds only subscription/removal and `:15` retains monotonic advance. `accountRequestContext.ts:27` apply serialization, `:50` transition pending fence, `:65` generation advance and `:83` request rejection are unchanged Platform bytes. Pending-transition fencing already exists before synchronous subscribers run; generation inequality survives A→B→A. The sole production subscriber is the Capture route.                                                                                                |
| Offline route and stale callbacks | `app/(tabs)/capture.tsx:38` waits for gated local-session read, `:40` rejects blurred/stale completion, `:52` invalidates focus and `:58` checks current admission; `:71` keys content by generation. No refresh/network admission is added. `captureLifecycle.test.ts:136` covers held-transition release with tokenless offline B; `:157` covers blurred reads. Picker work runs outside the gate.                                                                                                                                                     |
| C1 remains staging-only           | `CaptureContent.tsx:22` owns volatile invocation state/prior; `:142` renders disabled Add with no submission handler. `captureStaging.ts:56` rejects stale epochs and `:83`/`:87` discard on cancel/detach. Native picker retains metadata only (`capturePicker.ts:6`); no repository/schema/Source/Run/queue/admission writer or automatic submission is introduced. Acceptance tests are preserved, including A→B→A and effect replay.                                                                                                                 |
| Backend isolation                 | Fresh `/private/tmp/otr-c1-review-server-meta.json`: 197 inputs, zero fixture/test/Capture/native/UI/Expo/React Native inputs. Retained server metafile agrees. Fixture-only `createFlightProtocolTestHost` and `createProtocolTestCustody` are absent from server bundle; the accepted four live-host runtime exports remain unchanged. Account generation adds no UI/native import.                                                                                                                                                                    |
| Production Linux custody          | `backend/src/flightPrivateCustody.ts:47` rejects non-Linux before custody I/O; `:62` admits descriptor-by-descriptor from `/`; `:88` checks trusted mount identity; `:107` anchors normal I/O to retained FD. `flightLiveHost.ts:78` keeps strict five-field input guard; `:118` admits custody/continuity before `:133` HTTPS construction. `deploy/dev-backend/Dockerfile:17` retains UID10001; optional compose `:11` disables automatic host-path creation. All are exact Platform bytes.                                                            |
| Schema/scheduler preservation     | Independently matched all 88 `CP15B_STARTUP_PRESERVATION_HASHES.json` entries. All 84 Server migrations, entire local db/migration tree and sync tree remain Platform bytes. Server84 tail SHA-256 is `46e80899f14817d5162f255383e303232a12276e662f34b2cb16156c34d4f2a9`; SQLite50 remains `intelligenceContinuations.ts:3`. `syncEngine.ts:139` retains all five C denials and `:169` excludes them before dispatch regardless of permissive filters. No second scheduler, Server85 or SQLite51.                                                        |

## Retained validation evidence — inspected, not rerun

- `/private/tmp/otr-c1-matrix-a.log`: 16 files / 175 PASS.
- `/private/tmp/otr-c1-matrix-b.log`: 14 files / 495 PASS / 15 skips.
- `/private/tmp/otr-c1-independent-matrix.log:10`: separate validation worktree,
  30 files / **670 PASS / 15 skips**. Independently compared all 30 selected test
  files with the retained validation worktree: exact bytes. Fresh bundle input
  comparison also matches its first-party runtime files.
- `/private/tmp/otr-c1-linux.log`: **63 PASS / 2 skips / 0 failures**, 65 cases;
  individually inspected custody replacement/continuity/immutable ACK, host
  currentness/recovery/CLOSED and HTTPS cases. The skips are unsupported-OS case
  on Linux and optional actual Server84 SQL environment E2E. No SQL E2E PASS inferred.
- Inspected Builder chat's successful Linux execution record: exact cached base
  image, UID10001:GID999, network none, read-only root, cap-drop ALL,
  no-new-privileges, deny preloader and `F1_CUSTODY_MODULE`. Inspected external
  Node-test/Vitest adapter and retained denial preloader. Freshly rebuilt the three
  Linux test bundles using that adapter: **byte-for-byte equal** to retained
  `/private/tmp/otr-c1-linux-bundles/*.test.mjs`. This verifies bundle provenance;
  it is not a fresh Linux execution.
- Retained typecheck, lint/UI guard and Backend build logs support the Builder's
  bounded claims. UI guard records 473 legacy occurrences / 78 representative files.
  No full-suite PASS or new device/native/SQL/provider acceptance is inferred.
  Counts overlap and are not additive coverage.

## Findings and limitations

**O1 — LOW / nonblocking inherited formatting.** Fresh Prettier check of all 22
staged paths exits 1 for exactly two accepted Capture direction documents:
`docs/architecture/OTR_CAPTURE_RESOLUTION_ARCHITECTURE.md:57` (table alignment,
also later tables) and `docs/architecture/OTR_CAPTURE_REVIEW_ARCHITECTURE.md:72`
(table alignment, also later tables). Both files are byte-identical to accepted
Capture HEAD; this is not an integration-introduced formatting regression. The
other 20 staged paths, including implementation, accepted C1 reports, handoff,
Owner ADR and integration report, pass. The Builder's final formatting statement
is scoped, not an all-22-path formatting assertion. No correction is required for
this byte-preserving integration; do not reformat accepted direction bytes here.
Evidence: `/private/tmp/otr-c1-review-format.log` and
`/private/tmp/otr-c1-review-format-scoped.log`.

**Disclosed runtime-cache limitation, no new finding.** Builder report
`OTR_CAPTURE_C1_CANONICAL_INTEGRATION_REPORT.md:85` records accidental removal of
the cached Linux base image. Prior Linux results/bundles and successful execution
records remain verifiable, but a future exact Linux rerun needs image restoration.
No restoration, pull or Docker operation was attempted by this review.

Fresh esbuild emitted a missing `expo/tsconfig.base` warning because the cleaned
reviewed worktree has no dependency symlink. Bundling succeeded using existing
installed dependencies, and Linux test bundles reproduced exactly. This warning
does not establish a typecheck failure; typecheck was not rerun.

## Final stop state

Final formatting checks and `git diff --cached --check` / `git diff --check` were
performed. The index, both pending parents, all staged blobs and tracked files
remain unchanged from review entry. This review is the sole new **untracked**
file; it was not staged. No implementation, resolution, handoff or original report
was edited. No commit/push/main advancement, migrations, Hosted access, provider
activation, network fetch, deployment or device operation occurred.

Review-owned evidence remains outside Git under `/private/tmp/otr-c1-review-*`.

**FINAL VERDICT: PASS**
**Ready for Final Owner Integration Review: YES**

STOP — C1 CANONICAL INTEGRATION INDEPENDENT REVIEW COMPLETE.
