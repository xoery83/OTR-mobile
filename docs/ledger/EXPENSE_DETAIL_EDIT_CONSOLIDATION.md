# Expense Detail & Edit Consolidation

Approved owner specification, 2026-09-28. Scope: Expense Detail/Edit only;
concurrent Settlement review, estimates, confirmation and sync work is excluded.
No OCR/parser, backend, schema, Production or dependency changes.

## Read-only safety audit

- Backend PUT/DELETE Expense uses the same `canWriteTrip` contract: Journey
  owner and linked group member (plus existing legacy membership compatibility).
  Creator/payer alone is not authorization; no field-specific edit permission
  exists. Cached actor role is the offline equivalent. Existing Detail incorrectly
  exposed Edit to every unlocked reader; Edit had no route authorization gate.
- Expense repository already provides `tombstoneExpense`, `PENDING_DELETE`,
  audit events, revisioned durable delete with causal-create dependency, and
  restore. Backend preserves aggregate references and adds a DELETED audit event;
  finalized Settlement inputs are protected by a database trigger. Splits,
  valuation/audit history and receipt assets are retained; active projections
  omit deleted Expenses. Review is reevaluated by the existing backend mutation.
  Frozen history is retained. No cloud object deletion occurs on Expense delete.
- Receipt removal is local `deleted_at` plus account-owned `DELETE_RECEIPT`.
  Server tombstones retain stored bytes. Existing receipt worker blocks replacement
  upload until pending receipt deletion completes, preserving server max-three.
- Edit currently does not load linked receipts and imports additions immediately.
  Fix with an in-memory intended attachment set; Save commits Expense update,
  staged tombstones and prepared additions in one SQLite transaction. Cancel only
  cleans new temporary files. Concurrent revision/attachment changes reject Save.
- “Something looks wrong” raises a HUMAN Expense Finding in Review using a
  server revision. It is not a correction request or automatic financial edit.
- Edit already uses the New Expense form including currency/category/date,
  complete Sharing/Exact allocator and Notes. Reuse it. Extract attachment rows
  and preview for New/Edit/Detail; authenticated byte verification stays in the
  existing receipt operation. PDF uses native Quick Look; images support zoom
  and explicit navigation. Existing Expense never offers OCR.

## UI contract

Detail: authorized header Edit icon; title/category/date; one Amount module;
cross-currency Journey amount with an information sheet retaining current FX
functionality; inline read-only Sharing with canonical original shares; Notes
and attachments in Details; compact capacity-bound Add; secondary Add to Review.
No normal payer evidence, attachment diagnostics/removal or direct sharing edits.
Edit: Cancel/Edit Expense/Save, accepted shared form, existing plus new attachments,
staged removals/replacement capacity, and confirmed bottom Delete Expense.

## Storage lifecycle

ACTIVE → TOMBSTONED → retention → purge eligible → physical purge is a future
storage lifecycle slice. This change defines no retention duration or restore
promise, and implements no physical purge.

## Acceptance

Implemented with no backend/schema/dependency changes. Fourteen focused suites /
119 tests passed, including real SQLite replacement, transaction rollback,
stale revision/attachment rejection, capacity/foreign removal, retained references
on tombstone, offline writer permission and finalized protection. TypeScript,
affected ESLint, Prettier and diff checks passed. Signed iOS Release build and
macOS signature verification passed. Artifact:
`/private/tmp/otr-expense-detail-edit-build/Build/Products/Release-iphoneos/OTRMobile.app`.
The physical artifact predates the final PDF-preview fix and is not installed.
Latest signed Simulator Release was built, installed and launched on iPhone 17 Pro
/ iOS 26.5, preserving cached accounts and data. No physical-device access,
Expense Save/Delete, commit or push was performed.

Full regression: 136 suites / 929 tests passed; two pre-existing/out-of-scope
failures remain: Account Switching Foundation imports React Native Flow into the
Node test runner, and LedgerStage6Screen directly imports API/sync infrastructure.
The latter belongs to the concurrent Settlement work and was left unchanged.
Detail's existing direct sync import now goes through the operation facade.
Edit unsaved temporary files are intentionally not recoverable as New Expense
attachments after a crash; retained draft orphan cleanup remains future lifecycle
work. Physical-device work remains deferred at the owner’s request.

Simulator acceptance passed: same-currency single amount; cross-currency original
plus Journey amount; inline Sharing expansion/collapse and canonical share totals;
FX sheet Done; authenticated image download, fullscreen preview and Close; native
PDF preview and Close; existing attachments in Edit; staged removal leaves the
SQLite receipt active, Cancel/Discard restores the unchanged attachment; capacity
source sheet; Delete confirmation/Cancel; finalized Expense omits Edit.
The native PDF helper now accepts only the existing draft/receipt directories and
a dedicated verified-download preview cache (symlinks resolved). OCR is unchanged.
Final PDF fix: six focused suites / 57 tests, TypeScript, scoped ESLint and signed
Simulator Release passed. UI runs used existing Dev fixtures, without financial
writes or confirmed deletion.

Remaining native gates: large text, image pinch/pan and multi-image navigation,
add/Cancel preservation, Save replacement offline/restart/reconnect, unauthorized
direct Edit rejection, and confirmed Expense tombstone. Repository transaction,
permission and retained-reference checks passed; these native mutation scenarios
were not exercised. Physical-device acceptance is deferred.

## Owner presentation follow-up — 2026-09-28

Rate information icon follows the Journey amount; both amount rows reserve the
same line height. Rate details uses New Expense’s LedgerSheetHeader and a compact
bottom panel that grows with content. Estimated values show the pair/rate, source
date and display-only meaning of ≈. Sharing separates payer and split summary
onto two lines; expanded shares omit repeated payer and total. Receipt upload
diagnostics are removed from Detail, including debug mode. No financial handlers
or settlement code changed.

Read-only Simulator inspection of `ce SHi22`: economic date 2026-09-27 (Sunday),
RATE_REQUIRED; local Journey quotes reach 2026-09-24 (USD/NZD 1.7638), while
reference snapshots include 2026-09-25. loadDisplayEstimates currently prefers
Journey displayEstimate over snapshotDisplayEstimate, explaining the 24th-date
estimate. This precedence belongs to the concurrent FX/Settlement work and was
not changed. ECB publishes on working days, so no Sunday reference is expected.
The ≈ marker means a display estimate without a recorded valuation, not an
assertion that historical reference data is inaccurate.

Four focused suites / 30 tests, TypeScript, scoped lint, formatting and signed
Simulator build passed. Simulator verified payer/split line break, individual
shares without duplicated payer/total, hidden diagnostics and compact matching
Close/Rate details/Done header. Physical device was not used.
