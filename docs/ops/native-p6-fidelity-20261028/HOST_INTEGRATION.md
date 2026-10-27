# P6 serial host integration — 28 October 2026

Base Native `2253dc340a4ee03d9b0751eae486188ceaad5c11`; branch `codex/native-p6-activity-integration`, isolated `/private/tmp/otr-native-p6-20261028`. Parent worktree was not modified.

## Parent intake order

1. `557f5a8b`: canonical P6 Form + existing Manual Repository adapter (replay of `9d11859a`).
2. `646bfe33`: frozen final P6 content/Details/fixture (replay of `40f5ac16`).
3. `5785d680`: actual P6 Manual Batch owning port + real SQLite tests (replay of authorized `e1270e219068a99745baee189bf8fe624ff41ab4`).
4. Final host integration commit containing this receipt: chooser/Reader/Home/Details callbacks + directed tests. Do not separately apply its bundled `HOST_UI_INTEGRATION.patch` after cherry-picking; that artifact is an alternative host product diff against2253.

## Covered callers

- Activity chooser enables only existing P6 editor, passes exact Trip/date/range/generation and top form Save/Cancel. Flexible remains unavailable.
- Pending local Reader renders actual Core Activity facts, preserves START/END identity, Focus and both insert intents. No second Event/Reader/clock authority.
- Accepted Core renderer routes Details and insert intents by original item/occurrence/date; wrong Trip/revision/hidden facts withheld.
- Home fresh scope/epoch/revision check precedes direct native P6 Details. NTC/floating facts do not require borrowed presentation timezone. Hidden/cancelled/skipped items refused. Existing generic inline Home overlay tests remain on P5; P6 direct route has dedicated positive/negative tests.
- Native Details performs a fresh owning read and binds Edit only to lawful Repository draft. Same-ID Edit/Save rereads current data. Legacy inline Edit family list remains P1–P5, preventing P6 fallback to P1.
- Core temporal ordering, shared Day Shell/windowing/chrome and parent P1 Focus fix are unchanged. `src/ui/forms.tsx` equals base2253, preserving UiFormRow trailing fix. DEV-only P6 fixture route follows existing release guard.

## Validation

18 suites488 assertions PASS, covering actual P1–P6/shared Core Repository regressions, Form/Details/final fixture content, canonical controls, chooser, P1/P5/P6 Focus, Home and real local/accepted P6 action routing. Log `/private/tmp/p6-integrated-final-tests.log` records the combined18 suites488PASS run. TypeScript noEmit, UI guard and scoped ESLint PASS; no added dependency, Backend, Schema, Auth, Import or device operations.

## Limits

No Native Vision/device or Cloud E2E claim. Package43 Native acceptance rows stay NOT_TESTED. Entry/Meeting independent time/required metadata, Contact/provenance and actual Ticket/Voucher/Booking/custody/Media/Ledger links require their existing unique Owning ports; no fake fields, photos, seats, totals, scan buttons or cloud permission were added. Add Expense forwards TripId/date/name; unsupported footer capabilities remain disabled and empty modules hidden.
