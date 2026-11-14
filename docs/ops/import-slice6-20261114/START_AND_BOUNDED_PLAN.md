# Slice6 — Import Activity / Updates started

2026-11-14 NZDT. Fresh branch `codex/import-v3-slice6-activity`, isolated worktree `/Users/xoery/Project/otr-mobile-import/import-v3-slice6-activity`, starts at actual pushed GitHub Main `691189669e33d6eb5399f50c11dcbddf901536a6`. Slice5 status **INTEGRATED — ACCEPTED SLICE SCOPE**; Documents **PARTIAL — OWNING COMMANDS OUTSTANDING**. Full original branch is history only; no wholesale cherry-pick. Remote receipt attached.

## Read baseline and minimal gaps

Full Oct23 Import Activity ProductDelta/UIBlueprint read from `/Users/xoery/Downloads/Document Module Design V1/`; current B2 plan Slice6 and Main actual source checked. Later Owner rule: Activity has no keyword search; reuse Documents/Updates search. Existing no-producer AI/MCP/Email sessions must remain explicit gaps, not invented records.

| Current Main | Next bounded work |
|---|---|
| DocumentsScreen has existing three-page pager and Activity entry; mounts CaptureActivity, same onOpenJob route. | Keep same Batch identity/return; source dropdown and status chips/adaptive header remain missing. |
| CaptureActivity reads real account-fenced CaptureJobs with cursor20, observes existing V3/legacy status, subscribes existing activity updates. | Reuse reader/ownership; compact source/status rows, filter/count presentation and scroll retention. No new Queue/state store. Current observed status absence must not become Completed/Failed. |
| projectUniversalV3Activity distinguishes waiting/analyzing/uncertain/checking/confirmation/applying/association/complete/attention/empty. | Reuse as facts; map to approved user categories, development confirmation separate from semantic Review, UNKNOWN never retry/failure. Count Batches, not candidates or attempts. |
| ImportUpdatesSection offers existing ACTIVITY cards but hides in NeedsAttention; no activity-ID filter. UpdatesInboxScreen has current scoped repository and existing job reentry. | Preview2: activity-filtered Updates/Review, read vs resolve distinction, no duplicate cards, existing owning recovery for SaveFailure, currentAccount generation maintained. |
| Same Batch Progress/Results/Review and owning navigation already delivered. | Reuse; add optional manual form recovery only through existing explicit targetTrip route. Never count manual additions as AI results. |

## Two bounded previews

1. **Activity list/source/status UX**: existing CaptureActivity/DocumentsScreen, existing presentation helper/catalog/tests. Supported Files, Photos/Camera, Text and actual recorded mixed sources only. Truthful Processing/Waiting/Review/Completed/Failed projections and source-filtered Batch counts; no badges forAll/Completed. Compact row timestamp seconds/scope/status, exact same Batch reopening, scroll/chrome/selection restoration. Start with owning tests then iPhone complete App; iPad minimum regression, no Analyze/Save.
2. **Updates and navigation completion**: existing ImportUpdatesSection/UpdatesInboxScreen and current read projection, native routes only. Results→activity-filteredUpdates→Review and Back retain Batch; unread never resolves; offline/UNKNOWN no dispatch; verify no duplicate completion or crossAccount leak. Producer-less AI Sessions/APNs/email remain unimplemented, not re-created here.

Each preview is reviewed as an actual full-App UX milestone. No SourceProof, cloud originals, new policy/notification/Review framework, SQL/Core/Receipt/Sync contract change or model calls. Existing tests reused, no full Recovery.

## Writer boundaries / independent formal backlog

MC owns Slice6 CaptureActivity, ImportUpdatesSection, Documents Activity navigation and exact catalog additions in this worktree. AuthC04 owns state container/People and membership; Root1/Root2 owns its Reader/Backend/DEV. Main/catalog cross-line integration is serialized. NoHost/PGWriter reserved by Slice6; Auth informed of actual newMain and exactcatalog delta, must not overwrite Documents from oldAuth snapshot.

Document Rename→Share/MakePrivate→Add/Move→SafeRemove remains separately planned Core/Document owning work, using `../documents-slice5-completion-20261114/DOCUMENT_OWNING_CAPABILITY_BACKLOG.md`. Auth supplies current membership/revocation facts forShare/Move; C04/entireSlice6 are not arbitrary prerequisites. First next action for Core is exact command/Receipt gap proposal, not expanding Import authority or directSQLite updates. No execution/SQL entitlement is implied.

Status: **STARTED / SOURCE-AND-GAP CHECK COMPLETE / NOT UX ACCEPTED**. This commit initializes the fresh workstream and bounded preview scope; no Slice6 feature or runtime PASS claimed. Main merge of future Slice6 changes awaits Owner acceptance.
