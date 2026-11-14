# Import V3 Slice 5 — Owner preview and acceptance

14 November 2026 NZDT · **READY_FOR_OWNER_REVIEW**. Product candidate `90d42294d1e998b50e258c23b68f5c8b9d9251a6`. Owner UX acceptance and Main integration are pending. Slice6 has not started.

## Baseline and scope

GitHub Main was independently rechecked at `431a893b3ecba5b6eb9c6557bd81bc6e8d4e6cc8`, including accepted `08ad06c9`. Fresh branch `codex/import-v3-slice5-documents`, worktree `/Users/xoery/Project/otr-mobile-import/import-v3-slice5-documents`. No continuation of the historical Import worktree, wholesale cherry-pick, Main edit or push.

Authority: approved B2 Slice5 plan; Oct23 Documents/List/Detail/Search/Batch Addendum originals under `/Users/xoery/Downloads/Document Module Design V1`; actual original reference board viewed. Local-First Owner amendments govern original custody. Main's existing Core Documents, Capture reader, private original store, Native viewer and Receipt projection are reused. See `PLAN.md` for the initial bounded gap analysis.

## Two bounded previews

| Preview | Actual result | Evidence |
|---|---|---|
| 1: normal entry and lists | Complete App My Trips → Trip → menu → Documents. Trip Docs/Inbox/Activity peers, compact MIME rows, private badge, actual typed filters and independent Trip scopes. Seven documents on the original Trip, two on another. Metadata retained without bytes. | `screenshots/iphone-documents-release.png`; earlier `preview1-*` images belong to d0a78787 and are labeled as earlier evidence. |
| 2: detail, links and search | Information-first Detail; explicit original open; ACL-checked actual Item links. Exact accepted-input identity binds real Batches. A → Batch → B → original → Back works on the holding iPad, including an original without a formal Item. Filename/local-text search, scope/location preservation and metadata filters reuse existing stores. | `iphone-detail-missing-original-release.png`, `iphone-search-release.png`, `ipad-real-batch-receipts-final.png`. |

Both preview packages are submitted for Owner review; neither is represented as Owner-approved.

### Results are separate from associations

The retained B1 **14:43** Batch actually projects **Created — Harbour QA Hotel** and **Linked — Fern Quay Boardwalk Walk** from original commands/Receipts, through the existing `projectUniversalV3Results`. Current Document→Item associations appear separately, without treating every same-Batch file as evidence for every result. Results are fetched using the existing read-only capability GET and local retained operations/Receipts; no admission, Confirm or dispatch method is used.

The separate **20:50** historical Batch did not yield verifiable saved results here. Its UI says so and keeps originals and direct associations available. No replay or manufactured completion. No claim is made that all historical Task results are currently available.

Primary iPhone legitimately lacks these B1 original bytes/Batch records. Its metadata and Item links remain visible; explicit open reports unavailable. Private data was not copied to simulate cross-device support. The original iPad was upgraded **in place** under its retained B1 bundle, with the former complete app artifact preserved for restore. Its original viewer was visibly exercised in preview2 (`preview2-gif-original.png`, intermediate build); that unchanged viewer evidence is reused, not mislabeled as a new Provider E2E.

### Actual UX correction

Dark/larger-text testing found black unstyled detail labels and hot font-size button clipping. `90d42294` applies canonical Theme text and remeasures native child labels while preserving the Detail page stack. Before: `before-fix-dark-large-text.png`; actual corrected larger-type/dark view: `iphone-detail-dark-larger-text-fixed.png`. Light appearance and text size3 were restored. This is an actual Native correction, not a UI Guard-only PASS.

## Changes and contracts

- `app/documents.tsx`, `GlobalMenu.tsx`: normal scoped entry, no fixture/QA identity route.
- `DocumentsScreen.tsx`, `documentListPresentation.ts`, `CoreDocumentDetail.tsx`: list/detail/Batch/search UI and scoped presentation. Core/Capture representations of the same original are not shown as duplicate files; cross-Trip search preserves authorized locations.
- `localItemImportOriginals.ts`: extend the existing reader with metadata, ACL-checked Item associations, exact accepted-input Batch links and existing Receipt projection. Holding-account restrictions on original bytes remain; legitimately shared metadata still requires `coreCanRead`.
- `importDocumentsRepository.ts`: existing repository gains actual recorded source/storage metadata and optional bounded submitted-text search projection. No raw SQLite in UI; no new repository/data owner.
- Historical ImportDocuments panels remain readable. New directory paths do not invoke old Source Proof Item-link readers; the existing original reader/viewer is reused.
- Catalog/foundation guard/menu tests updated. No SQL, schema, Role/Grant/RLS/ACL, Backend, Parser, Admission, Core Save, Queue, Sync or Receipt contract change. No Cloud Sync, Source Proof Admission, Authority, Worker, Gateway or engine added.

## Validation

**Same product candidate:** 84 PASS /0 FAIL /0 skipped across7 relevant files; UI Guard PASS174 representative files; scoped lint PASS. Typecheck reports exactly3 unchanged Main errors (fixture `presentationTier` twice and browser `react-dom/client` declaration), no new error. Logs in `checks/`.

The first architecture run timed out at its existing5s limit while Xcode was compiling; its4 other checks passed. After compilation, the same unmodified check passed, and the final combined candidate run passed all84 checks. Initial timeout is retained; no assertion removed, skip added or timeout enlarged.

Complete Xcode **Release Native** iPhone/iPad builds and retained installations passed. Source/staging comparison: **1,787 files, zero mismatch**. Actual executable/JS hashes and build logs are recorded in `verification.json`; this was not an old native shell with replacement JS.

Read-only preservation after final installation:

| Device | Existing private file hashes | Core Documents / associations | Original Queue |
|---|---|---|---|
| Primary iPhone | 9/9 unchanged; includes2 original-byte files plus drafts/earlier QA records | 9 /14, unchanged | 13 COMPLETED, unchanged |
| Original B1 iPad | 30/30 unchanged | 9 /14, unchanged | 33 COMPLETED, unchanged; Batch7/Input13/Capture13 also unchanged |

Normal cold Native launches retain sessions, documents, associations and original material. No new Analyze/Save, DeepSeek request, repeated B1 operation, QA179 change or business write was performed. Existing B1 independent save/offline evidence is reused for unchanged owning mechanisms; no new full Save or network-cut E2E is claimed.

## Explicit remaining limits

- **Not verified:** physical iPhone/iPad; horizontal swipe and complete compact-header gesture acceptance (DeviceHub drag did not prove a successful swipe); runtime account switching/all Member combinations. Tap navigation works and the owning isolation tests pass. These are evidence gaps, not declared product failures or PASS.
- Search covers authorized **locally synchronized/indexed** metadata. It is not a server-wide original/full-text search. Submitted TEXT projection is bounded to64KiB; larger bodies, PDF/image text and unsupported email indexing are not claimed. Filters only use recorded facts; no OCR/LLM search.
- Sharing/Move/Add/rename writes require actual owning capabilities not established by this read-only directory. Controls/success are not fabricated; original Cloud Sync remains excluded.
- Cross-device Batch history and Activity/Updates extensions remain Slice6; unverified historical results do not block originals or cause replay.

Stop for Owner preview/acceptance. No Main merge/push. Slice6 may start only after Slice5 acceptance and authorized integration, from updated Main.
