# Lane C Import — QA originals and recovery at V4 freeze

This is an evidence inventory, **not an execution runbook or authorization transfer**. Freeze and readiness are defined in `CURRENT_STATUS_AND_EVIDENCE.md`. No new Batch/model calls; Nov1 Source/Provider/Actor/price expiry remains effective. Gate94a was unused and is not delegated.

## Retained legal synthetic originals

Account `f4b059c5-8241-4ffb-aa15-37fa25474543`; Trip `825f79b2-4a9d-4535-a62e-43000ca50c4a` are historical QA identities, not credentials or proof of current authority. Read only the listed materials; do not derive source evidence from a Saved Item.

| Original | Existing location | Bytes / SHA-256 | Qualification boundary |
|---|---|---|---|
| `universal-photo-activity-qa.png` | `docs/ops/import-beta-20261103/owner-ux-preview/fixtures/` | 42,630 / `078de830361d65bb3890b43fb30646aa6e6ebfa7088a0f2dc4c7bd7b343fa515` | Synthetic retained PNG; at freeze selected as local draft only. Selection is not Source intake, PNG parse/paid qualification or fresh E2E. |
| `universal-p6-activity-qa.pdf` | Same fixture directory | 1,676 / `f58061aa535c7a5585c4c953890c5d387cf20656cca7129e36861beb82ee1758` | Historical exact-text PDF→derived text→P1 accepted slice; filename does not establish P6. Not scanned/encrypted/general PDF support. |
| `P3-Harbour-Beta-Hotel.txt` | `backend/src/__fixtures__/universal-product-beta/`; recovered copy `/private/tmp/otr-p3-form-renewal-20261102/input/P3-Harbour-Beta-Hotel.txt` | 93 / `a8606e596966709b999b28720d7428a14c97e05a80347666034036e4f75dfbce` | Original bytes recovered, not generated from Item. Future new Source input only if separately authorized; never old Source resurrection. |
| `P2-Sparse-NZ502.txt` | `backend/src/__fixtures__/universal-product-beta/` | 27 / `ef351c055fd062ebb61197c5cc73d3ad8c177a52b164246284f3f44124f99e7d` | Manifest fixture only; not the historical NZ501 accepted object. |
| `P4-Coastline-Beta-Rental.txt` | Same TXT directory | 108 / `df23abfb3076ad0550d5808cdbb042ccf0d83dcb5ad612b8a7c5d9365a4db079` | Manifest fixture; do not equate to historical formal-Save Source. |
| `P5-Coastal-Beta-Train.txt` | Same TXT directory | 146 / `fe30037884d999ed28847422a0efb745cca13bf878e38d3a2fb42222865e70e9` | Manifest fixture differs from historical143B P5 input. |
| `P6-Harbour-Beta-Activity.txt` | Same TXT directory | 83 / `71726c3289091568935f1aa188689cf57fc7ca56dde0c1e144739db0c30cdb5f` | Manifest fixture differs from historical81B P6 input. |

TXT manifest: `docs/ops/universal-product-20261028/MULTI_SOURCE_MINIMUMS_FIXTURES.json`, original creation commit `9c4136e60677edb6a60e31b1b2f34ac59f29b3ea`; archive SHA recorded there `040402979a4024fd914f7f2d34997958e7a3f233e932903a1205bf451b51920c`. P3 recovery compared tracked original bytes and manifest hash, with sibling `.provenance.json` in the temporary input directory. Archive itself was not reconstructed or requalified. Manifest status is FIXTURES_ONLY_NOT_INTERPRETED_OR_ADMITTED; expected family is not model evidence.

## Retained read/recovery evidence

- Historical P1 completed-Source recovery: `docs/ops/universal-product-20261028/CONTINUOUS_PRODUCT_P1_COMPLETION_UI.json`, SHA `1a66cf30fb5e1b358d3382168e73412e719d24195a54d7b556a9994d95d13558`, fixed source `1513f44e68ab5fdea88229b87cce9a330e084c3b`. Build59 cold launch restored Batch `adc06db4-c06e-432a-b866-d4165f4c06f5`, Task `859445fb-12b7-8267-91c0-e0c09baf4bfb`, Item `9c8fe13e-0675-8795-acd7-c96561dccbd3`, readable original and disabled completed confirmation; zero new Provider calls/business writes. Different identities from the first P1 Save receipt.
- Build126.15 actual retained PNG route is documented in `docs/ops/import-beta-20261103/owner-ux-preview/README.md` and `../evidence/native-readonly-12615/READBACK.json` relative to that preview directory. Normal My Trips→same QA Trip→Updates→Batch794b02d7→Results/saved Itemc59d3d03→retained Quick Look→disabled duplicate controls→Updates passed. It was a fresh launch, **not an extra independent cold restart**; Documents/Inbox/Day were prior126.13/14 observations, not repeated126.15 checks. New interpretation/new Documents remained NOT_RUN_EXPIRED_AUTHORITY.
- Current frozen AD5 draft has no new Batch ID. Preserve Session and selected draft. Do not press Submit, Analyze or final Confirm under handoff permission. Root's read-only observation and freeze timestamp are recorded in the companion status document; no new device inspection was performed here.

