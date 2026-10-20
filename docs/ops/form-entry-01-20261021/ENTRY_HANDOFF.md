# FORM-ENTRY-01 entry candidate

Source baseline: exact archive of `3423f2732abb70545cd938ebfd3b5d7c10b1e950`, with independent Git metadata in `/private/tmp/otr-form-entry-ui-20261021` because shared worktree Git metadata is outside writable roots. No served tree, device, Metro, schema, or Hosted changes.

Approved design: Part 1 `UI_BLUEPRINT.md` Step 2 and original `visual_references/02_image(20261018-054852).png`, preserved by Coordinator at `/private/tmp/otr-form-entry-01-20261021/sources/`. Plan/Flexible first row; Flight/Stay/Rental/Transport/Activity second row. Current capability: Plan, Stay, Rental and Transport use existing editors and canonical repositories. Flight is blocked by absent Local Manual Flight authority chain on this branch; Flexible and Activity by their owning writers. Disabled choices show localized reasons and cannot map to P1.

Both Home/Day Action Island retain the existing Quick Add Modal, expanding it to the shared type chooser and selected editor without presenting a second Modal or routing Day to Home. Home preparation Build uses the same chooser. A separate manual-save notification refreshes the current Trip reader once; Expense localOutcome remains Expense-only. No date/anchor/bookmark mutation on open/close. Editor default presentation and writer logic are unchanged; embedded editors register their existing dirty/saving-aware close handler for native host requests.

Automated checks: 10 scoped suites / 185 tests; TypeScript; UI guard (473 historical / 131 strict UI files); scoped ESLint (one existing require-style warning in Bottom Shell). Additional Quick Add tests cover same-host expansion, dismissal delegation, and account-change rejection; chooser tests cover order, four lawful editors, disabled paths, exact trip/date props and stale save.

Native: NOT RUN by Builder. Root owns serial Native operation and fixed-candidate loading. Required: Home/Day chooser, all type behavior, Cancel, a real P1 save/Day/Details and anchor retention. Native or Owner acceptance must not be inferred from automated tests.

Combination with Experience Chrome: shared Shell change is only Quick Add `key`/`onManualSaved` binding and useTripView destructure; TripScreen change is manualOutcome read/once-only refresh effect. Do not overwrite Experience material/header changes when combining.
