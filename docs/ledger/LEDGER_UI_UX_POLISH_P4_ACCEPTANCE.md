# Ledger UI/UX Polish P4 Acceptance

Date: 2026-09-15  
Status: implementation complete; physical-iPhone acceptance passed except direct
VoiceOver navigation/audio confirmation; P4 is not yet fully accepted

## Delivered

- `/expenses/new` is a real repository-backed create/edit flow. The initial Add
  Expense screen offers Add manually and Scan receipt without creating a financial
  record.
- Manual entry uses the approved short hierarchy, current-member/Journey defaults,
  native date picker, searchable existing ISO currency metadata, virtualized member
  selection, compact split summary, explicit settlement confirmation, and progressive
  category/attachment/Notes disclosure.
- The split sheet delegates all five existing modes to the existing Ledger allocation
  functions. Missing Household data disables Household modes; exact totals and the
  existing deterministic residual behavior are preserved.
- Existing Expense datetime, participant/split snapshots, valuation, and business
  status remain unchanged when their related fields are not edited.
- Receipt capture stores the asset in app-owned durable storage first. Scan receipt
  explicitly queues OCR; manual attachment explicitly does not. OCR results remain
  editable suggestions and OCR failure can continue through the same manual form.
- Local Save still uses the real Expense repository/durable queue, prevents duplicate
  submission, returns to detail promptly, and shows “Saved on this iPhone—will sync.”
- Expense detail now exposes payer, date, category, Notes, receipt count, and existing
  split/valuation/settlement information without healthy raw lifecycle states.

## Validation

- TypeScript and ESLint pass.
- All 58 test files / 203 tests pass, including Stage 3/4/5/6/9 regressions,
  architecture boundaries, repository writes/sync, receipt workers, supported money
  scales, and allocation rules.
- Focused P4 tests cover explicit OCR intent, safe large-money parsing, exact and
  percentage validation, and Household different-size, partial, missing-data, and
  deterministic-residual cases.
- iOS Expo export passes. CocoaPods autolinks `RNDateTimePicker` 9.1.0 and the arm64
  iPhone 17 Pro Release Simulator build succeeds.
- Release Simulator against Europe 2026 UI Polish visibly opens the intent page,
  repository-backed manual defaults, and an existing Edit Expense. The original
  unavailable placeholder does not appear. Opening the intent page leaves the local
  Expense count unchanged at 134 before and after.
- The Stage 10 prototype-removability guard passes. Normal `app`/`src` runtime has no
  import of `ledger-prototype`, `LedgerPrototypeProvider`, or `QuickExpenseScreen`.

## Physical iPhone Acceptance

The signed Release build was installed over the existing app on Leon's iPhone 16 Pro
(iOS 26.6), preserving SQLite and app-owned receipt files.

- Add Expense showed Add manually and Scan receipt. Opening either path left the
  Expense count unchanged. Manual entry covered amount focus, currency, title, native
  date, payer, participants, split summary/modes, More Details, Save and Cancel.
- Camera permission/capture returned to OTR with the captured asset attached. Photo
  Library and Files returned correctly; image and PDF assets persisted in app-owned
  storage. Scan intent queued upload plus OCR, while manual attachment queued upload
  plus link and no OCR.
- Offline manual Save returned promptly to detail with understandable on-device /
  queued-sync wording. The saved draft and attachment remained present across Release
  reinstall/restart. A rapid double Save produced one logical Expense after the guard
  below; no duplicate was created.
- Maximum Accessibility Dynamic Type was tested using the real system setting. The
  intent chooser, amount/currency/title/date/payer/participants/split/More Details,
  multilingual member rows, exact allocations, settlement confirmation and OCR review
  remained reachable after the targeted fixes below. Financial amounts remain large
  and readable without horizontal clipping. The original system text setting was
  restored afterward.
- Sheet detents, keyboard dismissal, back/cancel, dirty-dismiss confirmation, tap
  targets and transitions were exercised. App-owned camera/photo/PDF assets survived
  the handoffs and repeated Release installs.
- Final read-only device verification reported `integrity_check = ok`, 349 Expenses
  and 12 receipt assets. Dynamic Type, VoiceOver setup and navigation-only checks did
  not add another Expense.

### Narrow Device Fixes

- Dirty header Cancel now presents the discard confirmation explicitly instead of
  relying on a navigation interception that `router.back()` bypassed on device.
- Save now has a synchronous ref guard, preventing a same-frame double tap from
  entering two SQLite transactions.
- The intent chooser is scrollable at Accessibility text sizes. Expense key/value rows
  and exact-allocation rows stack at large text; sheet/header actions stay reachable;
  long allocation names reflow; critical amount text is capped at 2x rather than being
  clipped. The settlement exclusion message was shortened without changing semantics.
- Participant and split-mode rows now expose their selected/disabled state to assistive
  technology.

## Remaining Device Acceptance

Direct VoiceOver navigation and spoken-output confirmation remains open. VoiceOver was
enabled on the physical iPhone, but iPhone Mirroring automatically disabled it when
remote interaction continued; the mirrored accessibility tree also does not expose
iPhone app elements or spoken output. Labels, roles, source order and selected/disabled
state were inspected, but that is not a substitute for listening and navigating on the
unmirrored device. P4 must not be marked fully accepted until a person completes the
requested direct-device VoiceOver spot-check.

## Deliberate Gaps

- There is no persisted Ledger Settings split default, so new Expenses use the
  existing safest domain default, `EQUAL_PERSON`.
- There is no approved recent-currency preference source, so Journey settlement
  currency is the unambiguous default.
- No trustworthy Activity repository query currently exists. P4 does not invent an
  Activity timeline; adding the read model remains separate future scope.
- Household CRUD, title-based category inference, Backend/schema changes, P5, and P6
  remain out of scope.

No P5/P6 work or Backend/schema/domain-semantic change was started.
