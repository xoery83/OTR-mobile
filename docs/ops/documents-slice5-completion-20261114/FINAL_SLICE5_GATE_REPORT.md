# Final Slice5 finite acceptance gate — 2026-11-14

Inspected entry candidate: `1342ee57`. Final product: `07c3200b1bccf4cce386b508c162b6e39e4359e4`. Documentation commits may advance HEAD without changing this product tree. No Main merge/push.

## Verdict

**GO for Owner review of the bounded Slice5 read/local UX closure. Documents overall remains PARTIAL.** The device-input acceptance gaps were closed; no environment-only Merge Waiver is needed. This is not approval to ship all Documents business commands, complete Slice6, or release Beta.

## Actual final full-App acceptance

Primary: existing iPhone16Pro Simulator, normal DEV login, complete signed Release App. No standalone Harness or temporary UI route. Staging comparison covers1169 non-test product files, zero mismatches; final binary/JS/plist hashes are in `final-gate/slice5-gate-final-artifact.json`.

| Required check | Actual result on07c3200b |
|---|---|
| Upward scroll hides top chrome, only filter row remains | PASS. Actual device drag hides header/tabs/Trip selector; filter row stays pinned. |
| Native Export and original content | PASS. Real iOS Share Sheet shows Travel details.pdf,950bytes. Export SHA256 `badf69a3f4607d9a7bb25da9847e38f57d76cd4a9fa98865190d8ce0d3c8e6da` matches original; actual PDF content opens. Export temporary directory empty after dismissal. No external destination selected. |
| More than30 documents / paging | PASS. Normal directory initially30 with More=true, scroll loads32 unique records, More=false. Final two records are genuinely loaded, not a static32-row fixture list. |
| List return position | PASS. File Information and Document Detail round trips preserve32 loaded records and collapsed chrome. Before/after screenshots show the same Fixture11→02 viewport; no jump to top. |
| File Information button independently clickable | PASS. Separate sibling button opens native information sheet for actual PDF. |
| Document row independently clickable | PASS. Row opens standalone Detail; it does not activate information modal. |

Screenshots under `final-gate/screenshots/` are actual current07c3200b App captures: PDF information, Share Sheet, PDF content, and pagination before/after return. Older Batch/Item/cold-recovery evidence remains versioned in README; it is not relabeled as fresh07 runtime evidence. iPad retains0302; no07 iPad/physical-device PASS claimed.

## Actual defects repaired

- `ed00cdd3`: positive content offset must collapse chrome even if a platform scroll event lacks the dragging flag. Zero-offset inset resets alone must not reopen it. Two regression assertions added.
- `07c3200b`: removed two obsolete forced-expand calls before opening row/File Information. The standalone Detail owns its own header; expanding the source directory displaced the return viewport.

Compared with1342, product changes are only `DocumentsScreen.tsx`, `documentListPresentation.ts`, `documentListPresentation.test.ts`:4 additions/3 deletions. No authority, data model or layout workaround for test tooling.

## Device input and test data provenance

Fresh DeviceHub binding/window activation and screenshot-coordinate gestures now work. An earlier half-coordinate explanation was not established: delayed UI changes made that hypothesis unreliable; final successful gestures used the actual screenshot coordinate space. The original noWindowsAvailable cause remains UNKNOWN. No new automation framework or product controls were introduced.

To reach a real cursor boundary,32 clearly named private TXT captures were prepared through the existing authenticated LocalCaptureInbox Repository intake, with real bytes/hashes. A one-off staging preparation effect was removed, source checked byte-for-byte, and the normal full App rebuilt before final acceptance. No direct SQLite write, session/Keychain/SQLite copy, Analyze, Core Save or fake Receipt was used. The32 local test captures remain for reproducibility; they are not32 new Trip Items. Dataset IDs/hashes are retained in the evidence file.

Existing canonical counts remain9Documents/14links; existing account queue13 and iPad queue33. Read-only final preservation verifies iPhone9/9 and iPad30/30 baseline private files byte-identical; counts in `final-gate/slice5-gate-final-preservation.json`. The iPad's original data and App were not replaced for this phone gate.

## Verification and scope

Final owning tests41/41 in3files PASS; scoped lint PASS; UI guard177 PASS with473 unchanged legacy findings. Full signed Native Release build PASS. Earlier unchanged90/7 data/export checks are historical evidence, not a new07 run. Full test suite/typecheck was not repeated;3 known Main type errors remain the documented baseline.

| Classification | Final status |
|---|---|
| Implemented and accepted in this finite run | Collapse/pinned filters; native Export/bytes;30→32 cursor paging/return; independent row/FileInfo. Other unchanged Slice5 functionality retains explicitly versioned prior evidence. |
| Implemented but environment-blocked | None of the three requested phone checks remains blocked. Full physical-device, full role matrix, and current07 iPad runtime were not executed; no PASS claimed. |
| Formal owning business capabilities not implemented | Rename; Share/Private; Add/Move Trip; Safe Remove. See `DOCUMENT_OWNING_CAPABILITY_BACKLOG.md` for approved rules, exact current contract gaps, owner, Receipt/permission requirements, C04/Slice6 dependencies and minimal acceptance. These are NOT Cloud Sync deferral. |
| Owner-approved deferred | Document Cloud Sync; complete Slice6 Activity/Updates and full UPDATE outside this Slice5 boundary. No completion claim. |

No new Provider request, Analyze/Confirm/Save, SQL, sharedDEV/Production mutation, ACL/RLS/Grant change or second Document Writer. AuthC04's own worktree and interfaces were not modified. Main merge/push still requires Owner decision.
