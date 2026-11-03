# Lane C Import — status and evidence at V4 freeze

Freeze: **2026-11-03 09:23:05 UTC / 22:23:05 NZDT**. Handoff base: `b16c2d932ce602e86db83796eefe20d94b215aed`. This document records existing evidence; no E2E, model, Host, SQL or device operation was executed to prepare it.

Root's latest read-only AD5 observation: target QA Trip selected; a PNG named universal-photo-activity-qa.png (UI43KB; this selected draft's bytes/hash not reread) is only an **unsubmitted local Import draft**. Submit Batch was available and not clicked. No new Batch/Source/Task/Provider call. Preserve the existing AD5 Session; do not close/reset it and lose the draft. This observation is Root's handoff statement, not a new independent device receipt from this writer.

Source/Provider/Actor/price authority remains **Nov1 expired**. Gate `94a296bdb63527a705227c1ac2dffa74217dad26` (document SHA `deb543e5418967116df87aef22db5f4b91e0f385ed453fb4636c5c8d487f13b2`) received Root authorization but was **unused** at freeze. Owner expressly does not transfer its execution permission to the next Agent. No T/D, qualification, budget or active runtime authority is granted by this handoff.

## Historical Golden slices versus current acceptance

All historical rows below are synthetic DEV minimum slices, not unrestricted family qualification or a fresh current-main run. Paths are repository-relative to this handoff tree unless stated otherwise.

| Slice | Existing actual evidence | Exact accepted identity / important limit |
|---|---|---|
| P1 | `docs/ops/universal-stage2-20261025/actual-execution/resume-20261026/P1_FORMAL_SAVE_SERVER_RECEIPT.json`: SERVER_ACCEPTED_AND_INDEPENDENT_SERVER_VERIFIED | Item `34dece59-61ae-8716-a976-7d3da49b51d0`; receipt `c7b5aeae-ff1f-4305-a5fa-ed53273340f8`; receipt SHA `b7c815ed0530008d2e2eb176ffc18d7d8f8921c8b1426659a9f09262dda7f46c`. Historical Native day/full restart cold PASS in `evidence/P1_NATIVE_COLD.json`. The receiptSha256 identifies the business receipt, distinct from the JSON file SHA below. |
| P2 | `docs/ops/universal-p2-formal-save-20261027/P2_FORMAL_SAVE_E2E_RESULT.md`: bounded formal Save + actual AD5 cold recovery PASS | Sparse NZ501; Item `ec73e4fd-c580-8063-96a8-ef7accda3748`; receipt `b68bcb7b-865c-46b5-9baa-46b49ad1b3e2`. Not Qualified Flight/Journey/Booking/Ticket. |
| P3 | `docs/ops/universal-p3-formal-save-20261026/P3_FORMAL_SAVE_E2E_RESULT.md`: bounded CLOUD_E2E_PASS | Harbour QA Hotel; Item `1397477b-db1f-8d5e-9ffe-3c6c037d78a9`; receipt `110e6eae-d0e2-4da3-86d1-f0893686e545`. Historical Import Admission Save; distinct from the Form Scan/manual Save software below. |
| P4 | `docs/ops/universal-p456-formal-save-20261027/P4_FORMAL_SAVE_RESULT.md`: CLOUD_E2E_PASS + actual cold recovery | Item `55a323db-f975-8af5-b9af-e086d5ac08a2`; receipt `6db144a2-db9b-4c80-ac85-e992e68166b6`. Date-only rental; unknown clocks/zones/Places remain null. |
| P5 | `docs/ops/universal-p5-formal-save-20261028/P5_FORMAL_SAVE_E2E_RESULT.md`: bounded formal Save/cold recovery PASS | TRAIN only; Item `7151caa5-4d9a-89db-b033-89d6f71deda5`; receipt `f6d056c9-2139-41cc-be73-c019e5ede5af`. One settled historical DeepSeek call, not a new call. |
| P6 | `docs/ops/universal-p6-formal-save-20261028/P6_FORMAL_SAVE_E2E_RESULT.md`: bounded actual E2E PASS | Date-only Activity; Item `fa8aa691-8c18-8eaa-88aa-2eed8fe8cfdb`; receipt `edee9ae3-1486-4268-9d3e-908ae2f2e23e`. Same Task recovered after Context503; no replacement call. |
| PDF | Historical `PDF_MINIMUM_FORMAL_SAVE_NATIVE_E2E.json`: NATIVE_E2E_PASS, separate archived worktree/object below | Original PDF1,676B → derived text → one historical text-model call → normal review/Admission → **P1**, despite P6 fixture filename. Item `4b2cf335-7132-8288-aac9-c886db266d36`; receipt `277d40d1-78e9-4a7a-a825-7f7fb015cb46`. |
| PNG Vision Golden | Historical real Vision → P1 APPLIED → independent cloud → Day/cold PASS, build126.10/SQLite76. Portable `evidence/PNG_NATIVE_E2E.json`, `PNG_CORE_SERVER_VERIFIED.json`, `PNG_VISION_SETTLED.json`, `PNG_GATE_CLOSED.json`; provenance in ARTIFACT_MANIFEST. | Item `c59d3d03-6830-84e8-8579-02a59fe624fa`; operation `4f095d9c-449e-8456-a134-c69e9c33f3bb`. Two settled calls in the historical sprint cost $0.00070026; two prior UNKNOWN holds remain. Duplicate control disabled/counts1, not a replayed duplicate POST. First cold Results503 still OPEN. |
| Retained PNG | Build126.15 actual read-only UX PARTIAL PASS | Batch prefix `794b02d7`, Task `96ce2929`, saved P1 Item `c59d3d03`. Updates→same Results→PNG Quick Look→duplicate Review/NEW/Confirm disabled→Updates. This is retained accepted state, not a new PNG paid scan or proof the first503 is resolved. |
| Fresh New Batch | **NOT_RUN / FROZEN** | No new Submit/Source/Task/Provider/Save/cold recovery receipt for the selected draft. Historical Golden, current software tests and retained recovery do not fill this row. |

