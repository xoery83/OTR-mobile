# Ledger Workspace Recovery Integration

Date: 2026-09-15
Shared base: `a6fc9f34de7970e4f388518d80832d8746f0ef1b`

## Recovery evidence

- Safety snapshot: `/private/tmp/otr-ledger-recovery.Zr0wIh`
- P1-P6 recovery commit: `956cda7f7bf609f9ebe2fa04d4fe8af3085bea11`
- Replay/Settlement recovery commit: `1fd9d04ab22444ed52eb295bcdbceef0b8ce17eb`
- Integration branch: `integration/ledger-polish-canonical`

Both source workspaces were left byte-for-byte unchanged. The recovery commits were
created with alternate Git indexes and verified against the safety manifests for all
63 P1-P6 paths and all 69 main-project paths.

## Differently changed files

| File                                                | Integration decision                                                                                                                                                                                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app/(tabs)/expenses/_layout.tsx`                   | P6 supplied the route hierarchy; retained P5 Adjustment, Statement, Settings and focused Review routes plus P6 Developer Diagnostics naming. The later main version had no additional route.                                                                                         |
| `app/(tabs)/expenses/new.tsx`                       | P6 supplied the real P4 `LedgerExpenseEntryScreen`; the superseded pre-P4 main form was not restored.                                                                                                                                                                                |
| `app/(tabs)/expenses/rate.tsx`                      | P6 redirect to the unified P4 form retained; the superseded standalone main form route was not restored.                                                                                                                                                                             |
| `app/(tabs)/expenses/split.tsx`                     | P6 redirect to the unified P4 form retained; the superseded standalone main form route was not restored.                                                                                                                                                                             |
| `app/(tabs)/expenses/transfer/[id].tsx`             | P6 `TransferDetailScreen` architecture retained. Main supplied persisted UUID validation; integration additionally requires a Journey UUID and passes only validated values to focused detail. Invalid context renders focused not-found, never the Settlement overview.             |
| `docs/CURRENT_IMPLEMENTATION_STATE.md`              | P6 chronology retained; main supplied Replay recovery/protection and Settlement fixture completion. Stale installed-build and next-checkpoint wording was corrected for the canonical integration.                                                                                   |
| `package.json`                                      | P6 supplied `@react-native-community/datetimepicker`; main supplied Replay recovery, UI Polish fixture and Settlement fixture commands. Both are retained.                                                                                                                           |
| `src/data/repositories/ledgerReadRepository.ts`     | P6 supplied `listHouseholds`; main supplied Household id/share metadata on `listMembers`. Both query paths are retained.                                                                                                                                                             |
| `src/domain/architectureBoundary.test.ts`           | P6 supplied the strict normal-runtime prototype exclusion. Main supplied the focused-transfer boundary; it was adapted to assert validated params, P5 detail ownership and no Settlement-overview fallback. Replay guards remain covered by their dedicated repository/worker tests. |
| `src/features/ledger/LedgerAnalysisScreen.tsx`      | P6 end state retained. Main P1 projection/date behavior is already incorporated; no later fixture-specific hunk existed.                                                                                                                                                             |
| `src/features/ledger/LedgerExpenseDetailScreen.tsx` | P6 end state retained, including P4 detail and P6 accessibility. Main P1 participation/date behavior is already incorporated.                                                                                                                                                        |
| `src/features/ledger/LedgerSearchScreen.tsx`        | P6 end state retained, including P3 shared results, pagination/filter state and P6 accessibility. Main P1 debounce/projection behavior is already incorporated.                                                                                                                      |
| `src/features/ledger/LedgerStage6Screen.tsx`        | P6 Dashboard is authoritative. Main P1 atomic projection is already incorporated; the stale pre-P2 controls and toolbar were not restored.                                                                                                                                           |
| `src/features/ledger/MyLedgerScreen.tsx`            | P6 end state retained. Main P1 cached-first/date behavior is already incorporated.                                                                                                                                                                                                   |
| `src/features/ledger/SettlementReadinessScreen.tsx` | P6 transfer-first Settlement overview retained. Main's later focused filtering was moved to P5 `TransferDetailScreen`; the old whole-page implementation was not restored.                                                                                                           |
| `src/hooks/useReceiptCapture.ts`                    | P6 P4 receipt/OCR-intent flow retained. It already carries explicit Journey context, preserving the valid main correction without restoring the older capture implementation.                                                                                                        |

## Intentionally superseded main-only files

The recovery branch permanently preserves these files, but the canonical runtime does
not restore them because P4 replaced them and no current route imports them:

- `src/domain/ledger/expenseDraft.ts`
- `src/domain/ledger/expenseDraft.test.ts`
- `src/features/ledger/LedgerExpenseFormScreen.tsx`
- `src/hooks/useLedgerExpenseForm.ts`

Their approved behavior is represented by P4's
`src/features/ledger/LedgerExpenseEntryScreen.tsx` and
`src/features/ledger/expenseDraft.ts`. Restoring both implementations would recreate
the divergent pre-P4 form path.

## Preservation result

- P1-P6 product behavior uses the accepted P6 source as its baseline.
- Prototype-disabled Metro resolution and the runtime architecture guard are present.
- Active and retired Replay exact-ID guards remain at repository, coordinator and
  queued-worker boundaries.
- UI Polish and Settlement fixture scripts, migrations, Backend support, tests and
  acceptance evidence are present.
- No Hosted Dev or Production mutation occurred during integration.
- No Release was installed during integration.
- Final verification passed TypeScript, ESLint, 64 test files / 215 tests, the focused
  23-file / 62-test recovery suite, prototype-disabled Expo export and a non-signing
  Release Simulator build.
- The Expo export bundle SHA-256 is
  `f3182a31a07c6cc8dd1bc5858b785c0c441db7fa7321549b9efc6b05644b619b`; the native
  Release `main.jsbundle` SHA-256 is
  `e836bc0ad4a69077c8be736195c05c342822e676198d7b6d7944135caced566a`.
