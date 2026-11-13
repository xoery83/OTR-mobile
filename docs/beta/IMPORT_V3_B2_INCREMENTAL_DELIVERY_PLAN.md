# Import V3 B2 — Incremental Delivery Plan and Gap Matrix

2026-11-13 · Owner Product Decision Amendment incorporated

This document updates the B2 recovery plan presented to Owner. Source inventory,
October 14–23 approved UX and the October 21 Composer amendment remain in force.
Owner subsequently authorized Slice 1 implementation only. Start with Slice 1;
pause after each slice for actual screenshots/interaction acceptance.

## Product baseline and precedence

- **Production Auto Import:** Submit Batch expresses import intent. Reliably
  identified, sufficiently supported outputs may be created or associated once
  normal authorization and the owning Core contract permit the operation.
- **Development Confirm Before Save:** development testing may retain one explicit
  submission confirmation before eligible outputs enter that same save path. It
  is a development control, not a mandatory per-candidate product workflow.
- Genuine identity ambiguity, field conflicts and required missing facts enter
  Review. Insufficient recognition may ABSTAIN. Do not invent values.
- Both modes reuse Parser, existing Review/admission planning, Core Queue, Sync,
  Operation IDs, UNKNOWN reconciliation and Receipt. No second execution engine,
  QA Account/Trip allowlist or special release eligibility.
- Preserve manual data, normal Auth/ACL/RLS, target ownership, revisions and
  idempotency. Submit intent must not be fabricated into a manual-confirmation
  fact if an owning contract requires a different authorization.
- The amendment supersedes the earlier B2 assumption that every production
  candidate must pass explicit NEW/LINK/UPDATE/Confirm. The older V3 design's
  confirmation wording is historical where it conflicts with this decision.
- V3 Local-First remains: stable Document ↔ Item associations, local originals,
  no Source Proof admission, no permanent original upload or Document Cloud Sync.

## Updated gap matrix

Code baseline: a4d5b50, branch codex/import-v3-local-first. Evidence baseline:
`../ops/b1-p2-document-20261113/README.md`. The functional Save closure is proven
for its recorded cases; OS-level offline and physical-device B1 remain unverified.
Planning conclusions below are not new runtime acceptance.

| User step | Current status and evidence | Remaining work / slice |
| --- | --- | --- |
| Entry and Composer | PARTIAL: normal My Trips/Trip/Day entry, horizontal tray, mixed input and retained in-process drafts exist. `CaptureComposer.tsx`, `CaptureContent.tsx`, `app/(tabs)/capture.tsx`. | Slice 1: entry/return consistency, visible draft actions and truthful availability. Keep Oct 21 compact picker menu. |
| Unsubmitted draft recovery | PARTIAL: account/Trip-keyed JS maps and staging exist; process-death persistence is not established. `app/(tabs)/capture.tsx:38`, `captureStaging.ts`. | Slice 1: bounded feasibility check of existing local persistence and stable file references. Do not claim durable recovery from in-memory retention. |
| Six formats and originals | IMPLEMENTED_AND_ALIGNED for recorded B1 Files/Photos cases. Camera/voice/clipboard are not all runtime verified. | Reuse B1 implementation; only targeted UX checks, no repeat full B1. |
| Submit and Activity | PARTIAL: same Composer changes content, original batch reopens; technical counts do not yet form the complete user journey. `CaptureContent.tsx:451`, `CaptureProgress.tsx`. | Slice 2: distinguish locally retained, waiting, analyzing, review needed and save progress using existing facts. |
| Automatic deduplication / association | PARTIAL: B1 proved explicit N→1 LINK. Current `UniversalV3Review.tsx` offers targets and a title-based possible-match hint; that is not an authoritative automatic identity decision. | Slice 3: reuse verified identity matching; auto-associate only proven duplicates. Similar time/place/title alone is insufficient. Ambiguity remains Review. |
| Product automatic admission | MISSING in current V3 UI path: `openUniversalV3Review().confirm()` plans and enqueues after an explicit decision. | Slice 3: first verify Core command authorization/provenance, then reuse that existing planning/enqueue path. Hiding Confirm is insufficient. |
| Development submission control | IMPLEMENTED_BUT_UX_DIVERGENT: current candidate-by-candidate choice/Confirm is not the proposed single development submission control. | Slice 3: one confirmation for eligible outputs; genuine unresolved questions remain independently actionable. |
| Review | IMPLEMENTED_BUT_UX_DIVERGENT: V3 forms remain inside progress; full-screen, one-list/one-expanded-row blueprint is incomplete. | Slice 3: present only real decisions as semantic Review; no routine per-candidate checklist. Keep supported NEW/LINK/UPDATE choices where a decision is actually needed. |
| Candidates versus Results | PARTIAL: suggestions, save feedback and completed output remain mixed. `UniversalCaptureResults.tsx`, `UniversalV3Review.tsx`. | Slice 4: show candidates separately; count saved results only from actual Receipt/readback. |
| Documents and Detail | PARTIAL: metadata/original/Batch access exists; normal module entry, three-tab shell, direct Item links and search are incomplete. | Slice 5: reuse existing repositories, distinguish direct associations from same-batch results. No Cloud Sync expansion. |
| Activity / Updates | PARTIAL: history and Updates exist; unified status/source filters and V3 actionable projection are incomplete. | Slice 6: reuse the same Batch, distinguish unread from unresolved and processing from user action. |
| Save / Receipt / Sync | IMPLEMENTED_AND_ALIGNED for B1's recorded supported operations. | Reuse, do not rebuild. Association failure retries only its original operation, never recreates the Item. |
| Cold recovery | PARTIAL: committed data/originals survive recorded App network-failure injection. | Verify each changed user flow later; OS-level offline and physical acceptance remain separately NOT_VERIFIED. |