## Current local software evidence and gaps

- **P3 Form Scan**: existing main contains Native10c Source scan/default composition (`docs/ops/p3-reviewed-main-20261103/HANDOFF.md`; fixed combined source `11fb309a`, Native original `10c34c51`). Typed suggestions bind Account/Actor/Trip, request/Source/representation/Task, exact Form/CreateEdit/item and UI/Core revisions. Evidence and explicit candidate/field review precede the existing Manual Save; no Import Admission scope is required for that manual Save. No auto-save, no missing→Clear, no inferred Edit target; old responses are fenced. This is local software acceptance, **not actual current paid Form E2E**.
- Actor fence candidate `5648818e8eabc7d1930cbf74ff8f019054e4dbdb`: 80 focused checks. UNKNOWN projection `d54ff3808df247d5379d988b1d7d145507c72dfb`: two RED regressions then 10 selected GREEN; only owning UNKNOWN Task + unknown Result + UNKNOWN Provider + empty candidates passes advisory projection. No usable fields/new IDs/dispatch. Evidence: `docs/ops/imp-c03-form-dto-20261103/HANDOFF.md` and `docs/ops/imp-c03-unknown-state-20261103/HANDOFF.md`. Actual Form/device/Provider recovery remains NOT_RUN.
- **Activity** lost-completion repair `53a18c0b4b83f97323bbb61fa8301d38e5084adf` (main rehearsal `69800c05`): one coalesced follow-up repository read after overlapping activity completion, scope/close fence retained. 27 local checks; `docs/ops/imp-c01-activity-refresh-20261103/HANDOFF.md`. Not a new downstream Results→Review→Save E2E.
- **Documents** pagination `2732aa908aff8fdafbfac9851a82f0a06a9f1a33`: stale inventory handlers rejected before reader/epoch mutations; writer RED2→32 GREEN. Independent NO_BLOCKER review `11551eba`, `docs/ops/import-documents-pagination-review-20261103/REVIEW.json` in `/Users/xoery/Project/otr-mobile-import/root-import-documents-review-20261103`. No actual new-Batch Documents/device acceptance implied.
- **Updates**: build126.15 receipt distinguishes submission timestamp from event/update timestamp and restores the same retained Batch. Current software preserves lightweight Task observations when optional detail reads fail; source filename/TEXT label metadata is presentation only. See `docs/ops/import-updates-main-20261103/HANDOFF.md`. Older source-lane126.14 actual acceptance does not prove current-main device parity.
- **503**: restored continuous503 guard (`8e9fb27b`; `docs/ops/import-reviewed-fixes-main-20261103/HANDOFF.md`) retains original Batch/Task uncertainty and does not prepare/resume/execute on ambiguous Context503. Historical **Nov1 first Photo503 remains OPEN_UNPROVEN**: sanitized logs omit requestId/error detail and route bucket cannot distinguish Context GET from per-Task Results. Separate Nov3 expired binary-read finding is not promoted to that root cause. Existing P6 same-Task recovery PASS does not prove Photo failure resolved.
- Normal Auth verify-only candidate `020112a525924cbd50a0efc88fda4753e02c3f8a` is fixed. Root performed the safe existing-session GET before freeze; that older verification receipt is not a new qualification or proof that a later refresh was independently reverified. Adapter review: independent NO_BLOCKER `/private/tmp/otr-import-normal-auth-verify-review-20261103/REVIEW.json`, SHA `c6d56b23973f3408e1f8f28f0afd835667f43e707b8f812086daec8c10219632`. It is not Source/Provider authorization and grants no future execute permission.

