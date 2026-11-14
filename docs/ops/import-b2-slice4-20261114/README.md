# Import V3 B2 Slice 4 — Results & Return

14 November 2026. Baseline `72c020e`, local branch `codex/import-v3-local-first`.
Scope: presentation and normal navigation only. No Backend/SQL/permissions change,
new Provider request, Analyze, Confirm or business Save. No merge/push.

## Delivered

- Existing review owner reads the exact original operation IDs and immutable
  receipts, including reconciled commands. The pure Activity projection groups by
  accepted Item identity; candidates and Documents are never counted as new Items.
- Created requires a successful receipt naming the created Item. Linked requires
  the successful association receipt and accepted active links. Updated is shown
  only for an actual supported text update receipt. No new automatic UPDATE.
- Association pending, saving, UNKNOWN, rejected and conflict remain distinct.
  A sibling successful link cannot hide a missing original receipt. ABSTAIN retains
  originals and is not Save Failed. Needs Review does not hide other saved results.
- The default Activity shows object titles/types, receipt times, actual result
  groups and navigation. Internal candidate/command details remain under existing
  Processing Details. No repeated per-candidate polling control.
- Result Item opens existing P1–P6 Details; original opens through the existing
  ACL/digest-checked Item original reader. Day/Trip contextual Back to Results
  reopens the exact job through normal Import entry. This explicitly avoids relying
  on the reused Trip route's back stack. Scroll offsets are retained per job in the
  existing account-scoped in-memory Capture lifetime and cleared on account change;
  after process death the same Batch/results recover, not a promised pixel offset.

## Verification and limits

**Full App Simulator + existing real DEV receipts:** automatic Batch `8b3ca4ad…`
(job `23bec76c…`, 00:22:34) displays Created 1 Gallery, Linked 1 AA1302,
Needs Review 1 missing-date suggestion, Not Created 1 ABSTAIN. Normal Item Details,
associated text original and Day Feed opened. Day Feed Back to Results reopens the
same timestamp/job and the same counts. App was terminated by in-place replacement
and relaunched with its original Session, SQLite, Queue and originals preserved;
results recovered through normal Recent submissions. No physical iPad claim.

The fixture is the existing temporary synthetic Provider seam outside product
source, with normal real DEV Auth/Core/readback. This is **not a new real Provider
E2E**. Historical B1 and QA179 were not replayed. No new business objects were made
for screenshots. Existing development Batch `1e256ac9…` has four suggestions resolving
to three unique Items; its accepted Slice 3 evidence is reused, not re-saved.

**Read-only independent PostgreSQL:** `independent-dev-readback.json` confirms
4 Items, 2 LOCAL_ONLY Documents, 5 unique active links and 12 APPLIED receipts in
this Trip; receipt hashes match Slice 3. **Local cold readback:**
`cold-recovery-readback.json` confirms those counts, all 31 retained local receipt
hashes unchanged, and all three synthetic dispatch counts still exactly one.
Real DeepSeek calls this slice: **0**.

**Targeted tests:** six files, 101 tests cover object-identity deduplication,
multiple Documents/one Item, partial associations, UNKNOWN/original-ID preservation,
rejected/conflict/update receipts, cross-Actor/Trip rejection, deterministic cold
projection, exact reconciled command reads and Details navigation. No new Saves.
Partial/UNKNOWN/failure/update variants are isolated projection checks, not claimed
new DEV business writes. Existing real mixed saved + Review + ABSTAIN is shown in App.
UI guard passes. Changed UI lint has no errors (existing CaptureContent `require`
warning). Whole-repo typecheck still has the same three unrelated baseline errors:
two fixture `presentationTier` errors and missing browser `react-dom/client` types.

## Copy → authority

| User result | Required fact |
| --- | --- |
| Created · N | N unique readable Item IDs in successful receipt `result.created` |
| Linked · N | Unique readable existing targets + successful original association receipt + active links |
| Updated · N | Successful supported update receipt actually changes target Item |
| Needs Review | Existing planner conflict/missing fact or formal conflict; no fake failure |
| Not created | ABSTAIN; originals retained |
| Association pending / Saving | Item may exist; required original relation/receipt not all verified |
| Status uncertain | UNKNOWN original operation; no automatic resubmit |
| Save failed | Actual rejected receipt; existing processing/recovery path retained |

## Evidence / next boundary

`screenshots/results-final.png`, `results-returned-same-batch.png`,
`item-details.png`, `document-original.png`, `day-feed-return.png` and
`slice3-vs-slice4.png` are actual complete-App screenshots or a labelled composition
of them. Readback JSON contains selected synthetic IDs/receipt hashes, no credentials.

Normal DEV receipt/snapshot reads can still take tens of seconds. Activity truthfully
shows checking until readback resolves; this slice does not redesign that performance.
Full Documents/Inbox/Detail product UX remains Slice 5; historical Activity/Updates
and broader navigation remain Slice 6. No new result database/engine or infrastructure.

**STOP for Owner Slice 4 review. Do not start Slice 5/6.**