## Four required outcome presentations

These are projections of existing facts, not a new stored state machine:

1. **Automatically saved / associated:** actual authorized Receipt/readback;
   identify created versus linked/updated without double-counting.
2. **Needs your review:** a specific unresolved identity, conflict or required
   fact, with its real decision and source Documents.
3. **Not created — insufficient information:** ABSTAIN or insufficient supported
   content; no invented object or fabricated technical failure.
4. **Save failed:** an actual rejected/failed save with its original operation.

Saving, waiting, UNKNOWN, and Item-saved/association-pending must remain visible
transitional conditions. UNKNOWN is not a confirmed failure and must not resend.
Development-confirmation-pending is not a semantic Review or a saved result.

## Incremental delivery

### Slice 1 — Capture Entry & Composer · M

- Journey: normal entry → files/photos/camera/text → inspect/remove → close/reopen.
- Authority: CP-UX-01 §§2–5, October 21 Composer amendment; max five V3 attachments.
- Keep proven B1 intake, horizontal tray, compact picker menu and scoped staging.
- Scope: visible Add/Clear draft actions, count/availability feedback, compact
  editor and entry/return correctness. Files: CaptureComposer, CaptureContent,
  captureStaging, CaptureRoute, existing catalogs/tests; navigation callers only
  for observed differences.
- Assess persistent unsent-draft recovery using existing repository/local storage:
  account + Trip scope, text/roster, stable original references, file-access
  revalidation and account purge. No Session/Keychain copy, new queue or Save engine.
  Process-kill restoration is an acceptance target only if existing mechanisms
  safely support it; otherwise report the precise minimal gap for Owner review.
- Full App acceptance: originating page/context, successive selections, text once,
  removal without original deletion, confirmed Clear stays open, close/reopen,
  account/Trip separation, keyboard/accessibility. Camera physical verification
  remains distinct from simulator checks. No DeepSeek required.
- No auto-save or admission implementation in this slice. No new product decision
  needed for the current in-process draft behavior.

### Slice 2 — Submit & Activity Progress · M

- Journey: Submit → same sheet Activity → leave/reopen, including independent batches.
- Authority: CAPTURE-ACTIVITY-01/02/07, RECOVERY-01; reuse current identity/timestamps.
- Show truthful business steps from existing intake/task/save facts: saved locally,
  waiting, analyzing, applying, complete, action required or uncertain. Never use
  fake percentages, promise uninterrupted background work or call a candidate saved.
- Files: CaptureContent, CaptureProgress, CaptureActivity, useUniversalCapture;
  existing projection only if required. No new lifecycle owner.
- Acceptance: same batch after reentry/cold launch, independent batches, offline
  waiting, UNKNOWN without resend; development waiting-for-confirmation is explicit.
- Depends on Slice 1 surface; automatic result behavior is completed in Slice 3.

### Slice 3 — Automatic Admission & Exception Review · L

- Product goal: production Submit automatically saves/associates eligible supported
  outputs; only genuine decisions enter Review. Development may hold eligible
  writes behind one explicit confirmation, then use the identical command path.
- Authority: this Owner amendment; UPD-UX-02 TYPE-02R/03/05, UPD-REVIEW-09/10;
  Blueprint V2 VIS-01–04. Full field UPDATE remains B4.
- First establish whether current owning commands permit Submit-authorized
  automatic NEW/LINK, their required actor/provenance and supported P1–P6 payloads.
  Product approval alone is not proof of that contract. Do not forge manual
  confirmation, relax ACL or enlarge Import permissions. If incompatible, report
  only the exact owning-contract gap and minimal change before implementation.