## Evidence integrity / retrieval

SHA-256 values below were read locally at handoff; they identify evidence documents, not new runtime measurements.

| Evidence path | SHA-256 |
|---|---|
| P1 server JSON above | `f8b677ee33693b410141ac5c5df48ed227ee7f9d18e47bfe58cd42ed4ec85d9b` |
| P2 result MD above | `79ee01fa21d2aa76fe915cad8990b091c3ad8c939b0b5e4579fb352ea5343f7c` |
| P3 result MD above | `9b9c2d44ca2b6d37af2ee1a420772fc153030f780478d551e50490765b398b3b` |
| P4 result MD above | `d35a3bc5c935e700d91b1caedb00759d50939a8cd42974ef043f95ce057e80a3` |
| P5 result MD above | `99de66811a725a5118be7f439ca8883b282cdf13d90ba550032a2e315642db85` |
| P6 result MD above | `bda23dc391b6a0591dced78bb0fa08ba49b34551aed3ef5a095438083aff8215` |
| `docs/ops/import-beta-20261103/evidence/native-readonly-12615/READBACK.json` | `e6165b25cc467e69a8d891482f056c240e9076fa2e25c58ffc2444947362c95e` |
| `docs/ops/photo-first-cold-503-20261103/FIRST_FAILURE_RECONCILIATION.json` | `3e9b3b0e87629a951d87cc7cc381970365860ee34b30e795abcdf6485c0a0d7d` |

PDF receipt is **not in this main snapshot**: Git object `db1729bf3edbc47113b46253557034a70efc8591:docs/ops/universal-product-20261028/PDF_MINIMUM_FORMAL_SAVE_NATIVE_E2E.json`; observed source worktree `/Users/xoery/.codex/worktrees/universal-product-20261028/otr-mobile-canonical`; receipt file SHA `8a21eb38709e2c7aff16e5c9d2c69df3f98c02c852f711c20bf15410d7cbcc82`. Its historical runtime/image are not current deployment pins.

Unchecked at freeze: new-batch PNG/PDF/P3 paid execution, current-main device path and fresh post-Save Documents/Updates/cold recovery. No claim of zero UNKNOWN cost, no replay permission, and no standing model qualification.

## Fresh read-only handoff observations

`evidence/HOST_AND_TASKS.json` (09:38Z), `PG_SCHEMA_AND_SOURCE.json` (09:31Z), `FORMAL_ASSOCIATIONS.json` (09:43Z) and corrected `PROVIDER_CURRENT.json` (09:47Z) record the actual DEV identity, scoped task/attempt metadata, Source guard fingerprints, formal Source-to-Item associations and expired qualifications. These are reads, not E2E or authority changes. The migration ledger has68 entries/max20261004000300; later protected function patches are outside that ledger. Backend task SQLite is74; do not use that as the Native schema version.

Historical PDF and PNG receipts have portable exact copies in `evidence/`, with source Git object and hash in ARTIFACT_MANIFEST. Current-main installed Native binary/JS parity and draft cold persistence were not checked. Raw stale RUNNING/PENDING tasks are preserved exactly; they do not authorize a live attempt or paid replay.