## Recovery invariants for future separately authorized work

Existing owning readers may recover only their normally authorized Account/Trip/Batch/Task. An old Source receipt proves history; it does not issue new Source/Provider permission. Completed Results can remain readable without admitting another candidate or enabling duplicate Save. Existing controls preserve read-only completed/UNKNOWN review and original visibility.

A503, timeout or UNKNOWN is not NoCommit or zero cost. Keep original operation/request, Source/representation/Task and receipt references; use existing passive GET/recovery semantics, never a replacement Batch, regenerated request or automatic paid retry. Continuous Context503 guard rejects without Source preparation/resume/execute. Historical Nov1 first Photo503 root cause remains OPEN_UNPROVEN, even though a specific client regression and separate expired binary-read failure have local evidence. Do not infer original requestId from diagnosticId or neighboring logs.

For P3 Form Scan, one Native Form instance owns one frozen material intent/session. Different material/context after intake is a frozen-request mismatch, not a new session; UNKNOWN retains original references. Auth Account generation is independent of Form generation. Current live Form/Account/revision fences apply before IO consumption/review; missing facts do not clear fields, alternatives require explicit selection, Edit target requires explicit current confirmation, existing Manual Save owns persistence. After cancelled intake, a new signal cannot silently reopen the first source-opening closure; existing durable capture recovery owns incomplete intake. No feature-specific queue/upload/retry lifecycle is introduced.

Retained local-original attribution hints support authorized reads only. Missing originals/mixed attribution produce no hint; a server-only assignment requires the owning validated mapping, not invented local metadata. Do not use a read hint to dispatch interpretation or grant Save authority.

## Frozen candidate and safety references

Verify-only normal Auth binder candidate `020112a525924cbd50a0efc88fda4753e02c3f8a` remains fixed in `/Users/xoery/Project/otr-mobile-import/import-normal-auth-receipt-20261103`. Independent review `/private/tmp/otr-import-normal-auth-verify-review-20261103/REVIEW.json`, SHA `c6d56b23973f3408e1f8f28f0afd835667f43e707b8f812086daec8c10219632`. Its seven safe proof fields and normal `/user` verification are software contracts; neither a REFRESH receipt nor a successful verification can be relabelled as Source/Provider authority. Do not copy Vault/session credentials into handoff or rerun this candidate under inherited permission.

Prepared PNG/CP14/controller/close scripts and prior receipts stay immutable. No T/D is assigned by these documents; no clock, worker, timer, maintenance OPEN, Provider grant or Source scope is activated. Future Owner/Root must freshly decide exact scope and permissions; the next Agent receives evidence and code, not unused94a execution authority. Preserve operation/receipt/history and unknown-cost holds; never reset/uninstall, mutate SQLite or delete accepted data to recover a UI path.

Validation of this handoff: bounded local evidence reads and document hashes only. No new fixture extraction, model/parse qualification, E2E or runtime closure test. Temporary-path availability beyond this machine is not guaranteed; fixed Git objects/hashes identify portable evidence.

## Portable copies and actual retained state

The exact PDF/PNG/P3 TXT above now have portable copies under this package's `fixtures/`, with source/hash in `evidence/ARTIFACT_MANIFEST.json`. Prefer these copies over a temporary path. The specific selected device draft's bytes/hash have not been reread; UI filename/43KB does not establish the portable hash. Draft persistence across cold launch is unverified. Normal retained Runner session is `otr-import-imp-c01-ad5-20261103` on AD5 `AD5CCF33-5907-4BE4-8F6C-B6FB20F32C5A`, App `com.xoery.otrmobile`; do not close/reset/force another device claim to prepare the handoff.

`evidence/HOST_AND_TASKS.json` preserves actual scoped Task/Attempt rows. Among unresolved historical rows, Task2f0e37d8/Batcha3bfb120 and Taskea78041f/Batchf1533073 remain raw RUNNING; Task13792ae2/Batchd56f2cbc remains raw PENDING. Those labels are not proof of a live request, NoCommit or replay authority. Current published retained Task96ce2929/Batch794b02d7 and Task56d285da/Batchf6103897 are PUBLISHED. Full IDs and attempt/metering states remain in the receipt; no task was normalized/reset for handoff. `evidence/FORMAL_ASSOCIATIONS.json` independently fixes16 historical Source/Candidate/Slot/Item/Receipt relationships.