- Reuse existing matching before creating: aggregate Document associations for a
  proven same object; no title/time/place-only merge. Cross-batch and manually
  created targets require the same normal ownership and version checks. Never
  silently overwrite existing manual fields. Unsupported commands remain explicit.
- Reuse planUniversalV3Review, openUniversalV3Review, current Core Queue/Sync and
  receipt checks. Current targets()/possibleMatch behavior alone does not prove
  sufficient automatic matching. No second admission engine or capability framework.
- UX files: UniversalV3Review, UniversalCaptureResults, CaptureProgress and existing
  route wiring; shared review operation only for the required submission adapter.
- Full App acceptance: proven NEW and duplicate LINK without per-item product
  Confirm; one development confirmation for equivalent eligible work; ambiguous
  identity/conflict/missing fact remains Review; ABSTAIN creates nothing; manual
  fields remain intact; versions conflict safely; repeated submit/cold restart/
  UNKNOWN do not duplicate commands, Items or Provider calls. Check all supported
  P1–P6 operations, not fabricated payloads or newly expanded Core features.
- Saved/applying/association-pending are distinct. One exception must not hold
  otherwise independently eligible outputs. Production behavior requires actual
  authorized acceptance evidence, not merely a hidden button or isolated test.

### Slice 4 — Results & Return · M

- Authority: CAPTURE-ACTIVITY-04R/07 and this amendment's four outcome classes.
- Separate interpretation candidates from formally saved results; use real IDs,
  Receipt/readback and actual recorded times. Distinguish auto-save, review,
  insufficient evidence and save failure, including partial completion.
- Files: UniversalCaptureResults, UniversalV3Review, CaptureProgress, current
  result-navigation callbacks. Existing Save/Receipt/Sync remain unchanged.
- Acceptance: results → actual Day Feed/Details → original return position;
  correct created/associated counts, no candidate-as-Added, no false completion
  when associations or an original operation remain pending/UNKNOWN.
- Depends on Slice 3 outcome facts, not a new results database.

### Slice 5 — Documents & Document Detail · L, two bounded previews

- Authority: Oct 23 Documents/Detail/Search, DOC-DETAIL-BATCH-01; Local-First overrides.
- First normal Trip Docs/Inbox entry and compact lists; then Detail, actual direct
  Item links versus same-import outcomes, Batch → other originals, and search.
- Files: ImportDocuments, ImportDocumentsPanel, existing repository, GlobalMenu
  and minimal route wiring. Existing associations/metadata/bytes are reused.
- Acceptance: Document A → Batch → Document B → Back; correct direct links after
  automatic association; original missing does not delete metadata or links;
  no cross-Trip leak; local original remains readable after cold launch.
- Sharing/Move/Add only consume actual owning capabilities. Missing capabilities
  are reported separately; do not fabricate success or implement Cloud Sync.

### Slice 6 — Import Activity & Updates · L, two bounded previews

- Authority: Oct 23 Activity Delta/Blueprint; UPD-IA/STATE/READ/UX-03R/04/05.
- Reuse Batch Progress/Results. Add source/status filters and truthful aggregation;
  normal auto-save appears in actual results, only real user decisions/failures
  enter actionable attention. ABSTAIN is not automatically a failure or Review.
- Files: CaptureActivity, UpdatesInboxScreen, ImportUpdatesSection and existing
  Updates repository/projection. No new notification or Review engine.
- Acceptance: same Batch from all entries; independent filters/scroll restoration;
  read never resolves; no duplicate completion cards; waiting is not attention;
  Activity has no keyword search; Documents and Updates retain their own searches.
- APNs/email/AI Session work without a current producer stays outside this slice.

## Delivery boundary

Only this plan and its Gap Matrix were revised. No implementation, SQL, deployment,
model call or runtime acceptance is authorized by this document. No new Gate,
framework, task store, permission whitelist or pricing system is proposed.

Next checkpoint remains Owner review of Slice 1, then incremental implementation
and screenshot/interaction acceptance. Slice 3 contract qualification is part of
that slice's bounded work, not a new prerequisite blocking Slice 1.

### Slice 1 implementation binding

Reuse `importOriginalFileStore` for bounded, account-owned file copies and digest
verification. A small `captureDraftRepository` keeps a staged local JSON roster with a last-valid fallback
per Account/launch Trip; it records text and stable original digests, never Picker
URIs, native paste tokens or authentication material. Rebuild local paths and
check bytes when restoring. This adds no SQL, queue or shared business state.
Close must not persist the hidden UI's empty projection. Clear changes only the
unsubmitted roster, not originals or previously submitted activities.
Native Clipboard capabilities remain session-only: after process termination,
keep an unavailable placeholder requiring an explicit new selection, never replay
the old token. No generalized draft framework is introduced.
